import type { Rng } from '../world/rng';
import type { Side } from './account';
import { DAY_MINUTES, OPEN, at, dayOf, nextTradingDay, previousTradingDay, type GameTime } from './calendar';
import type { Sim } from './context';
import type { EventKind } from './data/events';
import { seasonOf } from './earnings';
import { addTradingDays, plan } from './events';
import { releasesOn } from './macro';
import type { Vote } from './governance';
import type { MacroKind, NewsItem } from './news';
import type { SobOutcome } from './regulator';
import type { Outcome } from './darkweb';
import type { ServiceId } from './data/darkweb';

/**
 * Outbox Express's mail (spec §15): the facts of each letter, never its words. The mail app writes the letters from
 * these when it shows them, so the save stays small and the wording can change.
 */
export type MailKind =
  | 'welcome'
  | 'founders'
  | 'offer'
  | 'offerExpired'
  | 'joined'
  | 'statement'
  | 'reply'
  | 'praise'
  | 'question'
  | 'topUp'
  | 'redemption'
  | 'warning'
  | 'terminated'
  | 'completed'
  | 'settled'
  | 'digest'
  | 'dividend'
  | 'delisted'
  | 'briefing'
  | 'alert'
  | 'tip'
  | 'spam'
  | 'mom'
  | 'party'
  // Phase 7: the broker on margin, borrowing and futures; the bank on loans; the court at the end.
  | 'marginCall'
  | 'marginMet'
  | 'liquidation'
  | 'recall'
  | 'buyIn'
  | 'expiry'
  | 'delivery'
  | 'ftd'
  | 'cashSettled'
  | 'loan'
  | 'loanLate'
  | 'loanDefault'
  | 'loanRepaid'
  | 'bankrupt'
  // Phase 8: stakes and their filings, the CEO's letter, board seats, control, meetings and votes; bids for a stake and
  // offers to invest in the firm, rivals' taunts; the SOB's audits and what came of them.
  | 'stakeFiled'
  | 'ceoLetter'
  | 'boardSeat'
  | 'control'
  | 'proxy'
  | 'voteResult'
  | 'stakeBid'
  | 'investmentOffer'
  | 'taunt'
  | 'audit'
  | 'sobOutcome'
  | 'finePaid'
  // Phase 9: the anonymous letter pointing to the Garlic Browser; a dark web purchase's result; a blackmailing journalist;
  // the loan sharks' collectors; a shell company or forged statements found out.
  | 'garlicInvite'
  | 'darkweb'
  | 'blackmail'
  | 'sharkCall'
  | 'shellFound'
  | 'forgeryFound'
  // Phase 10: staff (research reports, a rival's offer, departures, compliance warnings, hacks); the letter to clients;
  // eBuy, conferences, the lotto and Hindsight Research; IPO allocations and stock splits.
  | 'research'
  | 'poached'
  | 'staffLeft'
  | 'compliance'
  | 'hackBlocked'
  | 'hacked'
  | 'clientLetter'
  | 'ebuy'
  | 'conference'
  | 'lotto'
  | 'hindsight'
  | 'ipo'
  | 'split';

export type Folder = 'inbox' | 'clients' | 'broker' | 'news' | 'tips' | 'junk' | 'sent';

/** Where each kind of mail is filed (spec §15 UI). */
export const FOLDER_OF: Record<MailKind, Folder> = {
  welcome: 'inbox', mom: 'inbox', party: 'inbox',
  founders: 'clients', offer: 'clients', offerExpired: 'clients', joined: 'clients', praise: 'clients', question: 'clients',
  topUp: 'clients', redemption: 'clients', warning: 'clients', terminated: 'clients', completed: 'clients',
  statement: 'sent', reply: 'sent',
  settled: 'broker', digest: 'broker', dividend: 'broker', delisted: 'broker',
  marginCall: 'broker', marginMet: 'broker', liquidation: 'broker', recall: 'broker', buyIn: 'broker', expiry: 'broker',
  delivery: 'broker', ftd: 'broker', cashSettled: 'broker',
  loan: 'inbox', loanLate: 'inbox', loanDefault: 'inbox', loanRepaid: 'inbox', bankrupt: 'inbox',
  stakeFiled: 'inbox', ceoLetter: 'inbox', boardSeat: 'inbox', control: 'inbox', proxy: 'inbox', voteResult: 'inbox',
  stakeBid: 'inbox', investmentOffer: 'inbox', taunt: 'inbox', audit: 'inbox', sobOutcome: 'inbox', finePaid: 'inbox',
  briefing: 'news', alert: 'news',
  tip: 'tips', garlicInvite: 'tips',
  darkweb: 'inbox', blackmail: 'inbox', sharkCall: 'inbox', shellFound: 'inbox', forgeryFound: 'inbox',
  research: 'inbox', poached: 'inbox', staffLeft: 'inbox', compliance: 'inbox', hackBlocked: 'inbox', hacked: 'inbox', clientLetter: 'sent',
  ebuy: 'inbox', conference: 'inbox', lotto: 'inbox', hindsight: 'news', ipo: 'broker', split: 'broker',
  spam: 'junk',
};

/** A line of a broker letter: a fill, a dividend, a sale to raise cash; for futures, `contract` and contracts. */
export interface MailLine {
  company: number;
  shares: number;
  amount: number;
  side?: Side;
  order?: number;
  contract?: string;
  /** Index fund units (company −1). */
  fund?: number;
  /** Luxuries and collectibles sold in a forced sale (Phase 10), in one line. */
  note?: 'lifestyle';
}

export interface Mail {
  id: number;
  time: GameTime;
  kind: MailKind;
  read: boolean;
  flagged: boolean;
  deleted: boolean;
  /** The player's answer to a letter with action buttons. */
  answer?: 'accepted' | 'declined' | 'reported' | 'expired' | Vote | 'done' | 'paid' | 'refused';
  /** Junk mail the executive assistant filed, unread (Phase 10). */
  filed?: boolean;
  client?: number;
  company?: number;
  /** News item (alerts). */
  news?: number;
  tip?: number;
  amount?: number;
  day?: number;
  /** Which template, for letters that come in several versions. */
  variant?: number;
  reason?: 'breach' | 'benchmark' | 'performance' | 'acquired' | 'bankrupt' | 'margin' | 'loan' | 'fine' | 'scandal' | 'shark' | 'bills' | 'payroll' | 'quit' | 'whistleblower';
  /** A constraint index (warnings). */
  constraint?: number;
  /** The quarter: the client's return and the MAJOR 500's. */
  returns?: [number, number];
  lines?: MailLine[];
  /** Morning briefing: top stories, companies reporting, releases due. */
  items?: number[];
  companies?: number[];
  releases?: MacroKind[];
  /** Tips: what is supposed to happen, which way. */
  claim?: EventKind | 'pump';
  direction?: 1 | -1;
  /** Futures letters: the contract, and how many (or the goods delivered: `quantity` units). */
  contract?: string;
  contracts?: number;
  quantity?: number;
  /** Bank letters: the loan, and its rate a year. */
  loan?: number;
  rate?: number;
  /** Phase 8: a competitor firm (bids, offers, taunts), shares bid for, a shareholder meeting, an SOB audit's outcome. */
  firm?: number;
  shares?: number;
  meeting?: number;
  outcome?: SobOutcome;
  /** Phase 9: a dark web purchase — which, from whom, and how it turned out; a journalist; a name (a shell's). */
  purchase?: number;
  service?: ServiceId;
  handle?: string;
  result?: Outcome | 'refund' | 'won' | 'lost' | 'sold' | 'unpaid';
  journalist?: number;
  text?: string;
  /** Phase 10: an employee; an eBuy item (category and item). */
  employee?: number;
  category?: number;
  item?: number;
}

/** The action buttons a letter can carry (spec §15, §15.5–15.6). */
export type MailAction = 'accept' | 'decline' | 'report' | Vote | 'replaceCeo' | 'raiseDividend' | 'cutDividend' | 'pay' | 'refuse' | 'match' | 'letGo';

export type MailDraft = Omit<Mail, 'id' | 'time' | 'read' | 'flagged' | 'deleted'> & { time?: GameTime; read?: boolean };

/**
 * An anonymous tip (spec §15.4) and what it really is: genuine inside information about a planned event, bait for a
 * pump-and-dump, or nonsense. The mail app never sees `truth`.
 */
export interface Tip {
  id: number;
  company: number;
  truth: 'genuine' | 'bait' | 'nonsense';
  claim: EventKind | 'pump';
  direction: 1 | -1;
  /** The planned event behind a genuine tip or a pump. */
  plan?: number;
  /** When the claim should have come true. */
  until: GameTime;
  reported?: boolean;
}

/** A trade in a tipped company before the news (spec §15.4): Phase 8's heat and the SOB look at these. */
export interface InsiderTrade {
  tip: number;
  time: GameTime;
  company: number;
  side: Side;
  shares: number;
  price: number;
}

export interface MailState {
  messages: Mail[];
  tips: Tip[];
  insider: InsiderTrade[];
  /** Trading day of the next anonymous tip. */
  nextTip: number;
  /** News alerts for held tickers (spec §15.3), toggled in Outbox Express. */
  alerts: boolean;
}

export const newMailState = (firstTip: number): MailState => ({ messages: [], tips: [], insider: [], nextTip: firstTip, alerts: true });

/** Rough weight of a story: bigger companies and bigger moves first, the economy always near the top. */
export function importance(item: NewsItem, cap: number): number {
  if (item.commodity) return 2e4 + 2e5 * Math.abs(item.move ?? 0);
  if (item.company < 0) return item.kind === 'fed' ? 3e5 : 1e5;
  return Math.abs(item.move ?? 0.05) * Math.sqrt(cap);
}

/**
 * The morning post, at 07:00 each trading day: The Wall Street Jottings' briefing (spec §15.3), and now and then a tip,
 * junk mail, a letter from Mom or the office party invitation (spec §15.7).
 */
export function morningMail(sim: Sim, day: number, tipsOn: boolean, tipReliability: number): void {
  const rng = sim.rng.mail;
  briefing(sim, day);
  if (rng.chance(0.18)) sim.send({ kind: 'spam', variant: rng.int(0, 999) });
  const month = (d: number) => new Date(d * 86_400_000).getUTCMonth();
  if (month(previousTradingDay(day)) !== month(day)) sim.send({ kind: 'mom', variant: rng.int(0, 999) });
  const date = new Date(day * 86_400_000);
  if (date.getUTCMonth() === 11 && date.getUTCDate() >= 8 && previousTradingDay(day) < Date.UTC(date.getUTCFullYear(), 11, 8) / 86_400_000) {
    sim.send({ kind: 'party', day: addTradingDays(day, 7) });
  }
  const state = sim.s.mail;
  if (tipsOn && day >= state.nextTip) {
    tip(sim, tipReliability);
    state.nextTip = addTradingDays(day, rng.int(6, 18));
  }
}

function briefing(sim: Sim, day: number): void {
  const since = at(previousTradingDay(day), 7 * 60);
  const news = sim.s.events.news;
  const recent: NewsItem[] = [];
  for (let k = news.length - 1; k >= 0 && news[k].time >= since; k--) recent.push(news[k]);
  const cap = (i: number) => (i >= 0 ? sim.companies[i].marketCap : 0);
  const items = recent
    .filter((n) => n.kind !== 'tvPick' && n.kind !== 'fowlPick')
    .sort((a, b) => importance(b, cap(b.company)) - importance(a, cap(a.company)) || a.id - b.id)
    .slice(0, 5)
    .map((n) => n.id);
  const { index } = seasonOf(day);
  const reporting: number[] = [];
  if (index >= 0) {
    const { slot } = sim.model;
    const { status } = sim.market.state;
    for (let i = 0; i < slot.length; i++) if (slot[i] === index && !status[i]) reporting.push(i);
  }
  const held = reporting.filter((i) => sim.held(i) !== 0);
  const biggest = reporting.sort((a, b) => sim.companies[b].marketCap - sim.companies[a].marketCap).slice(0, 5);
  const companies = [...new Set([...held, ...biggest])];
  sim.send({ kind: 'briefing', day, items, companies, releases: releasesOn(day).map((r) => r.kind) });
}

const CLAIMS: readonly EventKind[] = ['takeover', 'approval', 'contract', 'fraud', 'guidance', 'investment', 'bankruptcy'];

/** An anonymous tip (spec §15.4): genuine as often as the difficulty's tip reliability says. */
function tip(sim: Sim, reliability: number): void {
  const rng = sim.rng.mail;
  const t = makeTip(sim, rng, reliability);
  sim.send({ kind: 'tip', tip: t.id, company: t.company, claim: t.claim, direction: t.direction, day: dayOf(t.until), variant: rng.int(0, 999) });
}

/**
 * A tip and what it really is (spec §15.4): genuine inside information about a planned event as often as `reliability`
 * says, else bait for a pump-and-dump or nonsense. Recorded with the others, so trading on a genuine one is insider
 * trading whoever passed it on (Phase 10: informants on ISeekYou).
 */
export function makeTip(sim: Sim, rng: Rng, reliability: number): Tip {
  const state = sim.s.mail;
  const { status } = sim.market.state;
  const n = sim.companies.length;
  const r = rng.float();
  const id = state.tips.length + 1;
  let t: Tip | undefined;
  if (r < reliability) {
    const soon = sim.time + DAY_MINUTES;
    const candidates = sim.s.events.plans.filter(
      (p) => p.kind !== 'pump' && p.time > soon && Math.abs(p.move) >= 0.06 && sim.companies[p.company].marketCap >= 200e6,
    );
    const p = candidates.length ? rng.pick(candidates) : undefined;
    if (p) t = { id, company: p.company, truth: 'genuine', claim: p.kind, direction: p.move >= 0 ? 1 : -1, plan: p.id, until: p.time };
  } else if (r < reliability + (1 - reliability) / 2) {
    // Bait: a penny stock "about to explode", pumped tomorrow and dumped soon after.
    let company = -1;
    for (let tries = 0; tries < 200 && company < 0; tries++) {
      const c = rng.int(0, n - 1);
      if (!status[c] && sim.companies[c].marketCap < 300e6) company = c;
    }
    if (company >= 0) {
      const day = nextTradingDay(dayOf(sim.time));
      const p = plan(sim, 'pump', company, at(day, OPEN + 5 * rng.int(1, 40)), rng.range(0.05, 0.15), 1, 'forum');
      t = { id, company, truth: 'bait', claim: rng.pick(['takeover', 'approval', 'contract'] as const), direction: 1, plan: p.id, until: p.time + 3 * DAY_MINUTES };
    }
  }
  if (!t) {
    let company = rng.int(0, n - 1);
    while (status[company]) company = (company + 1) % n;
    const claim = rng.pick(CLAIMS);
    const direction = claim === 'fraud' || claim === 'bankruptcy' ? -1 : claim === 'guidance' ? (rng.chance(0.5) ? 1 : -1) : 1;
    t = { id, company, truth: 'nonsense', claim, direction, until: at(addTradingDays(dayOf(sim.time), rng.int(3, 10)), OPEN) };
  }
  state.tips.push(t);
  return t;
}

/** A fill in a tipped company before the tip came true: recorded for the regulator (spec §15.4). */
export function noteTrade(sim: Sim, company: number, side: Side, shares: number, price: number): void {
  const state = sim.s.mail;
  for (const t of state.tips) {
    if (t.truth !== 'genuine' || t.company !== company || t.reported || sim.time >= t.until) continue;
    if (!sim.s.events.plans.some((p) => p.id === t.plan)) continue;
    state.insider.push({ tip: t.id, time: sim.time, company, side, shares, price });
  }
}

/** The day's trade confirmations in one letter (spec §15.2), from the ledger: stocks by order, then futures and fund trades. */
export function digest(sim: Sim, day: number): void {
  const lines = new Map<number, Required<Pick<MailLine, 'company' | 'shares' | 'amount' | 'side' | 'order'>>>();
  const futures: MailLine[] = [];
  const ledger = sim.s.account.ledger;
  for (let k = ledger.length - 1; k >= 0 && dayOf(ledger[k].time) === day; k--) {
    const e = ledger[k];
    if (e.kind === 'futures') futures.unshift({ company: -1, contract: e.contract, shares: e.shares!, amount: e.price!, side: e.note === 'sell' ? 'sell' : 'buy' });
    if (e.kind === 'fund') futures.unshift({ company: -1, fund: e.fund, shares: e.shares!, amount: e.price!, side: e.note === 'sell' ? 'sell' : 'buy' });
    if (e.kind !== 'buy' && e.kind !== 'sell' && e.kind !== 'short' && e.kind !== 'cover') continue;
    const line = lines.get(e.order!) ?? { company: e.company!, shares: 0, amount: 0, side: e.kind, order: e.order! };
    line.shares += e.shares!;
    line.amount += Math.abs(e.amount);
    lines.set(e.order!, line);
  }
  if (lines.size || futures.length) sim.send({ kind: 'digest', day, lines: [...[...lines.values()].sort((a, b) => a.order - b.order), ...futures] });
}
