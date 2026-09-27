import { randomCeo, encodeCeo, ceoName } from '../world/ceo';
import type { Rng } from '../world/rng';
import { addTradingDays, dayOf, nextTradingDay, type GameTime } from './calendar';
import type { Sim } from './context';
import { FUNDS } from './data/funds';
import { jump } from './events';
import { firstTradingDay } from './loans';
import { makeTip } from './mail';
import { employed } from './staff';

/**
 * The trading desk (spec §4A): the Trader's automated rules (Task Mangler lists them), price alerts and the pager, the
 * firm's ISeekYou contacts and their messages, MajorWord's quarterly letters to clients, and the Y2K scare (spec §14.2).
 * Messages are stored as facts, as mail is; ISeekYou words them when they are read.
 */
export type Rule =
  | { id: number; kind: 'stopLoss'; company: number; pct: number; created: GameTime }
  | { id: number; kind: 'dca'; company?: number; fund?: number; amount: number; every: 'week' | 'month'; next: number; created: GameTime }
  | { id: number; kind: 'rebalance'; targets: Target[]; next: number; created: GameTime };

/** A holding's target share of the book (the Portfolio Defragmenter's weights). */
export interface Target {
  company?: number;
  fund?: number;
  weight: number;
}

export type RuleRequest = Rule extends infer R ? (R extends Rule ? Omit<R, 'id' | 'created' | 'next'> : never) : never;

/** A price alert (spec §4A Pager): pages when the price reaches `level` from below (`above`) or above. */
export interface Alert {
  id: number;
  company: number;
  above: boolean;
  level: number;
}

/**
 * A page (spec §4A): a numeric code with a text expansion. 911 margin call, 411 price alert, 0800 urgent mail, 7337 a rule
 * that fired.
 */
export interface Page {
  id: number;
  time: GameTime;
  code: '911' | '411' | '0800' | '7337';
  company?: number;
  level?: number;
  above?: boolean;
  /** The urgent letter's id. */
  mail?: number;
}

export type ContactKind = 'broker' | 'mom' | 'staff' | 'informant' | 'journalist' | 'rival';

/** Someone on ISeekYou (spec §4A): the broker, staff, informants, bribed journalists, rival CEOs and your mother. */
export interface Contact {
  id: number;
  kind: ContactKind;
  name: string;
  /** A portrait code, for informants (staff, journalists and rivals have their own). */
  ceo?: string;
  /** The employee, journalist or firm behind the contact. */
  ref?: number;
  since: GameTime;
  /** An informant's tips are genuine this often, and the next arrives on this trading day. */
  reliability?: number;
  next?: number;
  where?: string;
  blocked?: boolean;
}

export type ImTopic = 'hello' | 'marginNag' | 'momChat' | 'tip' | 'report' | 'stopped' | 'dca' | 'dcaFailed' | 'rebalanced' | 'taunt' | 'poached';
export type ImChoice = 'hi' | 'thanks' | 'more' | 'report' | 'onIt' | 'notNow' | 'love' | 'busy' | 'congrats' | 'justWait';

/** The replies a message offers (spec §4A: conversations use multiple-choice replies). */
export const CHOICES: Partial<Record<ImTopic, readonly ImChoice[]>> = {
  hello: ['hi'],
  marginNag: ['onIt', 'notNow'],
  momChat: ['love', 'busy'],
  tip: ['thanks', 'more', 'report'],
  taunt: ['congrats', 'justWait'],
};

export interface ImMessage {
  id: number;
  contact: number;
  time: GameTime;
  topic: ImTopic;
  read: boolean;
  company?: number;
  fund?: number;
  amount?: number;
  direction?: 1 | -1;
  /** A tip (mail.ts Tip id): what it claims, and the day it should come true by. */
  tip?: number;
  claim?: string;
  day?: number;
  variant?: number;
  choices?: readonly ImChoice[];
  answer?: ImChoice;
}

export interface DeskState {
  rules: Rule[];
  nextRule: number;
  alerts: Alert[];
  nextAlert: number;
  pages: Page[];
  nextPage: number;
  contacts: Contact[];
  messages: ImMessage[];
  /** The quarter (year × 4 + 0…3) of the last letter to clients (MajorWord), and its tone. */
  letter?: { quarter: number; tone: Tone };
}

/** How a quarterly letter to clients is written (spec §4A MajorWord). */
export type Tone = 'confident' | 'humble' | 'blame' | 'silent';

const PAGES_KEPT = 50;
const MESSAGES_KEPT = 400;

export function newDesk(time: GameTime): DeskState {
  return {
    rules: [], nextRule: 1, alerts: [], nextAlert: 1, pages: [], nextPage: 1, messages: [],
    contacts: [
      { id: 1, kind: 'broker', name: 'Vinnie (MajorTrade Pro)', since: time },
      { id: 2, kind: 'mom', name: 'Mom', since: time },
    ],
  };
}

export const quarterOf = (day: number) => {
  const d = new Date(day * 86_400_000);
  return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
};

// ---------- Rules (spec §4A: the Trader runs stop-losses, rebalancing and dollar-cost averaging) ----------

export function addRule(sim: Sim, r: RuleRequest): Rule | string {
  const d = sim.s.desk;
  const day = dayOf(sim.time);
  const listed = (i?: number) => i !== undefined && Number.isInteger(i) && i >= 0 && i < sim.companies.length && !sim.market.state.status[i];
  switch (r.kind) {
    case 'stopLoss':
      if (!listed(r.company)) return 'Choose a listed company.';
      if (!(r.pct > 0 && r.pct < 1)) return 'Enter a stop between 0% and 100%.';
      break;
    case 'dca':
      if (r.fund === undefined ? !listed(r.company) : !FUNDS[r.fund]) return 'Choose a company or a fund to buy.';
      if (!(r.amount >= 1_000)) return 'Buy at least $1,000 each time.';
      break;
    case 'rebalance': {
      const total = r.targets.reduce((a, t) => a + t.weight, 0);
      if (!r.targets.length || total > 1 + 1e-9 || r.targets.some((t) => !(t.weight >= 0))) return 'The weights must add up to 100% or less.';
      if (r.targets.some((t) => (t.fund === undefined ? !listed(t.company) : !FUNDS[t.fund]))) return 'Only listed companies and funds can be targets.';
      // One monthly defragmentation at a time.
      d.rules = d.rules.filter((x) => x.kind !== 'rebalance');
      break;
    }
  }
  const next = r.kind === 'stopLoss' ? undefined : nextRun(day, r.kind === 'dca' ? r.every : 'month', true);
  const rule = { ...r, id: d.nextRule++, created: sim.time, ...(next !== undefined ? { next } : {}) } as Rule;
  d.rules.push(rule);
  return rule;
}

export function removeRule(sim: Sim, id: number): boolean {
  const d = sim.s.desk;
  const before = d.rules.length;
  d.rules = d.rules.filter((r) => r.id !== id);
  return d.rules.length < before;
}

/** The trading day a periodic rule next runs: a week on, or the first trading day of next month (today's, when starting). */
function nextRun(day: number, every: 'week' | 'month', first = false): number {
  if (every === 'week') return first ? nextTradingDay(day) : addTradingDays(day, 5);
  const d = new Date(day * 86_400_000);
  return firstTradingDay(d.getUTCFullYear() * 12 + d.getUTCMonth() + 1);
}

/** The Trader on staff, if any: rules only run while one is employed. */
const trader = (sim: Sim) => employed(sim, 'trader')[0];

/**
 * Each bar (spec §4A): stop-losses close positions that have fallen `pct` below their average cost (a short, risen above
 * it); price alerts page the player.
 */
export function workDesk(sim: Sim): void {
  const d = sim.s.desk;
  const { price, state } = sim.market;
  if (d.alerts.length) {
    for (const a of d.alerts.slice()) {
      const p = price[a.company];
      if (state.status[a.company] || (a.above ? p < a.level : p > a.level)) continue;
      d.alerts = d.alerts.filter((x) => x.id !== a.id);
      sim.page({ code: '411', company: a.company, level: a.level, above: a.above });
    }
  }
  if (!d.rules.length) return;
  const t = trader(sim);
  if (!t) return;
  for (const r of d.rules.slice()) {
    if (r.kind !== 'stopLoss') continue;
    const position = sim.s.account.positions.find((p) => p.company === r.company);
    if (!position || state.status[r.company]) {
      if (!position) continue;
      removeRule(sim, r.id);
      continue;
    }
    const cost = position.cost / position.shares;
    const long = position.shares > 0;
    if (long ? price[r.company] > cost * (1 - r.pct) : price[r.company] < cost * (1 + r.pct)) continue;
    const result = sim.placeOrder({ company: r.company, side: long ? 'sell' : 'cover', type: 'market', shares: Math.abs(position.shares), tif: 'day' });
    if ('error' in result) continue;
    removeRule(sim, r.id);
    sim.page({ code: '7337', company: r.company });
    sim.im({ contact: contactOf(sim, 'staff', t.id), topic: 'stopped', company: r.company, amount: result.order.filled });
  }
}

/** At the open: dollar-cost averaging and the monthly rebalance fall due. */
export function openDesk(sim: Sim, day: number): void {
  const d = sim.s.desk;
  const t = trader(sim);
  if (!t) return;
  const contact = contactOf(sim, 'staff', t.id);
  for (const r of d.rules.slice()) {
    if (r.kind === 'stopLoss' || r.next > day) continue;
    r.next = nextRun(day, r.kind === 'dca' ? r.every : 'month');
    if (r.kind === 'dca') {
      const result = r.fund !== undefined ? buyFund(sim, r.fund, r.amount) : buyStock(sim, r.company!, r.amount);
      sim.im({ contact, topic: result ? 'dcaFailed' : 'dca', company: r.company, fund: r.fund, amount: r.amount });
      continue;
    }
    const orders = rebalanceOrders(r.targets, holdingsOf(sim), (t) => priceOf(sim, t), sim.nav());
    for (const o of orders) {
      if (o.fund !== undefined) sim.tradeFund(o.fund, o.shares);
      else sim.placeOrder({ company: o.company!, side: o.shares > 0 ? 'buy' : 'sell', type: 'market', shares: Math.abs(o.shares), tif: 'day' });
    }
    sim.im({ contact, topic: 'rebalanced', amount: orders.length });
  }
}

function buyStock(sim: Sim, company: number, amount: number): string | undefined {
  const shares = Math.floor(amount / sim.market.price[company]);
  if (shares < 1) return 'Not enough for a share.';
  const r = sim.placeOrder({ company, side: 'buy', type: 'market', shares, tif: 'day' });
  return 'error' in r ? r.error : undefined;
}

function buyFund(sim: Sim, fund: number, amount: number): string | undefined {
  const units = Math.floor(amount / sim.fundPrice(fund));
  if (units < 1) return 'Not enough for a unit.';
  const r = sim.tradeFund(fund, units);
  return 'error' in r ? r.error : undefined;
}

/** The book's holdings as defragmentation sees them: long stock positions and fund units. */
export function holdingsOf(sim: Sim): { company?: number; fund?: number; units: number }[] {
  return [
    ...sim.s.account.positions.filter((p) => p.shares > 0).map((p) => ({ company: p.company, units: p.shares })),
    ...sim.s.account.funds.map((f) => ({ fund: f.fund, units: f.units })),
  ];
}

const priceOf = (sim: Sim, t: { company?: number; fund?: number }) => (t.fund !== undefined ? sim.fundPrice(t.fund) : sim.market.price[t.company!]);

/**
 * The orders that take a book to target weights of `base` (spec §4A Portfolio Defragmenter): whole shares and units,
 * sales first so their cash pays for the purchases. Holdings without a target are left alone.
 */
export function rebalanceOrders(
  targets: readonly Target[],
  holdings: readonly { company?: number; fund?: number; units: number }[],
  price: (t: { company?: number; fund?: number }) => number,
  base: number,
): { company?: number; fund?: number; shares: number }[] {
  const same = (a: { company?: number; fund?: number }, b: { company?: number; fund?: number }) => (a.fund !== undefined ? a.fund === b.fund : b.fund === undefined && a.company === b.company);
  const out = targets.flatMap((t) => {
    const held = holdings.find((h) => same(h, t))?.units ?? 0;
    const p = price(t);
    const want = p > 0 ? Math.floor((t.weight * base) / p) : held;
    const shares = want - held;
    return shares ? [{ ...(t.fund !== undefined ? { fund: t.fund } : { company: t.company }), shares }] : [];
  });
  return out.sort((a, b) => a.shares - b.shares);
}

// ---------- Price alerts and the pager ----------

export function addAlert(sim: Sim, company: number, level: number): Alert | string {
  if (!Number.isInteger(company) || company < 0 || company >= sim.companies.length || sim.market.state.status[company]) return 'Choose a listed company.';
  if (!(level > 0)) return 'Enter a price.';
  const d = sim.s.desk;
  const alert = { id: d.nextAlert++, company, level, above: level > sim.market.price[company] };
  d.alerts.push(alert);
  return alert;
}

export function removeAlert(sim: Sim, id: number): void {
  sim.s.desk.alerts = sim.s.desk.alerts.filter((a) => a.id !== id);
}

export function pushPage(sim: Sim, page: Omit<Page, 'id' | 'time'>): void {
  const d = sim.s.desk;
  d.pages.push({ ...page, id: d.nextPage++, time: sim.time });
  if (d.pages.length > PAGES_KEPT) d.pages.splice(0, d.pages.length - PAGES_KEPT);
}

// ---------- ISeekYou (spec §4A) ----------

export function pushMessage(sim: Sim, m: Omit<ImMessage, 'id' | 'time' | 'read'>): ImMessage {
  const d = sim.s.desk;
  const message: ImMessage = { ...m, id: (d.messages.at(-1)?.id ?? 0) + 1, time: sim.time, read: false, choices: m.choices ?? CHOICES[m.topic] };
  for (const key of Object.keys(message) as (keyof ImMessage)[]) if (message[key] === undefined) delete message[key];
  d.messages.push(message);
  if (d.messages.length > MESSAGES_KEPT) d.messages.splice(0, d.messages.length - MESSAGES_KEPT);
  return message;
}

/** The contact for someone (an employee, a journalist, a firm), added on first contact. */
export function contactOf(sim: Sim, kind: ContactKind, ref?: number, name?: string): number {
  const d = sim.s.desk;
  const found = d.contacts.find((c) => c.kind === kind && c.ref === ref);
  if (found) return found.id;
  const contact: Contact = { id: d.contacts.length + 1, kind, name: name ?? nameOf(sim, kind, ref), since: sim.time };
  if (ref !== undefined) contact.ref = ref;
  d.contacts.push(contact);
  return contact.id;
}

function nameOf(sim: Sim, kind: ContactKind, ref?: number): string {
  switch (kind) {
    case 'staff':
      return sim.s.staff.people.find((p) => p.id === ref)?.name ?? 'A colleague';
    case 'journalist':
      return sim.s.journalists[ref ?? -1]?.name ?? 'A reporter';
    case 'rival':
      return sim.s.world.firms[ref ?? -1]?.name ?? 'A rival';
    default:
      return kind;
  }
}

/** An informant met at a conference (spec §14.2): they send tips over ISeekYou, genuine as often as their reliability. */
export function addInformant(sim: Sim, rng: Rng, where: string): Contact {
  const d = sim.s.desk;
  const ceo = randomCeo(rng);
  const contact: Contact = {
    id: d.contacts.length + 1, kind: 'informant', name: ceoName(ceo), ceo: encodeCeo(ceo), since: sim.time, where,
    reliability: rng.range(0.35, 0.8), next: addTradingDays(dayOf(sim.time), rng.int(3, 12)),
  };
  d.contacts.push(contact);
  sim.im({ contact: contact.id, topic: 'hello', variant: rng.int(0, 999) });
  return contact;
}

/** An informant's tip: genuine inside information, bait or nonsense, like the anonymous tips by mail (spec §15.4). */
export function informantTip(sim: Sim, contact: Contact, rng: Rng): void {
  const tip = makeTip(sim, rng, contact.reliability ?? 0.5);
  sim.im({ contact: contact.id, topic: 'tip', tip: tip.id, company: tip.company, direction: tip.direction, claim: tip.claim, day: dayOf(tip.until), variant: rng.int(0, 999) });
}

/** A reply to a message. Reporting an informant's tip to the SOB earns a little reputation and ends the acquaintance. */
export function answer(sim: Sim, id: number, choice: ImChoice): string | undefined {
  const d = sim.s.desk;
  const m = d.messages.find((x) => x.id === id);
  if (!m || !m.choices?.includes(choice)) return 'You cannot reply that.';
  if (m.answer) return 'You have already replied.';
  m.answer = choice;
  m.read = true;
  if (m.topic === 'tip' && choice === 'report') {
    const tip = sim.s.mail.tips.find((t) => t.id === m.tip);
    if (tip) tip.reported = true;
    sim.s.clients.reputation = Math.min(100, sim.s.clients.reputation + 1);
    const c = d.contacts.find((x) => x.id === m.contact);
    if (c) c.blocked = true;
  }
  return undefined;
}

export function markRead(sim: Sim, contact: number): void {
  for (const m of sim.s.desk.messages) if (m.contact === contact) m.read = true;
}

/** Each morning: informants' tips fall due. At a week's end Mom may say hello. */
export function morningDesk(sim: Sim, day: number): void {
  const rng = sim.rng.extras;
  for (const c of sim.s.desk.contacts) {
    if (c.kind !== 'informant' || c.blocked || c.next === undefined || day < c.next) continue;
    c.next = addTradingDays(day, rng.int(8, 20));
    informantTip(sim, c, rng);
  }
}

export function weeklyDesk(sim: Sim): void {
  const rng = sim.rng.extras;
  if (rng.chance(0.3)) sim.im({ contact: 2, topic: 'momChat', variant: rng.int(0, 999) });
}

// ---------- MajorWord's quarterly letter to clients (spec §4A) ----------

/**
 * A letter to every client in the tone chosen: it nudges their mood by how the last quarter really went. Confidence
 * pleases after a good quarter and grates after a bad one; humility is always taken kindly; blaming the Federal Reservoir
 * works only when the whole market fell; silence after a bad quarter is noticed. One letter a quarter.
 */
export function clientLetter(sim: Sim, tone: Tone): { mood: number } | string {
  const d = sim.s.desk;
  const quarter = quarterOf(dayOf(sim.time));
  if (d.letter?.quarter === quarter) return 'You have already written to your clients this quarter.';
  const active = sim.s.clients.clients.filter((c) => c.status === 'active');
  if (!active.length) return 'You have no clients to write to.';
  const last = findLastQuarter(sim);
  const excess = last ? last.move! - last.expect! : 0;
  const market = last?.expect ?? 0;
  const good = excess >= 0;
  const mood = { confident: good ? 8 : -8, humble: good ? 2 : 5, blame: good ? -3 : market < 0 ? 4 : -6, silent: good ? 0 : -2 }[tone];
  for (const c of active) c.mood = Math.min(100, Math.max(0, c.mood + mood));
  d.letter = { quarter, tone };
  sim.send({ kind: 'clientLetter', variant: ['confident', 'humble', 'blame', 'silent'].indexOf(tone), returns: last ? [last.move!, last.expect!] : undefined });
  return { mood };
}

function findLastQuarter(sim: Sim) {
  const news = sim.s.events.news;
  for (let k = news.length - 1; k >= 0; k--) if (news[k].kind === 'firmQuarter') return news[k];
  return undefined;
}

// ---------- The Y2K scare (spec §14.2 Y2K Countdown) ----------

/** The year a day shows as: the calendar is 1998's, shifted by the game's cosmetic start year (spec §9). */
export const shownYear = (day: number, startYear: number) => new Date(day * 86_400_000).getUTCFullYear() + startYear - 1998;

/**
 * The first trading morning of 2000, if the game gets there (spec §14.2): a mild panic, sharpest in technology and banks.
 * Nothing actually breaks, so prices drift back.
 */
export function y2k(sim: Sim, day: number, previous: number): void {
  const year = sim.s.settings.startYear;
  if (shownYear(previous, year) >= 2000 || shownYear(day, year) < 2000) return;
  const rng = sim.rng.extras;
  const exposed = new Set(['software', 'hardware', 'semiconductors', 'internet', 'banks', 'payments', 'telecom', 'airlines']);
  const { status } = sim.market.state;
  for (let i = 0; i < sim.companies.length; i++) {
    if (status[i]) continue;
    const scale = exposed.has(sim.companies[i].industry.id) ? 1.6 : 1;
    jump(sim, i, Math.log1p(-rng.range(0.005, 0.025) * scale), 0, rng.int(12, 40));
  }
  sim.report({ kind: 'story', company: -1, text: 'y2k', move: -0.02 });
}
