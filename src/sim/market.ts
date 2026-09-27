import type { Company } from '../world/company';
import { INDUSTRIES } from '../world/industries';
import type { Rng } from '../world/rng';
import { BARS_PER_DAY } from './calendar';
import { BAR_YEARS, GAP_BARS, POLICY_RATE, REVERSION, type Model } from './model';
import type { GameSettings } from './settings';

/**
 * Market regimes (spec §11.2), a Markov chain stepped once a day. Each sets the market factor's drift and
 * volatility; the drift is relative to fundamental value, which prices revert to.
 */
export const REGIMES = [
  { name: 'calm', drift: 0.02, vol: 0.11 },
  { name: 'nervous', drift: -0.04, vol: 0.18 },
  { name: 'turbulent', drift: -0.15, vol: 0.3 },
  { name: 'crash', drift: -10, vol: 0.6 },
  { name: 'euphoric', drift: 0.35, vol: 0.14 },
] as const;
const CRASH = 3;
const EUPHORIC = 4;

/**
 * Daily chance of moving from a regime (row) to another (column). Crashes and euphoria (bubbles) are entered
 * more or less often with the crash/bubble setting; a crash lasts a few days, a calm spell most of a year.
 */
const TRANSITIONS = [
  [0, 1 / 250, 0, 1 / 8000, 1 / 800],
  [1 / 50, 0, 1 / 60, 1 / 900, 1 / 800],
  [1 / 150, 1 / 25, 0, 1 / 80, 0],
  [0, 1 / 15, 1 / 4, 0, 0],
  [1 / 150, 1 / 90, 0, 1 / 700, 0],
];
/** Extra drift of the industry a euphoric regime inflates past its value. The gap deflates once euphoria ends. */
const BUBBLE_DRIFT = 0.8;
/** Trading halts for the rest of the day when the MAJOR 500 falls 10% below its previous close. */
const CIRCUIT_BREAKER = 0.9;
/** Share of a bar's volume a resting limit order can take. */
export const PARTICIPATION = 0.2;

/** Intraday volume profile, busiest at the open and the close; sums to 1 over the day. */
export const PROFILE = (() => {
  const shape = Array.from({ length: BARS_PER_DAY }, (_, k) => 1 + Math.exp(-k / 6) + 0.8 * Math.exp((k + 1 - BARS_PER_DAY) / 8));
  const total = shape.reduce((a, b) => a + b, 0);
  return shape.map((v) => v / total);
})();
/** 1 / E[(1 + 0.6|t|)] for unit-variance Student-t(4) noise, so volume averages the ADV. */
const VOLUME_NORM = 1 / (1 + 0.6 * Math.SQRT1_2);
const TAU = 2 * Math.PI;

export interface IndexState {
  /** Σ price × shares / divisor = level; fixed so the MAJOR 500 starts at 1,000, and adjusted when members change. */
  divisor: number;
  /** Constituents: the 500 largest companies at the start; a delisted one is replaced by the largest outsider. */
  members: Int32Array;
  prevClose: number;
  open: number;
  high: number;
  low: number;
}

/** The market's dynamic state (spec §11.3): typed arrays indexed by company id. */
export interface MarketState {
  regime: number;
  /** Industry inflating in a euphoric regime, or -1. */
  bubble: number;
  /** Circuit breaker tripped: prices are frozen until the next open. */
  halted: boolean;
  /** Log price and log fundamental value. */
  lnP: Float64Array;
  lnV: Float64Array;
  prevClose: Float64Array;
  dayOpen: Float64Array;
  dayHigh: Float64Array;
  dayLow: Float64Array;
  dayVolume: Float64Array;
  /** Event jump (log return) still to apply, spread over this many more bars. */
  jump: Float64Array;
  jumpBars: Uint8Array;
  /** LISTING code; delisted companies keep their last price and never trade again. */
  status: Uint8Array;
  index: IndexState;
  /** Other investors' short interest, as a share of each company's float (spec §12.4). */
  shortInterest: Float32Array;
}

/** Why a company left the market (spec §11.6): taken over, or bankrupt. */
export const LISTING = { listed: 0, acquired: 1, bankrupt: 2 } as const;
export type Listing = (typeof LISTING)[keyof typeof LISTING];

export function initialMarket(companies: readonly Company[], model: Model, rng: Rng): MarketState {
  const price = Float64Array.from(companies, (c) => c.price);
  const lnP = price.map(Math.log);
  // Day one's prices are not quite fair: value sits within ±40% of price, further off for low-quality companies.
  const lnV = lnP.map((p, i) => p + Math.max(-0.4, Math.min(0.4, rng.normal(0, 0.05 + 0.15 * (1 - model.quality[i])))));
  let cap = 0;
  for (const i of model.members) cap += price[i] * model.shares[i];
  const n = companies.length;
  const members = model.members.slice();
  return {
    regime: 0,
    bubble: -1,
    halted: false,
    lnP,
    lnV,
    prevClose: price.slice(),
    dayOpen: price.slice(),
    dayHigh: price.slice(),
    dayLow: price.slice(),
    dayVolume: new Float64Array(n),
    jump: new Float64Array(n),
    jumpBars: new Uint8Array(n),
    status: new Uint8Array(n),
    index: { divisor: cap / 1000, members, prevClose: 1000, open: 1000, high: 1000, low: 1000 },
    shortInterest: model.shortBase.slice(),
  };
}

/**
 * Called once per step after the market factor is drawn, with that factor's log move, the step's length in years and the
 * regime: returns each industry's extra log move (its commodities, spec §11.2), which prices and values both take on.
 */
export type FactorHook = (market: number, years: number, regime: number) => Float64Array;

/**
 * The price model of spec §11.2, per bar and in log returns:
 *   r = β·M + S_sector + σ·ε + κ·(ln V − ln P) + J
 * M is the regime's market factor, S an industry factor, ε Student-t(4) noise, J event jumps. Market impact (I) is
 * applied to the price when an order fills. Value V grows at the cost of equity and jumps on news.
 */
export class Market {
  /** exp(lnP). */
  readonly price: Float64Array;
  readonly barVolume: Float64Array;
  /** |z| of each company's latest bar, which sizes the bar's wicks on intraday charts. */
  readonly wick: Float64Array;
  /** Average daily volume in shares, ∝ market cap^0.8 / price (spec §11.2). */
  readonly adv: Float64Array;
  readonly halfSpread: Float64Array;
  indexLevel = 0;
  /** The Federal Reservoir's policy rate (sim/macro.ts): value grows at it plus the equity premium. */
  rate = POLICY_RATE;
  /** Commodity moves by industry (sim/commodities.ts). */
  onFactors?: FactorHook;
  private readonly sectorMove = new Float64Array(INDUSTRIES.length);
  private readonly noMove = new Float64Array(INDUSTRIES.length);

  constructor(
    readonly state: MarketState,
    readonly model: Model,
    readonly settings: GameSettings,
  ) {
    const n = model.count;
    this.price = state.lnP.map(Math.exp);
    this.barVolume = new Float64Array(n);
    this.wick = new Float64Array(n);
    this.adv = new Float64Array(n);
    this.halfSpread = new Float64Array(n);
    this.refreshLiquidity();
    this.indexLevel = this.computeIndex();
  }

  /**
   * Before the opening bell: yesterday's close becomes the previous close (quotes show the last session's change
   * until then), the regime moves on and liquidity is re-estimated.
   */
  startDay(rng: Rng): void {
    const s = this.state;
    s.prevClose.set(this.price);
    s.index.prevClose = this.indexLevel;
    const weights = TRANSITIONS[s.regime].map((p, to) => (to === CRASH || to === EUPHORIC ? p * this.settings.crashes : p));
    weights[s.regime] = 1 - weights.reduce((a, b) => a + b, 0);
    const next = rng.weighted(weights);
    if (next !== s.regime) s.bubble = next === EUPHORIC ? rng.int(0, INDUSTRIES.length - 1) : -1;
    s.regime = next;
    s.halted = false;
    this.refreshLiquidity();
  }

  /** The overnight gap, then the day's open/high/low start from the opening prices. */
  openingGap(rng: Rng): void {
    const s = this.state;
    this.step(rng, GAP_BARS, 0);
    s.dayOpen.set(this.price);
    s.dayHigh.set(this.price);
    s.dayLow.set(this.price);
    s.dayVolume.fill(0);
    this.indexLevel = this.computeIndex();
    s.index.open = s.index.high = s.index.low = this.indexLevel;
  }

  /** One 5-minute bar (`bar` 0–77). Returns false while trading is halted. */
  bar(rng: Rng, bar: number): boolean {
    const s = this.state;
    if (s.halted) return false;
    this.step(rng, 1, PROFILE[bar]);
    const level = (this.indexLevel = this.computeIndex());
    s.index.high = Math.max(s.index.high, level);
    s.index.low = Math.min(s.index.low, level);
    if (level <= CIRCUIT_BREAKER * s.index.prevClose) s.halted = true;
    return true;
  }

  /** Market impact of trading `shares` now (square-root law, spec §11.2), as a fraction of the price. */
  impact(company: number, shares: number): number {
    const dailyVol = (this.model.volatility[company] * this.settings.volatility) / Math.sqrt(252);
    return this.settings.impact * dailyVol * Math.sqrt(shares / this.adv[company]);
  }

  /** Moves a company's price by a fraction (market impact of a fill). */
  push(company: number, fraction: number): void {
    const s = this.state;
    const p = Math.exp((s.lnP[company] += Math.log1p(fraction)));
    this.price[company] = p;
    if (p > s.dayHigh[company]) s.dayHigh[company] = p;
    if (p < s.dayLow[company]) s.dayLow[company] = p;
  }

  private step(rng: Rng, weight: number, profile: number): void {
    const s = this.state;
    const { beta, idio, drift, sector, sectorVol } = this.model;
    const { lnP, lnV, jump, jumpBars, dayHigh, dayLow, dayVolume } = s;
    const { price, barVolume, wick, adv, sectorMove } = this;
    const years = BAR_YEARS * weight;
    const root = Math.sqrt(years);
    const regime = REGIMES[s.regime];
    const market = regime.drift * years + regime.vol * this.settings.volatility * root * rng.normal();
    for (let k = 0; k < sectorMove.length; k++) {
      sectorMove[k] = sectorVol[k] * root * rng.normal() + (k === s.bubble ? BUBBLE_DRIFT * years : 0);
    }
    const commodity = this.onFactors?.(market, years, s.regime) ?? this.noMove;
    const kappa = REVERSION * weight;
    const noise = Math.sqrt(weight);
    const rateDrift = (this.rate - POLICY_RATE) * years;
    const { status } = s;
    for (let i = 0; i < price.length; i++) {
      if (status[i]) {
        barVolume[i] = 0;
        continue;
      }
      // Box–Muller gives z and a spare; ε = z / √(χ²₄/2) is unit-variance Student-t with ν = 4, χ²₄ = −2·ln(u·v).
      const radius = Math.sqrt(-2 * Math.log(1 - rng.float32()));
      const angle = TAU * rng.float32();
      const tails = -Math.log((1 - rng.float32()) * (1 - rng.float32()));
      const eps = Math.max(-12, Math.min(12, (radius * Math.cos(angle)) / Math.sqrt(tails)));
      const c = commodity[sector[i]];
      let r = beta[i] * market + sectorMove[sector[i]] + c + idio[i] * noise * eps + kappa * (lnV[i] - lnP[i]);
      const jumping = jumpBars[i] > 0;
      if (jumping) {
        const j = jump[i] / jumpBars[i];
        jump[i] -= j;
        jumpBars[i]--;
        r += j;
      }
      lnV[i] += drift[i] * weight + rateDrift + c;
      const p = Math.exp((lnP[i] += r));
      price[i] = p;
      if (p > dayHigh[i]) dayHigh[i] = p;
      if (p < dayLow[i]) dayLow[i] = p;
      // The spare normal drives volume (and wick size): busy bars move more.
      const spare = radius * Math.sin(angle);
      wick[i] = Math.abs(spare);
      const v = profile * adv[i] * Math.max(0.2, 1 + 0.35 * spare) * (1 + 0.6 * Math.abs(eps)) * VOLUME_NORM * (jumping ? 3 : 1);
      barVolume[i] = v;
      dayVolume[i] += v;
    }
  }

  /** ADV and spreads by liquidity: tight for mega caps, wide for pennies (spec §11.2). */
  private refreshLiquidity(): void {
    const { prevClose } = this.state;
    const { shares } = this.model;
    const { spread, smallCapSpread } = this.settings;
    for (let i = 0; i < prevClose.length; i++) {
      const cap = prevClose[i] * shares[i];
      const dollars = cap ** 0.8;
      this.adv[i] = dollars / prevClose[i];
      const quoted = Math.min(0.1, 0.0004 + 25 / Math.sqrt(dollars)) * spread * (cap < 2e9 ? smallCapSpread : 1);
      this.halfSpread[i] = quoted / 2;
    }
  }

  private computeIndex(): number {
    let cap = 0;
    for (const i of this.state.index.members) cap += this.price[i] * this.model.shares[i];
    return cap / this.state.index.divisor;
  }

  /**
   * Takes a company out of the market at `price` (spec §11.6: takeovers and bankruptcies). If it was in the MAJOR 500,
   * the largest company outside the index takes its place and the divisor keeps the level where it was.
   */
  delist(company: number, reason: Listing, price: number): void {
    const s = this.state;
    // The index carries on from where it stood, whatever the last price.
    const level = this.computeIndex();
    s.status[company] = reason;
    s.lnP[company] = s.lnV[company] = Math.log(price);
    // Always exp(lnP), as a loaded game computes it.
    price = this.price[company] = Math.exp(s.lnP[company]);
    s.jump[company] = 0;
    s.jumpBars[company] = 0;
    s.dayHigh[company] = Math.max(s.dayHigh[company], price);
    s.dayLow[company] = Math.min(s.dayLow[company], price);
    const members = s.index.members;
    const slot = members.indexOf(company);
    if (slot < 0) return;
    const inIndex = new Set(members);
    let best = -1;
    for (let i = 0; i < this.price.length; i++) {
      if (s.status[i] || inIndex.has(i)) continue;
      if (best < 0 || this.price[i] * this.model.shares[i] > this.price[best] * this.model.shares[best]) best = i;
    }
    if (best < 0) return;
    members[slot] = best;
    let cap = 0;
    for (const i of members) cap += this.price[i] * this.model.shares[i];
    s.index.divisor = cap / level;
    this.indexLevel = level;
  }
}
