import { companyCeo, encodeCeo, randomCeo } from '../world/ceo';
import type { Company } from '../world/company';
import type { Rng } from '../world/rng';
import { CLOSE, OPEN, addTradingDays, at, dayOf, nextTradingDay, previousTradingDay, type GameTime } from './calendar';
import {
  EVENT_TYPE, EVENT_TYPES, HORIZON_DAYS, LEAK_SHARE, TAKEOVER_COMPLETES, TAKEOVER_DAYS, TAKEOVER_JUMP, type EventKind,
  type EventType,
} from './data/events';
import { FORUM_CREDIBILITY, TRADE_CREDIBILITY } from './data/outlets';
import type { MacroKind, NewsItem, Rumour } from './news';
import { LISTING } from './market';
import type { Sim } from './context';
import { firmAums } from './competitors';
import { fileStake, mergerApproved, mergerMeeting } from './governance';
import { surveil } from './regulator';

/**
 * Corporate events (spec §11.6–11.7). Each trading day the generator decides the events of the day HORIZON_DAYS ahead,
 * so rumours can leak and tips can be genuine; each event then fires at its time as a price jump over 1–6 bars, a move
 * in fundamental value (drift or reversal), a news item every outlet can write up, and sometimes a second move when the
 * next morning's papers dig in.
 */
export interface PlannedEvent {
  id: number;
  kind: EventKind | 'pump';
  company: number;
  time: GameTime;
  /** Signed move, as a fraction; for a takeover, the premium offered. */
  move: number;
  rumour?: GameTime;
  where?: Rumour['where'];
  /** Log move a rumour has already put into the price. */
  leaked?: number;
}

/** Work the clock does at a set time. */
export type Task =
  | { do: 'fire'; plan: number }
  | { do: 'rumour'; plan: number }
  | { do: 'followUp'; news: number; move: number; persist: number }
  | { do: 'dealClose'; news: number }
  | { do: 'delist'; company: number }
  | { do: 'dump'; company: number; move: number }
  | { do: 'release'; kind: MacroKind }
  | { do: 'pick'; kind: 'tvPick' | 'fowlPick'; company: number; move: number }
  | { do: 'redeem'; client: number }
  // Phase 7: a recalled short falls due; the weather hits or OPEK announces.
  | { do: 'buyIn'; company: number }
  | { do: 'outlook'; id: number }
  // Phase 8: an annual meeting counts its votes; an SOB audit reports.
  | { do: 'meeting'; meeting: number }
  | { do: 'audit' };

export type Timed = Task & { time: GameTime; seq: number };

export interface EventsState {
  /** Sorted by time, then by when it was scheduled. */
  queue: Timed[];
  seq: number;
  /** Events decided but not yet fired. */
  plans: PlannedEvent[];
  nextPlan: number;
  /** The last trading day whose events have been decided. */
  planned: number;
  /** The news archive (spec §14.1), oldest first; an item's id is its index. */
  news: NewsItem[];
  rumours: Rumour[];
  /** Company → CEO code, for companies whose CEO has changed (spec §11.6). */
  ceos: Record<number, string>;
}

export const newEvents = (): EventsState => ({ queue: [], seq: 0, plans: [], nextPlan: 1, planned: -1, news: [], rumours: [], ceos: {} });

/** Adds a task to the queue, after anything already due at the same time. */
export function enqueue(state: EventsState, time: GameTime, task: Task): void {
  const timed = { ...task, time, seq: state.seq++ } as Timed;
  const q = state.queue;
  let lo = 0;
  let hi = q.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (q[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  q.splice(lo, 0, timed);
}

export { addTradingDays };

/** Each event type's weight for a company: its rate, industry, quality and size. */
function typeWeights(c: Company, tier: number): number[] {
  return EVENT_TYPES.map((t) => {
    const industry = t.industries?.[c.industry.id] ?? t.others ?? 1;
    const quality = t.quality ? Math.exp(t.quality * (c.quality - 0.5)) : 1;
    return t.rate * industry * quality * (t.tiers?.[tier] ?? 1);
  });
}

/** Chance per trading day that each company has an event, scaled by the event-frequency setting. */
export function eventRates(companies: readonly Company[], tiers: ArrayLike<number>, frequency: number): Float64Array {
  return Float64Array.from(companies, (c, i) => (typeWeights(c, tiers[i]).reduce((a, b) => a + b, 0) * frequency) / 252);
}

/** Decides the events of every trading day up to HORIZON_DAYS ahead of `today` not decided yet. */
export function planAhead(sim: Sim, today: number, rates: Float64Array): void {
  const ev = sim.s.events;
  const last = addTradingDays(today, HORIZON_DAYS);
  for (let day = ev.planned < today ? today : nextTradingDay(ev.planned); day <= last; day = nextTradingDay(day)) {
    planDay(sim, day, rates);
    ev.planned = day;
  }
}

function planDay(sim: Sim, day: number, rates: Float64Array): void {
  const rng = sim.rng.events;
  const { status } = sim.market.state;
  const tiers = sim.s.world.tiers;
  for (let i = 0; i < rates.length; i++) {
    if (status[i] || rng.float() >= rates[i]) continue;
    const c = sim.companies[i];
    const type = EVENT_TYPES[rng.weighted(typeWeights(c, tiers[i]))];
    const draft = draftEvent(sim, type, i, rng);
    if (draft !== undefined) plan(sim, type.kind, i, eventTime(sim, day, rng), draft, type.leak);
  }
}

/** A time on `day`: before the bell (in the pre-market, as news breaks overnight) or at a bar during the session. */
function eventTime(sim: Sim, day: number, rng: Rng): GameTime {
  const time = rng.chance(0.35) ? at(day, 7 * 60 + 30 + 15 * rng.int(0, 5)) : at(day, OPEN + 5 * rng.int(1, 77));
  return time > sim.time ? time : sim.time + 5 * rng.int(1, 12);
}

/** The event's move, signed; undefined when it can't happen to this company. */
function draftEvent(sim: Sim, type: EventType, i: number, rng: Rng): number | undefined {
  const c = sim.companies[i];
  const f = sim.s.fundamentals;
  const [lo, hi] = type.move;
  if (type.kind === 'takeover') return lo + (hi - lo) * rng.float();
  if (type.kind === 'bankruptcy') return -(lo + (hi - lo) * rng.float());
  const cap = sim.market.price[i] * sim.model.shares[i];
  const size = Math.min(1.5, Math.max(0.6, (cap / 10e9) ** -0.08));
  const magnitude = (lo + (hi - lo) * rng.float() ** 1.6) * size;
  let up = type.sign ? type.sign > 0 : rng.chance(0.5 + 0.3 * (c.quality - 0.5));
  if (type.kind === 'dividendChange') {
    const payer = f.dividend[i] > 0;
    if (!payer && f.income[i] <= 0) return undefined;
    up = !payer || (f.income[i] > 0 ? rng.chance(0.65 + 0.3 * (c.quality - 0.5)) : rng.chance(0.2));
  }
  return up ? magnitude : -Math.min(0.97, magnitude);
}

/** Schedules an event and, maybe, its rumour. Returns the plan. */
export function plan(sim: Sim, kind: PlannedEvent['kind'], company: number, time: GameTime, move: number, leak: number, where?: Rumour['where']): PlannedEvent {
  const ev = sim.s.events;
  const rng = sim.rng.events;
  const p: PlannedEvent = { id: ev.nextPlan++, kind, company, time, move };
  if (leak && rng.chance(leak)) {
    const day = dayOf(time);
    const before = rng.int(0, 3);
    let rumour: GameTime;
    if (!before) rumour = Math.max(at(day, 7 * 60), time - rng.int(30, 300));
    else {
      let d = day;
      for (let k = 0; k < before; k++) d = previousTradingDay(d);
      rumour = at(d, OPEN + 5 * rng.int(1, 77));
    }
    if (rumour > sim.time && rumour < time) {
      p.rumour = rumour;
      p.where = where ?? (rng.chance(0.6) ? 'forum' : 'trade');
      enqueue(ev, rumour, { do: 'rumour', plan: p.id });
    }
  }
  ev.plans.push(p);
  enqueue(ev, time, { do: 'fire', plan: p.id });
  return p;
}

function takePlan(sim: Sim, id: number): PlannedEvent | undefined {
  const plans = sim.s.events.plans;
  const k = plans.findIndex((p) => p.id === id);
  return k < 0 ? undefined : plans.splice(k, 1)[0];
}

/**
 * A price jump spread over 1–6 bars, with value following `persist` of it (more for better-run companies). Short sellers
 * make good news jump further, but value follows only the news.
 */
function jump(sim: Sim, i: number, logMove: number, persist: number, bars = sim.rng.events.int(1, 6)): void {
  const { jump, jumpBars, lnV } = sim.market.state;
  jump[i] += sim.squeeze(i, logMove);
  jumpBars[i] = Math.max(jumpBars[i], bars);
  lnV[i] += logMove * persist * (1 + 0.4 * (sim.model.quality[i] - 0.5));
}

const expectedLog = (p: PlannedEvent) =>
  p.kind === 'takeover' ? Math.log1p(p.move * 0.8) : Math.log1p(p.move);

/** A rumour leaks (spec §11.7): the informed trade early, putting part of the move into the price. */
export function leak(sim: Sim, id: number): void {
  const p = sim.s.events.plans.find((x) => x.id === id);
  if (!p || sim.market.state.status[p.company]) return;
  const rng = sim.rng.events;
  // News-driven moves scale with credibility (spec §11.7): the boards move a price less than the trade press.
  const credibility = (p.where === 'trade' ? TRADE_CREDIBILITY : FORUM_CREDIBILITY) / TRADE_CREDIBILITY;
  const moved = expectedLog(p) * rng.range(...LEAK_SHARE) * credibility;
  jump(sim, p.company, moved, 0, rng.int(3, 12));
  p.leaked = moved;
  sim.s.events.rumours.push({
    time: sim.time, company: p.company, kind: p.kind, direction: p.move >= 0 ? 1 : -1, where: p.where ?? 'forum',
  });
}

/** An event happens. */
export function fire(sim: Sim, id: number): void {
  const p = takePlan(sim, id);
  if (!p || sim.market.state.status[p.company]) return;
  const i = p.company;
  const rng = sim.rng.events;
  const leaked = p.leaked ?? 0;
  if (p.kind === 'pump') {
    // A pump-and-dump (spec §15.4 bait): the hype lifts it, then the promoters sell into the buying.
    jump(sim, i, Math.log1p(p.move) - leaked, 0);
    enqueue(sim.s.events, at(addTradingDays(dayOf(sim.time), rng.int(1, 3)), OPEN + 5 * rng.int(1, 77)), {
      do: 'dump', company: i, move: -rng.range(0.2, 0.35),
    });
    return;
  }
  // The SOB's surveillance looks at who traded just before (spec §16B).
  surveil(sim, i, p.move, p.id);
  const type = EVENT_TYPE[p.kind];
  const base = { kind: p.kind, company: i, rumour: p.rumour } as const;
  switch (p.kind) {
    case 'takeover':
      return takeover(sim, p);
    case 'activist': {
      // Only a firm whose fund can afford the stake takes it (spec §16).
      const stake = rng.range(0.05, 0.099);
      const aums = firmAums(sim);
      const affords = (k: number) => aums[k] >= 3 * stake * sim.model.shares[i] * sim.market.price[i];
      const firm = pickFirm(sim, rng, (f, k) => f.strategy === 'activist' && affords(k)) ?? pickFirm(sim, rng, (f, k) => f.strategy !== 'index' && affords(k));
      if (firm === undefined) return;
      addHolding(sim, i, firm, Math.round(stake * sim.model.shares[i]));
      jump(sim, i, Math.log1p(p.move) - leaked, type.persist);
      return followUp(sim, sim.report({ ...base, move: p.move, firm, level: stake }), type, p.move);
    }
    case 'investment': {
      const others = rng.chance(0.7) ? topCompanies(sim, i) : [];
      const other = others.length ? rng.pick(others) : undefined;
      const firm = other === undefined ? pickFirm(sim, rng, () => true) : undefined;
      if (other === undefined && firm === undefined) return;
      const amount = sim.market.price[i] * sim.model.shares[i] * rng.range(0.03, 0.15);
      jump(sim, i, Math.log1p(p.move) - leaked, type.persist);
      return followUp(sim, sim.report({ ...base, move: p.move, other, firm, amount }), type, p.move);
    }
    case 'ceoChange': {
      const ceos = sim.s.events.ceos;
      const prevCeo = ceos[i] ?? encodeCeo(companyCeo(sim.companies[i].genes));
      const ceo = encodeCeo(randomCeo(rng, sim.companies[i].industry));
      ceos[i] = ceo;
      jump(sim, i, Math.log1p(p.move) - leaked, type.persist);
      return followUp(sim, sim.report({ ...base, move: p.move, ceo, prevCeo }), type, p.move);
    }
    case 'dividendChange': {
      const f = sim.s.fundamentals;
      const prev = f.dividend[i];
      const level =
        p.move > 0
          ? prev > 0 ? prev * (1 + rng.range(0.05, 0.3)) : sim.market.price[i] * rng.range(0.01, 0.03)
          : rng.chance(0.2) ? 0 : prev * rng.range(0.2, 0.8);
      f.dividend[i] = level;
      jump(sim, i, Math.log1p(p.move) - leaked, type.persist);
      return followUp(sim, sim.report({ ...base, move: p.move, level, prev }), type, p.move);
    }
    case 'bankruptcy':
      jump(sim, i, Math.log1p(p.move) - leaked, 1, rng.int(1, 3));
      sim.report({ ...base, move: p.move });
      enqueue(sim.s.events, at(dayOf(sim.time), CLOSE), { do: 'delist', company: i });
      return;
    default: {
      jump(sim, i, Math.log1p(p.move) - leaked, type.persist);
      // A contract's value, as the company announces it.
      const amount = p.kind === 'contract' ? sim.market.price[i] * sim.model.shares[i] * rng.range(0.02, 0.2) : undefined;
      const item = sim.report({ ...base, move: p.move, amount });
      // A scandal or a fraud often costs the chief executive their job a few days later.
      const resign = p.kind === 'scandal' ? 0.4 : p.kind === 'fraud' ? 0.6 : 0;
      if (resign && rng.chance(resign)) {
        const day = addTradingDays(dayOf(sim.time), rng.int(1, 5));
        plan(sim, 'ceoChange', i, at(day, OPEN + 5 * rng.int(1, 77)), rng.range(0.01, 0.06), 0);
      }
      return followUp(sim, item, type, p.move);
    }
  }
}

/** The next morning's papers dig in (spec §11.7): the story either gets worse (or better) or the move was overdone. */
function followUp(sim: Sim, item: NewsItem, type: EventType, move: number): void {
  const rng = sim.rng.events;
  if (!rng.chance(type.followUp)) return;
  const quality = sim.model.quality[item.company];
  const continues = rng.chance(0.5 + 0.4 * (quality - 0.5) * Math.sign(move));
  const f = (continues ? 1 : -1) * rng.range(0.15, 0.4);
  const day = nextTradingDay(dayOf(sim.time));
  enqueue(sim.s.events, at(day, 7 * 60 + 30), { do: 'followUp', news: item.id, move: f * Math.log1p(move), persist: continues ? type.persist : 0 });
}

export function applyFollowUp(sim: Sim, task: Extract<Task, { do: 'followUp' }>): void {
  const item = sim.s.events.news[task.news];
  if (!item || sim.market.state.status[item.company]) return;
  jump(sim, item.company, task.move, task.persist);
  item.follow = Math.expm1(task.move);
}

/**
 * A takeover bid (spec §11.6–11.7): the target jumps to 70–95% of the premium, its value to the offer; the acquirer
 * slips. The deal completes (the target is delisted at the offer price) or falls apart 20–60 trading days later.
 */
function takeover(sim: Sim, p: PlannedEvent): void {
  const rng = sim.rng.events;
  const i = p.company;
  const { price } = sim.market;
  const undisturbed = price[i] / Math.exp(p.leaked ?? 0);
  const offer = undisturbed * (1 + p.move);
  const target = undisturbed * (1 + p.move * rng.range(...TAKEOVER_JUMP));
  const firm = rng.chance(0.25) ? pickFirm(sim, rng, (f) => f.strategy !== 'index') : undefined;
  const other = firm === undefined ? acquirer(sim, i, rng) : undefined;
  if (firm === undefined && other === undefined) return;
  const s = sim.market.state;
  s.jump[i] += Math.log(target / price[i]);
  s.jumpBars[i] = rng.int(1, 3);
  s.lnV[i] = Math.log(offer * 0.97);
  if (other !== undefined) jump(sim, other, Math.log1p(-rng.range(0.01, 0.05)), 0.5);
  const item = sim.report({
    kind: 'takeover', company: i, rumour: p.rumour, move: target / undisturbed - 1, amount: offer * sim.model.shares[i],
    level: offer, prev: undisturbed, other, firm,
  });
  const day = addTradingDays(dayOf(sim.time), rng.int(...TAKEOVER_DAYS));
  enqueue(sim.s.events, at(day, CLOSE), { do: 'dealClose', news: item.id });
  // Shareholders vote on it (spec §15.5): the player too, if it holds enough of the target.
  mergerMeeting(sim, item, day);
}

export function closeDeal(sim: Sim, newsId: number): void {
  const bid = sim.s.events.news[newsId];
  const i = bid.company;
  if (sim.market.state.status[i]) return;
  const rng = sim.rng.events;
  const deal = { company: i, other: bid.other, firm: bid.firm, amount: bid.amount, level: bid.level, prev: bid.prev };
  // The target's shareholders can turn it down; then regulators and financing have their say.
  if (mergerApproved(sim, newsId) && rng.chance(TAKEOVER_COMPLETES)) {
    sim.report({ kind: 'takeoverDone', ...deal });
    sim.delist(i, LISTING.acquired, bid.level!);
    return;
  }
  const back = bid.prev! * rng.range(0.92, 1.05);
  const s = sim.market.state;
  const move = back / sim.market.price[i] - 1;
  s.jump[i] += Math.log1p(move);
  s.jumpBars[i] = rng.int(1, 3);
  s.lnV[i] = Math.log(back * rng.range(0.95, 1.08));
  sim.report({ kind: 'takeoverFail', ...deal, move });
}

/** A larger company to buy the target: the same industry more often than not. */
function acquirer(sim: Sim, target: number, rng: Rng): number | undefined {
  const { price, state } = sim.market;
  const { shares, sector } = sim.model;
  const cap = price[target] * shares[target];
  const same: number[] = [];
  const any: number[] = [];
  for (let i = 0; i < price.length; i++) {
    if (i === target || state.status[i] || price[i] * shares[i] < 3 * cap) continue;
    any.push(i);
    if (sector[i] === sector[target]) same.push(i);
  }
  const pool = same.length && rng.chance(0.6) ? same : any;
  return pool.length ? rng.pick(pool) : undefined;
}

/** Listed companies among the top 100 (strategic investors), other than `except`. */
function topCompanies(sim: Sim, except: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(100, sim.companies.length); i++) if (i !== except && sim.companies[i].curated && !sim.market.state.status[i]) out.push(i);
  return out;
}

function pickFirm(sim: Sim, rng: Rng, test: (f: Sim['s']['world']['firms'][number], k: number) => boolean): number | undefined {
  const ids = sim.s.world.firms.flatMap((f, k) => (test(f, k) ? [k] : []));
  return ids.length ? rng.pick(ids) : undefined;
}

/** A disclosed stake (spec §10.5 holders table), kept sorted by company, largest holder first; bought at `price`. */
export function addHolding(sim: Sim, company: number, firm: number, shares: number, price = sim.market.price[company]): void {
  const holdings = sim.s.world.holdings;
  const existing = holdings.find((h) => h.company === company && h.firm === firm);
  // The firm pays for the shares out of its fund, and files with the SOB (spec §14).
  const bought = Math.max(0, shares - (existing?.shares ?? 0));
  sim.s.competitors.books[firm].cash -= bought * price;
  if ((existing?.shares ?? 0) < 0.05 * sim.model.shares[company] && shares >= 0.05 * sim.model.shares[company]) {
    fileStake(sim, firm, company, shares / sim.model.shares[company]);
  }
  if (existing) existing.shares = Math.max(existing.shares, shares);
  else {
    let k = holdings.findIndex((h) => h.company > company);
    if (k < 0) k = holdings.length;
    holdings.splice(k, 0, { company, firm, shares });
  }
  const rows = holdings.filter((h) => h.company === company).sort((a, b) => b.shares - a.shares);
  const first = holdings.findIndex((h) => h.company === company);
  holdings.splice(first, rows.length, ...rows);
}

export function dump(sim: Sim, company: number, move: number): void {
  if (!sim.market.state.status[company]) jump(sim, company, Math.log1p(move), 0);
}

/**
 * The day's stock picks, decided before the open: MoneyTV's Stock of the Day (yesterday's hottest large cap, on air at
 * noon) and the Motley Fowl's small-cap pick (in the morning newsletter). Retail buying lifts both a little, for a while.
 */
export function planPicks(sim: Sim, day: number): void {
  const rng = sim.rng.events;
  const { price, state } = sim.market;
  const { shares, quality } = sim.model;
  const hot: number[] = [];
  const small: number[] = [];
  for (let i = 0; i < price.length; i++) {
    if (state.status[i]) continue;
    if (price[i] * shares[i] >= 5e9) hot.push(i);
    const cap = sim.companies[i].marketCap;
    if (cap >= 300e6 && cap < 2e9 && quality[i] >= 0.6) small.push(i);
  }
  hot.sort((a, b) => price[b] / state.prevClose[b] - price[a] / state.prevClose[a] || a - b);
  const events = sim.s.events;
  if (hot.length) enqueue(events, at(day, 12 * 60), { do: 'pick', kind: 'tvPick', company: rng.pick(hot.slice(0, 5)), move: rng.range(0.005, 0.03) });
  if (small.length) enqueue(events, at(day, 9 * 60), { do: 'pick', kind: 'fowlPick', company: rng.pick(small), move: rng.range(0.01, 0.05) });
}

export function pick(sim: Sim, task: Extract<Task, { do: 'pick' }>): void {
  if (sim.market.state.status[task.company]) return;
  jump(sim, task.company, Math.log1p(task.move), 0, sim.rng.events.int(6, 30));
  sim.report({ kind: task.kind, company: task.company, move: task.move });
}
