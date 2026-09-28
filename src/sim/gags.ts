import type { Rng } from '../world/rng';
import { OPEN, addTradingDays, at, dayOf, nextTradingDay } from './calendar';
import type { Sim } from './context';
import { SHELL_FORMS, SHELL_NAMES } from './data/darkweb';
import { jump, plan } from './events';
import { firstTradingDay } from './loans';
import { LISTING } from './market';
import { STRICTNESS } from './regulator';

/**
 * Recurring gags and storylines (spec §16C.3). The chief executive ages in drawdowns; Darts Capital, a chimpanzee with
 * the stock pages, sometimes beats the firm; Enrun, a large energy company, cooks its books for months before it
 * collapses; a rival's rogue trader hides losses until the firm implodes; pizza deliveries to the SOB give audits away;
 * the Daily Scoop's horoscopes and the hemline index are right a little more often than not; Mom's investment club asks
 * for tips; a mystery buyer builds a stake through shells; a small company appoints a goat. The fat-finger intern is the
 * order ticket's. Everything draws on the module's own stream.
 */
export interface GagsState {
  /** The chief executive's wear and tear, 0 to 1, and the firm's best growth index so far. */
  stress: number;
  peak: number;
  /** Darts Capital: this quarter's darts, their prices when thrown, the firm's growth index then, and its record. */
  darts: { picks: number[]; prices: number[]; growth: number; wins: number; losses: number };
  /** Enrun: the company, the stage reached and when the next comes; how many there have been; none before `quiet`. */
  fraud?: { company: number; stage: number; next: number };
  frauds: number;
  quiet: number;
  rogue?: { firm: number; next: number };
  /** Pizza deliveries to the SOB: the month (year × 12 + month) whose audit is already decided, and whether it comes. */
  pizza?: { month: number; decided: number; audit: boolean };
  /** Mom's investment club: the tip she took and when she writes again. */
  mom: { next: number; tip?: { company: number; price: number; day: number }; silent?: number };
  mystery?: { target: number; stake: number; filings: number; next: number; shell: string };
  goat?: { company: number; since: number; until: number };
  /** This week's horoscope and this month's hemlines: which way the stars and the skirts say the market goes. */
  horoscope: { week: number; sign: 1 | -1 };
  hemline: { month: number; sign: 1 | -1 };
  /** The stars' calls: the close each was made at, and which way (the last three years). */
  calls: [number, 1 | -1][];
}

/** The stars' nudge to the week's prices (log): about an eighth of a calm week’s swing, so they are right about 55% of the time. */
const TILT = 0.002;

const monthKey = (day: number) => {
  const d = new Date(day * 86_400_000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const story = (sim: Sim, text: string, company = -1, args: string[] = [], extra: { move?: number; outlets?: string[] } = {}) =>
  sim.report({ kind: 'story', company, text: `gags.${text}`, args, ...extra });
const listed = (sim: Sim, i: number) => sim.market.state.status[i] === LISTING.listed;
const cap = (sim: Sim, i: number) => sim.market.price[i] * sim.model.shares[i];

export function newGags(sim: Sim): GagsState {
  const day = dayOf(sim.time);
  const growth = sim.s.scoring.growth.at(-1) ?? 1;
  const g: GagsState = {
    stress: 0, peak: growth, darts: { picks: [], prices: [], growth, wins: 0, losses: 0 }, frauds: 0, quiet: addTradingDays(day, 20),
    mom: { next: firstTradingDay(monthKey(day) + 1) }, horoscope: { week: -1, sign: 1 }, hemline: { month: -1, sign: 1 }, calls: [],
  };
  throwDarts(sim, g, sim.rng.gags);
  return g;
}

function throwDarts(sim: Sim, g: GagsState, rng: Rng): void {
  const picks: number[] = [];
  for (let tries = 0; picks.length < 10 && tries < 200; tries++) {
    const i = rng.int(0, sim.companies.length - 1);
    if (listed(sim, i) && !picks.includes(i)) picks.push(i);
  }
  g.darts = { ...g.darts, picks, prices: picks.map((i) => sim.market.price[i]), growth: sim.s.scoring.growth.at(-1) ?? 1 };
}

/** 07:00: Mom writes on the first trading day of the month, and the storylines move on. */
export function morningGags(sim: Sim, day: number): void {
  const g = sim.s.modules.gags!;
  const rng = sim.rng.gags;
  if (day >= g.mom.next) momsClub(sim, g, day);
  if (g.fraud && day >= g.fraud.next) enrun(sim, g, day, rng);
  if (g.rogue && day >= g.rogue.next) implode(sim, g, rng);
  if (g.mystery && day >= g.mystery.next) mystery(sim, g, day, rng);
}

/** Each close: the chief executive's stress; at a quarter's end, the darts; at a week's end, the rest. */
export function closeGags(sim: Sim, day: number, weekEnd: boolean, quarter: boolean): void {
  const g = sim.s.modules.gags!;
  const rng = sim.rng.gags;
  const growth = sim.s.scoring.growth.at(-1) ?? 1;
  g.peak = Math.max(g.peak, growth);
  const drawdown = 1 - growth / g.peak;
  // Greying in drawdowns, recovering slowly when things go well (spec §16C.3).
  g.stress = Math.min(1, Math.max(0, g.stress + (drawdown > 0.1 ? 0.004 * (drawdown / 0.1) : drawdown < 0.03 ? -0.0015 : 0)));
  if (quarter) darts(sim, g, growth, rng);
  if (!weekEnd) return;
  stars(sim, g, day, rng);
  pizza(sim, g, day, rng);
  if (!g.fraud && day >= g.quiet && rng.chance(0.015)) startEnrun(sim, g, day, rng);
  if (!g.rogue && rng.chance(0.004)) startRogue(sim, g, day, rng);
  if (!g.mystery && rng.chance(0.008)) startMystery(sim, g, day, rng);
  if (!g.goat && rng.chance(0.01)) appointGoat(sim, g, day, rng);
  if (g.goat && day <= g.goat.until && listed(sim, g.goat.company)) jump(sim, g.goat.company, Math.log1p(rng.range(0.01, 0.03)), 1, rng.int(10, 60));
}

/** Darts Capital (spec §16C.3): ten darts a quarter, equal weights. When the chimp wins, Barren's says so. */
function darts(sim: Sim, g: GagsState, growth: number, rng: Rng): void {
  const d = g.darts;
  if (d.picks.length) {
    const chimp = d.picks.reduce((a, i, k) => a + sim.market.price[i] / d.prices[k], 0) / d.picks.length - 1;
    const firm = growth / d.growth - 1;
    if (chimp > firm) {
      d.wins++;
      story(sim, 'darts', -1, [(chimp * 100).toFixed(1), (firm * 100).toFixed(1)], { outlets: ['barrens', 'dailyscoop', 'newswire'] });
    } else d.losses++;
  }
  throwDarts(sim, g, rng);
}

/**
 * The Daily Scoop's stock horoscope and the hemline index (spec §16C.3), seeded to be right about next week slightly more
 * often than not: the stars' call nudges every price its way as the week opens (TILT), and the nudge lasts.
 */
function stars(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const sign: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  g.horoscope = { week: Math.floor((day + 3) / 7), sign };
  g.calls.push([day, sign]);
  if (g.calls.length > 156) g.calls.shift();
  const month = monthKey(nextTradingDay(day));
  const newMonth = g.hemline.month !== month;
  if (newMonth) g.hemline = { month, sign: rng.chance(0.5) ? 1 : -1 };
  const tilt = TILT * sign + (newMonth ? TILT / 2 * g.hemline.sign : 0);
  const { status } = sim.market.state;
  // One bar: the nudge joins whatever else is moving the price, without stretching it.
  for (let i = 0; i < sim.companies.length; i++) if (!status[i]) jump(sim, i, tilt, 1, 1);
}

/**
 * Pizza for the Securities Oversight Bureau (spec §16C.3): two weeks before the first trading day of a month, the month's
 * audit is decided — with the odds the SOB uses — and late-night deliveries to its headquarters pick up when it is coming.
 */
function pizza(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const month = monthKey(day) + 1;
  if (g.pizza?.month === month || firstTradingDay(month) - day > 14) return;
  const r = sim.s.regulator;
  const chance = Math.min(0.9, (r.heat / 100) ** 2 * STRICTNESS[sim.s.settings.scrutiny]);
  g.pizza = { month, decided: day, audit: rng.chance(chance) };
}

export { monthKey };

// ---------- Enrun (spec §16C.3) ----------

function startEnrun(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const energy = sim.companies.flatMap((c, i) => (listed(sim, i) && (c.industry.id === 'oilGas' || c.industry.id === 'utilities' || c.industry.id === 'refining') ? [i] : []));
  const big = energy.sort((a, b) => cap(sim, b) - cap(sim, a)).slice(0, 5);
  if (!big.length) return;
  g.fraud = { company: rng.pick(big), stage: 0, next: nextTradingDay(day) };
}

/** Clues build up — the CFO goes, the auditor is replaced, the guestbook complains, filings are late — then −95%. */
function enrun(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const f = g.fraud!;
  const i = f.company;
  if (!listed(sim, i)) {
    g.fraud = undefined;
    return;
  }
  const step = (text: string, lo: number, hi: number, days: [number, number]) => {
    const move = rng.range(lo, hi);
    jump(sim, i, Math.log1p(move), 0.5, rng.int(5, 30));
    if (text) story(sim, text, i, [], { move });
    f.next = addTradingDays(day, rng.int(...days));
  };
  switch (f.stage++) {
    case 0:
      return step('enrunCfo', -0.04, -0.02, [15, 25]);
    case 1:
      return step('enrunAuditor', -0.05, -0.03, [15, 25]);
    case 2:
      // Only the company's guestbook notices (its web site shows the complaints).
      return step('', -0.03, -0.01, [10, 20]);
    case 3:
      return step('enrunFilings', -0.12, -0.08, [5, 10]);
    case 4: {
      story(sim, 'enrunCollapse', i, [], { move: -0.95 });
      jump(sim, i, Math.log(0.05), 1, 120);
      f.next = addTradingDays(day, 5);
      return;
    }
    default:
      sim.delist(i, LISTING.bankrupt, sim.market.price[i]);
      g.fraud = undefined;
      g.frauds++;
      g.quiet = addTradingDays(day, 250);
  }
}

// ---------- A rival's rogue trader ----------

function startRogue(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const firms = sim.s.world.firms.flatMap((f, k) => (f.strategy !== 'index' && sim.s.world.holdings.some((h) => h.firm === k) ? [k] : []));
  if (!firms.length) return;
  const firm = rng.pick(firms);
  g.rogue = { firm, next: addTradingDays(day, rng.int(5, 15)) };
  story(sim, 'rogueRumour', -1, [sim.s.world.firms[firm].name]);
}

/** The losses come out: the firm implodes and its holdings are dumped on the market. */
function implode(sim: Sim, g: GagsState, rng: Rng): void {
  const firm = g.rogue!.firm;
  g.rogue = undefined;
  const w = sim.s.world;
  const book = sim.s.competitors.books[firm];
  const mine = w.holdings.filter((h) => h.firm === firm && listed(sim, h.company));
  let value = 0;
  for (const h of mine.sort((a, b) => b.shares * sim.market.price[b.company] - a.shares * sim.market.price[a.company]).slice(0, 25)) {
    value += h.shares * sim.market.price[h.company];
    jump(sim, h.company, Math.log1p(rng.range(-0.08, -0.02)), 0.2, rng.int(5, 40));
  }
  w.holdings = w.holdings.filter((h) => h.firm !== firm);
  if (book) book.cash = Math.max(0, book.cash) * 0.2 + value * 0.2;
  story(sim, 'rogueImplode', -1, [w.firms[firm].name]);
}

// ---------- The mystery buyer ----------

function startMystery(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const mid: number[] = [];
  for (let i = 0; i < sim.companies.length; i++) if (listed(sim, i) && cap(sim, i) > 1e9 && cap(sim, i) < 20e9) mid.push(i);
  if (!mid.length) return;
  g.mystery = { target: rng.pick(mid), stake: 0, filings: rng.int(3, 5), next: addTradingDays(day, rng.int(5, 15)), shell: `${rng.pick(SHELL_NAMES)} ${rng.pick(SHELL_FORMS)}` };
}

/** Filings under shell names creep up month by month, then the bid (spec §16C.3). */
function mystery(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const m = g.mystery!;
  if (!listed(sim, m.target)) {
    g.mystery = undefined;
    return;
  }
  if (m.filings > 0) {
    m.filings--;
    m.stake = m.stake ? m.stake + rng.range(1.5, 3.5) : rng.range(5, 6);
    if (rng.chance(0.4)) m.shell = `${rng.pick(SHELL_NAMES)} ${rng.pick(SHELL_FORMS)}`;
    const move = rng.range(0.02, 0.05);
    jump(sim, m.target, Math.log1p(move), 0.5, rng.int(5, 30));
    story(sim, 'mystery', m.target, [m.shell, m.stake.toFixed(1)], { move });
    m.next = addTradingDays(day, rng.int(15, 25));
    return;
  }
  // The bid: an ordinary takeover, as the events model makes them.
  plan(sim, 'takeover', m.target, at(day, OPEN + 5 * rng.int(1, 60)), rng.range(0.3, 0.5), 0);
  g.mystery = undefined;
}

// ---------- The goat ----------

function appointGoat(sim: Sim, g: GagsState, day: number, rng: Rng): void {
  const small: number[] = [];
  for (let i = 0; i < sim.companies.length; i++) if (listed(sim, i) && cap(sim, i) < 2e9 && cap(sim, i) > 50e6) small.push(i);
  if (!small.length) return;
  const company = rng.pick(small);
  g.goat = { company, since: day, until: day + 180 };
  const move = rng.range(0.03, 0.08);
  jump(sim, company, Math.log1p(move), 1, rng.int(5, 20));
  story(sim, 'goat', company, [], { move });
}

// ---------- Mom's investment club ----------

/**
 * Once a month Mom's club asks for a tip, among the firm's biggest holdings (spec §16C.3). She follows the advice; if the
 * stock she bought falls 10% or more, she stops writing for three months.
 */
function momsClub(sim: Sim, g: GagsState, day: number): void {
  const mom = g.mom;
  mom.next = firstTradingDay(monthKey(day) + 1);
  if (mom.silent !== undefined && day < mom.silent) return;
  mom.silent = undefined;
  let result: number | undefined;
  if (mom.tip) {
    result = sim.market.price[mom.tip.company] / mom.tip.price - 1;
    const company = mom.tip.company;
    mom.tip = undefined;
    if (result <= -0.1) {
      mom.silent = day + 90;
      sim.send({ kind: 'momClub', company, amount: result, variant: 1 });
      return;
    }
  }
  const held = sim.s.account.positions.filter((p) => p.shares > 0 && listed(sim, p.company)).sort((a, b) => b.shares * sim.market.price[b.company] - a.shares * sim.market.price[a.company]);
  const options = held.slice(0, 3).map((p) => p.company);
  if (!options.length) {
    for (let i = 0; i < sim.companies.length && options.length < 3; i++) if (listed(sim, i) && sim.companies[i].marketCap > 100e9) options.push(i);
  }
  sim.send({ kind: 'momClub', options, amount: result, variant: 0 });
}

/** The tip she takes (a button in her letter): the club buys it at today's price. */
export function momsTip(sim: Sim, option: number | undefined, options: readonly number[]): void {
  const g = sim.s.modules.gags;
  if (!g || option === undefined) return;
  const company = options[option];
  if (company === undefined) return;
  g.mom.tip = { company, price: sim.market.price[company], day: dayOf(sim.time) };
}

/** Switched off: running storylines wrap up quietly — no collapse, no implosion, no bid. The goat stays; it has a contract. */
export function wrapUpGags(sim: Sim): void {
  const g = sim.s.modules.gags!;
  g.fraud = undefined;
  g.rogue = undefined;
  g.mystery = undefined;
  g.pizza = undefined;
  if (g.goat) g.goat.until = Math.min(g.goat.until, dayOf(sim.time));
}
