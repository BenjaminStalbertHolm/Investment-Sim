import type { Firm, Holding } from '../world/ownership';
import type { Strategy } from '../world/presetFirms';
import { START_DAY } from './calendar';
import type { Sim } from './context';
import {
  FILING_SIZE, FLOW_IMPACT, INDEX_MIN_CAP, MACRO_CASH, MIN_CAP, MACRO_LOOKBACK, MACRO_SECTORS, MAX_FLOW, OWNERSHIP_CAP,
  STRATEGIES,
} from './data/competitors';
import { FUNDS } from './data/funds';
import { weekCloses } from './history';
import { hash } from './press';

/**
 * Competitor firms (spec §16): each runs a fund of its clients' money by its strategy. Once a week, at the last close,
 * every firm works out the book its strategy wants and trades part of the way there, all at once rather than order by
 * order; their net buying and selling moves prices a little. Cash earns the policy rate, fees come out of the fund, and
 * each quarter clients bring money to firms that beat the MAJOR 500 and take it from those that lag. Holdings are filed
 * with the SOB each quarter and published 45 days later; Barren's ranks every firm once a year.
 */
export interface FirmBook {
  cash: number;
  /** Units of the fund: clients buy and sell them at the unit value, so returns and flows can be told apart. */
  units: number;
  /** Strategic stakes and subsidiaries (10% or more at the start) the firm keeps whatever its strategy says (spec §10.5). */
  core: number[];
  /** [day, assets, unit value, MAJOR 500] at the start and at each week's close. */
  history: [number, number, number, number][];
  /** Holdings filings, oldest first; the last two are kept. */
  filings: HoldingsFiling[];
}

/** The book at a quarter's end as filed with the SOB (spec §14: 13F-style, 45 days late). */
export interface HoldingsFiling {
  /** The quarter's last trading day, and when the filing becomes public. */
  day: number;
  published: number;
  aum: number;
  /** [company, shares, value], largest first. */
  holdings: [number, number, number][];
}

/** Barren's annual league table (spec §14, §16): every firm by its return over the year. Firm -1 is the player's. */
export interface LeagueTable {
  year: number;
  rows: { firm: number; aum: number; ret: number }[];
}

export interface CompetitorsState {
  books: FirmBook[];
  league: LeagueTable[];
}

const aumOf = (book: FirmBook, held: Map<number, number>, price: ArrayLike<number>) => {
  let value = book.cash;
  for (const [i, shares] of held) value += shares * price[i];
  return value;
};

/** Each firm's holdings, company → shares. */
function booksOf(holdings: readonly Holding[], firms: number): Map<number, number>[] {
  const out = Array.from({ length: firms }, () => new Map<number, number>());
  for (const h of holdings) out[h.firm]?.set(h.company, h.shares);
  return out;
}

/**
 * The start (spec §10.5): each firm's generated stakes, and the cash its strategy keeps beside them. `day` and `index` are
 * when the books open (a game saved before Phase 8 opens them where it stands).
 */
export function initialCompetitors(firms: readonly Firm[], holdings: readonly Holding[], price: ArrayLike<number>, shares: ArrayLike<number>, day = START_DAY, index = 1000): CompetitorsState {
  const held = booksOf(holdings, firms.length);
  const books = firms.map((firm, f): FirmBook => {
    let value = 0;
    for (const [i, n] of held[f]) value += n * price[i];
    const rules = STRATEGIES[firm.strategy];
    const cash = value > 0 ? (value * rules.cash) / (1 - rules.cash) : 500e6;
    const book: FirmBook = {
      cash,
      units: value + cash,
      core: [...held[f]].filter(([i, n]) => n >= 0.1 * shares[i]).map(([i]) => i),
      history: [[day, value + cash, 1, index]],
      filings: [],
    };
    book.filings.push(filing(held[f], price, day, day, value + cash));
    return book;
  });
  return { books, league: [] };
}

function filing(held: Map<number, number>, price: ArrayLike<number>, day: number, published: number, aum: number): HoldingsFiling {
  const rows = [...held].map(([i, n]): [number, number, number] => [i, n, n * price[i]]).sort((a, b) => b[2] - a[2] || a[0] - b[0]);
  return { day, published, aum, holdings: rows.slice(0, FILING_SIZE) };
}

/** A small deterministic noise in [-1, 1]: an analyst's error about a company. */
const noise = (...parts: (string | number)[]) => hash(...parts) / 2 ** 31 - 1;
/**
 * How far a firm's analysts misjudge what a company is worth: nobody sees fundamental value. An estimate of the gap between
 * price and value is the firm's skill (0–1, fixed per firm) times the gap, plus an error about twice the gap's usual size.
 */
const ESTIMATE_ERROR = 1;
const skillOf = (firm: string) => (0.5 * hash('skill', firm)) / 2 ** 32;

/** What each strategy wants to hold: company → weight of the invested part of the fund (weights sum to 1). */
function targets(sim: Sim, f: number, strategy: Strategy, invest: number, signals: Signals): Map<number, number> {
  const rules = STRATEGIES[strategy];
  const { price, state } = sim.market;
  const { shares, sector, quality } = sim.model;
  const n = price.length;
  const cap = (i: number) => price[i] * shares[i];
  const listed = (i: number) => !state.status[i] && price[i] > 0;
  const out = new Map<number, number>();
  const byCap = (min: number, max = Infinity) => {
    const pool: number[] = [];
    for (let i = 0; i < n; i++) if (listed(i) && cap(i) >= min && cap(i) < max) pool.push(i);
    return pool;
  };
  const weighted = (pool: number[]) => {
    const total = pool.reduce((a, i) => a + cap(i), 0);
    for (const i of pool) out.set(i, cap(i) / total);
  };
  const equal = (pool: number[], score: (i: number) => number, count = rules.holdings) => {
    const top = pool.map((i) => [score(i), i] as const).filter(([s]) => Number.isFinite(s)).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, count);
    for (const [, i] of top) out.set(i, (out.get(i) ?? 0) + 1 / count);
  };
  // Big funds can only hold companies large enough to take their positions.
  const minCap = Math.max(MIN_CAP, invest / Math.max(1, rules.holdings) / rules.maxStake);
  const quarter = Math.floor(signals.week / 13);
  // Stock pickers revise their estimates each quarter, quants' models each week.
  const skill = skillOf(sim.s.world.firms[f].id);
  const estimate = (i: number, period: number) => skill * (state.lnV[i] - state.lnP[i]) + ESTIMATE_ERROR * noise(f, i, period);
  switch (strategy) {
    case 'index':
      weighted(byCap(INDEX_MIN_CAP));
      break;
    case 'balanced':
      weighted(byCap(0).sort((a, b) => cap(b) - cap(a) || a - b).slice(0, rules.holdings));
      break;
    case 'momentum':
      equal(byCap(minCap), (i) => price[i] / signals.halfYear[i]);
      break;
    case 'growth':
      equal(byCap(minCap), (i) => sim.companies[i].revenueGrowth + 0.2 * quality[i]);
      break;
    case 'value': {
      const { income, dividend } = sim.s.fundamentals;
      equal(byCap(minCap), (i) => (income[i] > 0 ? income[i] / cap(i) + dividend[i] / price[i] : -Infinity));
      break;
    }
    case 'stockPicking':
      // The analysts estimate what companies are worth, never quite right.
      equal(byCap(minCap), (i) => estimate(i, quarter) + 0.1 * quality[i]);
      break;
    case 'quant':
      // Last week's losers bounce, and cheap stocks drift back towards their value.
      equal(byCap(minCap), (i) => signals.lastWeek[i] / price[i] - 1 + 0.5 * estimate(i, -signals.week));
      break;
    case 'macro': {
      // The strongest sectors of the last quarter, their largest companies.
      const sectors = signals.sectors.slice(0, MACRO_SECTORS);
      const pool = byCap(minCap).filter((i) => sectors.includes(sector[i]));
      for (const s of sectors) equal(pool.filter((i) => sector[i] === s), cap, Math.round(rules.holdings / MACRO_SECTORS));
      const total = [...out.values()].reduce((a, b) => a + b, 0);
      for (const [i, w] of out) out.set(i, w / total);
      break;
    }
    case 'activist':
      // Badly run mid caps trading below their worth.
      equal(byCap(minCap, Math.max(minCap * 4, 10e9)).filter((i) => quality[i] < 0.5), (i) => estimate(i, quarter));
      break;
  }
  return out;
}

interface Signals {
  week: number;
  /** Every company's close half a year ago and a week ago (the start prices before there are such weeks). */
  halfYear: ArrayLike<number>;
  lastWeek: ArrayLike<number>;
  /** Industries ranked by their sector fund's return over the last quarter, best first. */
  sectors: number[];
}

function signals(sim: Sim): Signals {
  const h = sim.s.history;
  const weeks = h.weekDays.length;
  const start = Float64Array.from(sim.companies, (c) => c.price);
  const funds = sim.s.funds;
  const rows = funds.days.length;
  const back = Math.max(0, rows - 1 - MACRO_LOOKBACK);
  const ret = (f: number) => (rows ? funds.closes[(rows - 1) * FUNDS.length + f] / funds.closes[back * FUNDS.length + f] : 1);
  const sectors = FUNDS.slice(1).map((spec, k) => [ret(k + 1), spec.industry] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
  return {
    week: weeks,
    halfYear: weeks > 26 ? weekCloses(h, weeks - 27) : start,
    lastWeek: weeks > 1 ? weekCloses(h, weeks - 2) : start,
    sectors,
  };
}

/** Companies the player has filed a 5% stake in, which aggressive competitors pile into (spec §9, §16). */
function frontRun(sim: Sim, strategy: Strategy): number[] {
  const aggression = sim.s.settings.aggression;
  const piles = aggression === 'high' ? ['momentum', 'quant', 'activist'] : aggression === 'normal' ? ['activist'] : [];
  if (!piles.includes(strategy)) return [];
  return sim.s.governance.stakes.filter((s) => s.level >= 5 && !sim.market.state.status[s.company]).map((s) => s.company);
}

/**
 * The week's trading (at the last close of each week): every firm moves part of the way to its strategy's book, paying
 * the spread; the net flow in each company moves its price by the square-root law, half of it for good. Then a week's
 * fees and interest, and the week's line in each firm's history.
 */
export function weeklyTrading(sim: Sim, day: number): void {
  const { firms } = sim.s.world;
  const state = sim.s.competitors;
  const { price, halfSpread, adv } = sim.market;
  const { shares, volatility } = sim.model;
  const held = booksOf(sim.s.world.holdings, firms.length);
  const total = new Float64Array(price.length);
  for (const book of held) for (const [i, n] of book) total[i] += n;
  for (const p of sim.s.account.positions) if (p.shares > 0) total[p.company] += p.shares;
  const flow = new Float64Array(price.length);
  const sig = signals(sim);
  const regime = sim.market.state.regime;
  firms.forEach((firm, f) => {
    const book = state.books[f];
    const mine = held[f];
    const rules = STRATEGIES[firm.strategy];
    const aum = aumOf(book, mine, price);
    const core = new Set(book.core);
    let coreValue = 0;
    for (const i of core) coreValue += (mine.get(i) ?? 0) * price[i];
    const cash = firm.strategy === 'macro' ? MACRO_CASH[regime] : rules.cash;
    const invest = Math.max(0, aum * (1 - cash) - coreValue);
    const want = targets(sim, f, firm.strategy, invest, sig);
    const extra = frontRun(sim, firm.strategy).filter((i) => !want.has(i));
    for (const i of extra) want.set(i, 1 / Math.max(rules.holdings, 8));
    const minTrade = Math.max(100_000, aum * 0.0005);
    for (const i of new Set([...mine.keys(), ...want.keys()])) {
      if (core.has(i) || sim.market.state.status[i]) continue;
      const now = mine.get(i) ?? 0;
      const room = Math.max(0, (OWNERSHIP_CAP - sim.s.world.insiderPct[i]) * shares[i] - total[i]);
      const target = Math.min(((want.get(i) ?? 0) * invest) / price[i], rules.maxStake * shares[i], now + room);
      let next = Math.round(now + rules.turnover * (target - now));
      // Small positions left over are sold outright.
      if (!want.has(i) && next * price[i] < minTrade) next = 0;
      const delta = next - now;
      if (!delta || (next && Math.abs(delta) * price[i] < minTrade)) continue;
      book.cash -= delta * price[i] + Math.abs(delta) * price[i] * halfSpread[i];
      flow[i] += delta;
      total[i] += delta;
      if (next) mine.set(i, next);
      else mine.delete(i);
    }
    // A week of fees and of interest on cash.
    book.cash -= aum * rules.fee * (7 / 365);
    if (book.cash > 0) book.cash += book.cash * sim.s.macro.rate * (7 / 365);
    const after = aumOf(book, mine, price);
    book.history.push([day, after, after / book.units, sim.market.indexLevel]);
  });
  for (let i = 0; i < flow.length; i++) {
    if (!flow[i]) continue;
    // The week's net trading, spread over five sessions' volume.
    const daily = (volatility[i] * sim.s.settings.volatility) / Math.sqrt(252);
    const impact = Math.min(0.05, FLOW_IMPACT * daily * Math.sqrt(Math.abs(flow[i]) / (5 * adv[i])));
    sim.market.push(i, (Math.sign(flow[i]) * impact) / 2);
  }
  sim.s.world.holdings = held
    .flatMap((book, firm) => [...book].map(([company, n]) => ({ company, firm, shares: n })))
    .sort((a, b) => a.company - b.company || b.shares - a.shares || a.firm - b.firm);
}

/** Unit value and MAJOR 500 about a year (52 weekly lines) before the latest line, or at the start. */
const yearAgo = (book: FirmBook) => book.history[Math.max(0, book.history.length - 53)];

/**
 * A quarter's end: clients bring money to firms whose last year beat the MAJOR 500 and take it from laggards (index funds
 * gather money whatever happens), and each firm files its holdings, public 45 days later.
 */
export function quarterlyFlows(sim: Sim, day: number, published: number): void {
  const { firms } = sim.s.world;
  const { price } = sim.market;
  const held = booksOf(sim.s.world.holdings, firms.length);
  const rng = sim.rng.rivals;
  firms.forEach((firm, f) => {
    const book = sim.s.competitors.books[f];
    const rules = STRATEGIES[firm.strategy];
    const aum = aumOf(book, held[f], price);
    const [, , unitThen, indexThen] = yearAgo(book);
    const unit = aum / book.units;
    const excess = unit / unitThen - sim.market.indexLevel / indexThen;
    const share = Math.max(-MAX_FLOW, Math.min(MAX_FLOW, rules.inflow + (rules.chase * Math.max(-0.3, Math.min(0.3, excess))) / 4 + rng.normal(0, 0.015)));
    const amount = Math.max(-0.9 * aum, share * aum);
    book.cash += amount;
    book.units += amount / unit;
    book.filings = [...book.filings.slice(-1), filing(held[f], price, day, published, aum + amount)];
  });
}

/** Every firm and the player ranked by their return over `year` so far (spec §14: Barren's league table). */
export function standings(sim: Sim, year: number, player: { aum: number; ret: number }): LeagueTable {
  const held = booksOf(sim.s.world.holdings, sim.s.world.firms.length);
  const rows = sim.s.competitors.books.map((book, firm) => {
    const aum = aumOf(book, held[firm], sim.market.price);
    const first = findLast(book.history, ([day]) => new Date(day * 86_400_000).getUTCFullYear() < year) ?? book.history[0];
    return { firm, aum, ret: aum / book.units / first[2] - 1 };
  });
  rows.push({ firm: -1, ...player });
  return { year, rows: rows.sort((a, b) => b.ret - a.ret || a.firm - b.firm) };
}

/** The year's league table, published (and kept) at its last close. */
export function leagueTable(sim: Sim, year: number, player: { aum: number; ret: number }): LeagueTable {
  const table = standings(sim, year, player);
  sim.s.competitors.league.push(table);
  return table;
}

/** Every firm's assets now, in one pass over the holdings. */
export function firmAums(sim: Sim): number[] {
  const out = sim.s.competitors.books.map((b) => b.cash);
  for (const h of sim.s.world.holdings) out[h.firm] += h.shares * sim.market.price[h.company];
  return out;
}

/** A firm's assets now. */
export function firmAum(sim: Sim, f: number): number {
  let value = sim.s.competitors.books[f].cash;
  for (const h of sim.s.world.holdings) if (h.firm === f) value += h.shares * sim.market.price[h.company];
  return value;
}

/** A firm's latest filing the public can see today. */
export const publishedFiling = (book: FirmBook, today: number) => findLast(book.filings, (x) => x.published <= today) ?? book.filings[0];

/** The last element that passes the test (Array.prototype.findLast is ES2023). */
function findLast<T>(list: readonly T[], test: (x: T) => boolean): T | undefined {
  for (let k = list.length - 1; k >= 0; k--) if (test(list[k])) return list[k];
  return undefined;
}
