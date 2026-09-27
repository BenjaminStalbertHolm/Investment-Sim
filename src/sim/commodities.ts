import { pv } from 'financial';
import { INDUSTRIES } from '../world/industries';
import { Rng } from '../world/rng';
import {
  BAR_MINUTES, CLOSE, OPEN, START_DAY, addTradingDays, at, gameYear, isTradingDay, monthName, previousTradingDay, type GameTime,
} from './calendar';
import {
  CHAIN_LENGTH, COMMODITY_EXPOSURE, CONTRACTS, CONTRACT_INDEX, FACTOR_WEIGHT, HAZARDS, INDEX_YIELD, MEAN_VOL, MJ, NOTE,
  OPEK_HINT_DAYS, OPEK_MINUTE, OPEK_MONTHS, OPEK_MOVES, OPEK_PRICED, OPEK_RELIABILITY, PHYSICAL, WEATHER_LEAD,
  WEATHER_PRICED, WEATHER_RELIABILITY, ZN, type OpekDecision,
} from './data/commodities';
import type { Bar } from './history';
import { nthWeekday } from './macro';

/**
 * Commodities and futures prices (spec §12.3). Each commodity's spot is a mean-reverting (Ornstein-Uhlenbeck) log price
 * around a slowly wandering long-run level, plus a known seasonal swing and supply shocks from the weather and OPEK.
 * A futures contract is priced at what its model expects the spot to be at expiry: `S·e^((r + storage − convenience)·T)`
 * with the convenience yield implied, high when the commodity is scarce (backwardation) and low when it is plentiful
 * (contango). The index future carries the MAJOR 500 at the policy rate less dividends; the note future the 10-Year Note.
 */

const N = CONTRACTS.length;
const YEAR = 365.25;
const CRASH = 3;
const KAPPA = CONTRACTS.map((c) => (c.halfLife ? Math.LN2 / c.halfLife : 0));

/** Each industry's commodity exposures as [contract, loading] pairs, by industry index. */
const EXPOSURES: readonly (readonly [number, number])[][] = INDUSTRIES.map((industry) =>
  Object.entries(COMMODITY_EXPOSURE[industry.id] ?? {}).map(([code, w]) => [CONTRACT_INDEX[code], w] as const),
);

/**
 * The annual variance each industry's stocks get from commodities: the model takes it out of the companies' own noise,
 * so a company's volatility stays what its genome says.
 */
export const COMMODITY_VARIANCE = EXPOSURES.map((pairs) => pairs.reduce((a, [k, w]) => a + (w * CONTRACTS[k].vol) ** 2, 0));

/** A weather warning or an OPEK meeting (spec §14): what it says, when, and — hidden until it happens — what it brings. */
export interface Outlook {
  id: number;
  source: 'weather' | 'opek';
  /** Weather: the hazard; OPEK: the decision the delegates hint at. */
  kind: string;
  issued: GameTime;
  /** When the weather hits, or the meeting announces. */
  due: GameTime;
  /** What the outlook says will happen: log moves by contract index. */
  moves: [number, number][];
  /** Share of `moves` the market priced in when it was issued. */
  priced: number;
  /** What will happen: the moves, and 'hit' or 'bust' (weather) or the decision (OPEK). Never shown before `due`. */
  actual: [number, number][];
  result: string;
  done?: boolean;
}

/** The commodity markets' state (spec §18): saved with the game. */
export interface CommodityState {
  /** Each commodity's log spot without its seasonal swing, and the long-run level it reverts to. */
  y: Float64Array;
  mean: Float64Array;
  /** Supply shocks still to arrive, spread over this many more bars. */
  jump: Float64Array;
  jumpBars: Uint8Array;
  /** The 10-year yield the note future is priced from. */
  yield10: number;
  /** Closes since the start, a row of every contract's underlying per trading day, for charts. */
  days: number[];
  closes: Float32Array;
  /** Every listed contract's settlement price at the last close (spec §12.3), by contract key. */
  settle: { day: number; prices: Record<string, number> };
  outlooks: Outlook[];
  nextOutlook: number;
}

/** The seasonal part of a commodity's log price on a day. */
export function seasonal(k: number, day: number): number {
  const s = CONTRACTS[k].season;
  if (!s) return 0;
  const year = new Date(day * 86_400_000).getUTCFullYear();
  const doy = day - Date.UTC(year, 0, 1) / 86_400_000;
  return s.amplitude * Math.cos((2 * Math.PI * (doy - s.peak)) / YEAR);
}

/** The 10-Year Note's price, in points of par, at a yield: a 6% coupon paid twice a year. */
export const notePrice = (y: number) => -pv(y / 2, NOTE.years * 2, NOTE.coupon / 2, 100);

export function initialCommodities(seed: string): CommodityState {
  const rng = Rng.stream(seed, 'commodities:start');
  const y = new Float64Array(N);
  const mean = new Float64Array(N);
  for (const k of PHYSICAL) {
    y[k] = Math.log(CONTRACTS[k].start) - seasonal(k, START_DAY);
    // Where a price starts against its long-run level decides whether its curve starts in contango or backwardation.
    mean[k] = y[k] + rng.normal(0, 0.12);
  }
  return {
    y, mean, jump: new Float64Array(N), jumpBars: new Uint8Array(N), yield10: NOTE.start, days: [], closes: new Float32Array(0),
    settle: { day: -1, prices: {} }, outlooks: [], nextOutlook: 1,
  };
}

// ---------- Contracts ----------

const MONTH_CODES = 'FGHJKMNQUVXZ';

/** A listed futures contract: which commodity, its month (year × 12 + month) and its last trading day. */
export interface Contract {
  /** "CL:23954" */
  key: string;
  k: number;
  month: number;
  expiry: number;
}

/** The last trading day of a contract month: its third Friday, or the trading day before if the exchange is shut. */
export function lastTradingDay(month: number): number {
  let day = nthWeekday(Math.floor(month / 12), month % 12, 5, 3);
  while (!isTradingDay(day)) day = previousTradingDay(day);
  return day;
}

export const contract = (k: number, month: number): Contract => ({ key: `${CONTRACTS[k].code}:${month}`, k, month, expiry: lastTradingDay(month) });

export function parseContract(key: string): Contract | undefined {
  const [code, month] = key.split(':');
  const k = CONTRACT_INDEX[code];
  return k === undefined || !/^\d+$/.test(month ?? '') ? undefined : contract(k, Number(month));
}

/** The exchange's symbol for a contract, "CLH8" (1998's screens had one-digit years). */
export const symbolOf = (c: Contract) => `${CONTRACTS[c.k].code}${MONTH_CODES[c.month % 12]}${gameYear(c.expiry) % 10}`;

/** A contract as people say it: "CL Mar 98". */
export function contractLabel(key: string): string {
  const c = parseContract(key);
  return c ? `${CONTRACTS[c.k].code} ${monthName(c.expiry)} ${String(gameYear(c.expiry)).slice(-2)}` : key;
}

/** The contracts listed on a day, nearest first (spec §12.3: a contract chain). */
export function chain(k: number, day: number): Contract[] {
  const length = CONTRACTS[k].group === 'financial' ? 4 : CHAIN_LENGTH;
  const d = new Date(day * 86_400_000);
  const out: Contract[] = [];
  for (let month = d.getUTCFullYear() * 12 + d.getUTCMonth(); out.length < length; month++) {
    if (!CONTRACTS[k].months.includes(month % 12)) continue;
    const c = contract(k, month);
    if (c.expiry >= day) out.push(c);
  }
  return out;
}

/** Whether a contract is listed on a day: not expired, and no further out than the chain goes. */
export const listed = (c: Contract, day: number) => chain(c.k, day).some((x) => x.key === c.key);

// ---------- Prices ----------

/** What prices need from the rest of the market: the economy and the MAJOR 500. */
export interface PriceContext {
  day: number;
  rate: number;
  inflation: number;
  index: number;
}

/** The commodity markets at work: steps the spot models, prices contracts, plans the weather and OPEK. */
export class Commodities {
  private readonly moves = new Float64Array(N);
  private readonly industry = new Float64Array(INDUSTRIES.length);

  constructor(
    readonly state: CommodityState,
    private readonly volatility: number,
  ) {}

  /** The underlying's price: the commodity itself, the MAJOR 500 for the index future, the note for the note future. */
  spot(k: number, p: PriceContext): number {
    if (k === MJ) return p.index;
    if (k === ZN) return notePrice(this.state.yield10);
    return Math.exp(this.state.y[k] + seasonal(k, p.day));
  }

  /** A contract's fair price: the spot expected at expiry under the commodity's own model (spec §12.3). */
  futures(k: number, expiry: number, p: PriceContext): number {
    const T = Math.max(0, expiry - p.day) / YEAR;
    if (k === MJ) return p.index * Math.exp((p.rate - INDEX_YIELD) * T);
    if (k === ZN) {
      const note = notePrice(this.state.yield10);
      return note * Math.exp((p.rate - NOTE.coupon / note) * T);
    }
    const s = this.state;
    const kappa = KAPPA[k];
    const decay = Math.exp(-kappa * T);
    // E[ln S_T]: the shock decays, the long-run level drifts with inflation, and the season is known in advance.
    const expected = seasonal(k, expiry) + decay * s.y[k] + (1 - decay) * s.mean[k] + p.inflation * (T - (1 - decay) / kappa);
    const sigma = CONTRACTS[k].vol * this.volatility;
    return Math.exp(expected + (sigma * sigma * (1 - decay * decay)) / (4 * kappa));
  }

  /**
   * One step of the spot models over `years`, alongside the stock market (spec §11.2): mean reversion, noise shared
   * within oil, precious metals, grains and livestock, the market factor (copper tracks the economy, gold rallies in a
   * crash) and supply shocks. Returns each industry's move from its commodity exposures, which stocks take on.
   */
  step(rng: Rng, market: number, years: number, regime: number, rate: number): Float64Array {
    const s = this.state;
    const root = Math.sqrt(years);
    const factors: Record<string, number> = { oil: rng.normal(), precious: rng.normal(), grain: rng.normal(), livestock: rng.normal() };
    for (const k of PHYSICAL) {
      const c = CONTRACTS[k];
      let z = rng.normal();
      if (c.factor) {
        const w = FACTOR_WEIGHT[c.factor];
        z = Math.sqrt(w) * factors[c.factor] + Math.sqrt(1 - w) * z;
      }
      let d = KAPPA[k] * (s.mean[k] - s.y[k]) * years + c.vol * this.volatility * root * z + (c.beta ?? 0) * market;
      if (c.haven && regime === CRASH) d += c.haven * years;
      if (s.jumpBars[k]) {
        const j = s.jump[k] / s.jumpBars[k];
        s.jump[k] -= j;
        s.jumpBars[k]--;
        d += j;
      }
      s.y[k] += d;
      this.moves[k] = d;
    }
    s.yield10 = Math.max(0.001, s.yield10 + (Math.LN2 / NOTE.halfLife) * (rate + NOTE.premium - s.yield10) * years + NOTE.vol * this.volatility * root * rng.normal());
    const out = this.industry;
    for (let i = 0; i < EXPOSURES.length; i++) {
      let move = 0;
      for (const [k, w] of EXPOSURES[i]) move += w * this.moves[k];
      out[i] = move;
    }
    return out;
  }

  /** Each morning the long-run levels drift with inflation and wander a little. */
  startDay(rng: Rng, inflation: number): void {
    for (const k of PHYSICAL) this.state.mean[k] += inflation / 252 + (MEAN_VOL / Math.sqrt(252)) * rng.normal();
  }

  /** A Federal Reservoir decision moves the 10-year yield by half as much at once; the rest follows. */
  rateChange(change: number): void {
    this.state.yield10 = Math.max(0.001, this.state.yield10 + 0.5 * change);
  }

  /** The close (spec §12.3): every listed contract's settlement price, and the day's closes for charts. */
  close(p: PriceContext): void {
    const s = this.state;
    const prices: Record<string, number> = {};
    for (let k = 0; k < N; k++) for (const c of chain(k, p.day)) prices[c.key] = this.futures(k, c.expiry, p);
    s.settle = { day: p.day, prices };
    const closes = new Float32Array(s.closes.length + N);
    closes.set(s.closes);
    for (let k = 0; k < N; k++) closes[s.closes.length + k] = this.spot(k, p);
    s.closes = closes;
    s.days.push(p.day);
  }

  /** Each underlying's price at the last close (the start prices before the first). */
  previous(k: number): number {
    const s = this.state;
    return s.days.length ? s.closes[s.closes.length - N + k] : k === ZN ? notePrice(NOTE.start) : CONTRACTS[k].start;
  }

  /** A supply shock (or its reversal): a log move of the spot spread over a few bars. */
  shock(k: number, move: number, bars: number): void {
    this.state.jump[k] += move;
    this.state.jumpBars[k] = Math.max(this.state.jumpBars[k], bars);
  }

  // ---------- The weather and OPEK (spec §12.3, §14) ----------

  /**
   * Each morning the National Weather Bureau may warn of weather that hits a few trading days later: a genuine signal,
   * right four times in five. The market prices in a little of it at once.
   */
  planWeather(rng: Rng, day: number, now: GameTime): Outlook[] {
    const month = new Date(day * 86_400_000).getUTCMonth();
    const out: Outlook[] = [];
    for (const h of HAZARDS) {
      if (!h.months.includes(month) || !rng.chance(h.rate / (h.months.length * 21))) continue;
      if (this.state.outlooks.some((o) => !o.done && o.source === 'weather' && o.kind === h.id)) continue;
      const hitDay = addTradingDays(day, rng.int(...WEATHER_LEAD));
      const due = rng.chance(0.4) ? at(hitDay, 7 * 60 + 30) : at(hitDay, OPEN + BAR_MINUTES * rng.int(1, 77));
      const moves = h.moves.map(([code, lo, hi]): [number, number] => [CONTRACT_INDEX[code], lo + (hi - lo) * rng.float()]);
      const hit = rng.chance(WEATHER_RELIABILITY);
      const actual = hit ? moves.map(([k, m]): [number, number] => [k, m * rng.range(0.8, 1.2)]) : [];
      out.push(this.issue(rng, 'weather', h.id, now, due, moves, WEATHER_PRICED, actual, hit ? 'hit' : 'bust'));
    }
    return out;
  }

  /**
   * OPEK (spec §12.3): five trading days before each meeting its delegates hint at the decision — right seven times in
   * ten. A cut is likelier when oil is cheap against its long-run level, a rise when it is dear.
   */
  planOpek(rng: Rng, day: number, now: GameTime): Outlook | undefined {
    const meeting = nextOpekMeeting(day);
    if (addTradingDays(day, OPEK_HINT_DAYS) !== meeting) return undefined;
    const CL = CONTRACT_INDEX.CL;
    const gap = this.state.y[CL] - this.state.mean[CL];
    const cut = Math.min(0.85, Math.max(0.05, 0.3 - 1.5 * gap));
    const raise = Math.min(0.85, Math.max(0.05, 0.3 + 1.5 * gap));
    const decisions: OpekDecision[] = ['cut', 'hold', 'raise'];
    const decision = decisions[rng.weighted([cut, Math.max(0.1, 1 - cut - raise), raise])];
    const hint = rng.chance(OPEK_RELIABILITY) ? decision : rng.pick(decisions.filter((d) => d !== decision));
    const draw = (d: OpekDecision) => OPEK_MOVES[d].map(([code, lo, hi]): [number, number] => [CONTRACT_INDEX[code], lo + (hi - lo) * rng.float()]);
    const moves = draw(hint);
    const actual = hint === decision ? moves : draw(decision);
    return this.issue(rng, 'opek', hint, now, at(meeting, OPEK_MINUTE), moves, OPEK_PRICED, actual, decision);
  }

  private issue(rng: Rng, source: Outlook['source'], kind: string, now: GameTime, due: GameTime, moves: [number, number][], priced: number, actual: [number, number][], result: string): Outlook {
    const o: Outlook = { id: this.state.nextOutlook++, source, kind, issued: now, due, moves, priced, actual, result };
    for (const [k, m] of moves) this.shock(k, m * priced, rng.int(6, 12));
    this.state.outlooks.push(o);
    return o;
  }

  /** The weather hits (or doesn't), OPEK announces: prices move by what happened less what was priced in. */
  resolve(rng: Rng, id: number): Outlook | undefined {
    const o = this.state.outlooks.find((x) => x.id === id);
    if (!o || o.done) return undefined;
    const total = new Map<number, number>();
    for (const [k, m] of o.moves) total.set(k, -m * o.priced);
    for (const [k, m] of o.actual) total.set(k, (total.get(k) ?? 0) + m);
    for (const [k, m] of total) this.shock(k, m, rng.int(1, 6));
    o.done = true;
    return o;
  }
}

/** OPEK meets on the last Wednesday of its months (the trading day before, if the exchange is shut). */
export function opekMeetings(year: number): number[] {
  return OPEK_MONTHS.map((m) => {
    let day = nthWeekday(year, m, 3, -1);
    while (!isTradingDay(day)) day = previousTradingDay(day);
    return day;
  });
}

/** The first OPEK meeting on or after a day. */
export function nextOpekMeeting(day: number): number {
  const year = new Date(day * 86_400_000).getUTCFullYear();
  return [...opekMeetings(year), ...opekMeetings(year + 1)].find((d) => d >= day)!;
}

/**
 * Five years of daily closes before the start, for charts (spec §11.3): a seeded mean-reverting walk ending at the start
 * price. Not stored; the same every time.
 */
export function pregameCommodity(seed: string, k: number, days: readonly number[]): Bar[] {
  const rng = Rng.stream(seed, `pregame:commodity:${CONTRACTS[k].code}`);
  const c = CONTRACTS[k];
  const bars: Bar[] = [];
  const dt = 1 / 252;
  if (k === ZN) {
    let y = NOTE.start;
    for (let n = days.length - 1; n >= 0; n--) {
      const close = notePrice(y);
      bars.push({ time: (days[n] * 1440 + CLOSE) * 60, open: close, high: close, low: close, close, volume: 0 });
      y = Math.max(0.01, y - (Math.LN2 / NOTE.halfLife) * (0.065 - y) * dt - NOTE.vol * Math.sqrt(dt) * rng.normal());
    }
    return bars.reverse();
  }
  const mean = Math.log(c.start) - seasonal(k, START_DAY);
  let x = mean;
  for (let n = days.length - 1; n >= 0; n--) {
    const close = Math.exp(x + seasonal(k, days[n]));
    bars.push({ time: (days[n] * 1440 + CLOSE) * 60, open: close, high: close, low: close, close, volume: 0 });
    x -= KAPPA[k] * (mean - x) * dt + c.vol * Math.sqrt(dt) * rng.normal();
  }
  return bars.reverse();
}
