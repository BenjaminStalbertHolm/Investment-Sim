import { OPEN, addTradingDays, at, dayOf } from './calendar';
import type { Sim } from './context';
import { reportDay } from './earnings';
import { enqueue, plan } from './events';
import { weeklyCloses } from './history';
import type { NewsItem } from './news';

/**
 * Corporate governance (spec §15.5): the player's stakes cross 5%, 20% and 50% — a public SOB filing and a letter from the
 * CEO, a board seat, control — shareholder meetings ask for the player's vote, and competitors bid for large stakes or
 * offer to invest in the firm itself (spec §15.6).
 */
export type Level = 0 | 5 | 20 | 50;
export type Vote = 'for' | 'against' | 'abstain';

/** A 5% filing with the SOB (spec §14: "who crossed 5% of which company"): the player (firm −1) or a competitor. */
export interface StakeFiling {
  day: number;
  firm: number;
  company: number;
  /** The stake filed, a fraction of the company; a filing under 5% reports a stake sold down. */
  pct: number;
}

/** A shareholder meeting the player was sent a proxy for (spec §15.5). */
export interface Meeting {
  id: number;
  company: number;
  kind: 'board' | 'pay' | 'merger';
  day: number;
  /** The proxy letter; a merger's bid (news id). */
  mail: number;
  bid?: number;
  vote?: Vote;
  result?: { support: number; passed: boolean; decisive: boolean };
}

/** A letter whose offer lapses: a bid for a stake, an offer to invest in the firm. */
interface OpenOffer {
  mail: number;
  expires: number;
}

export interface GovernanceState {
  /**
   * The player's stakes at or over a threshold, by the highest crossed. A hidden stake crossed 5% through an offshore
   * shell (spec §14A) and was never filed.
   */
  stakes: { company: number; level: Level; hidden?: boolean }[];
  /** Public filings, oldest first (the last FILINGS_KEPT). */
  filings: StakeFiling[];
  meetings: Meeting[];
  nextMeeting: number;
  /** Companies on whose board the player sits (a 20% stake, spec §15.5). */
  seats: number[];
  offers: OpenOffer[];
  /** A competitor that bought a share of the firm's future fees (spec §15.6). */
  investor?: { firm: number; share: number; amount: number; day: number; paid: number };
  /** Trading day of the next strategic investment offer. */
  nextInvestment: number;
}

const FILINGS_KEPT = 400;
const MEETINGS_KEPT = 60;
/** The proxy comes this many trading days before the meeting; the meeting is this long after the April report. */
const PROXY_DAYS = 10;
const AGM_DAYS = 20;
/** Holdings big enough to be sent a proxy: this share of the company, or of the firm. */
const PROXY_STAKE = 0.01;
const PROXY_WEIGHT = 0.02;
/** Chance a week that a competitor bids for a filed stake, by aggressiveness (spec §9). */
const BID_CHANCE = { low: 0, normal: 0.01, high: 0.04 };

export const newGovernance = (day: number): GovernanceState => ({
  stakes: [], filings: [], meetings: [], nextMeeting: 1, seats: [], offers: [], nextInvestment: addTradingDays(day, 120),
});

export const levelOf = (pct: number): Level => (pct >= 0.5 ? 50 : pct >= 0.2 ? 20 : pct >= 0.05 ? 5 : 0);

/** A stake crossing 5% either way is filed with the SOB, whoever holds it. */
export function fileStake(sim: Sim, firm: number, company: number, pct: number): void {
  const g = sim.s.governance;
  g.filings.push({ day: dayOf(sim.time), firm, company, pct });
  if (g.filings.length > FILINGS_KEPT) g.filings.splice(0, g.filings.length - FILINGS_KEPT);
}

/**
 * Each close: the player's stakes against the thresholds (spec §15.5). Crossing 5% files with the SOB — the IR page lists
 * the firm, the Newswire reports it and the CEO writes; 20% brings a board seat offer; 50% control of the company.
 */
export function checkStakes(sim: Sim): void {
  const g = sim.s.governance;
  // An offshore shell holds stakes without 5% filings (spec §14A).
  const shell = sim.s.darkweb.shells.some((x) => x.closed === undefined);
  const shares = sim.model.shares;
  const held = new Map(sim.s.account.positions.filter((p) => p.shares > 0).map((p) => [p.company, p.shares]));
  for (const company of new Set([...held.keys(), ...g.stakes.map((s) => s.company)])) {
    const pct = (held.get(company) ?? 0) / shares[company];
    const level = sim.market.state.status[company] ? 0 : levelOf(pct);
    const record = g.stakes.find((s) => s.company === company);
    const before = record?.level ?? 0;
    if (level === before) continue;
    if (record) record.level = level;
    else g.stakes.push({ company, level });
    if (level < before) {
      // Stakes sold down are filed too (a hidden one never was); a delisted company's are simply gone.
      if (level < 5 && !sim.market.state.status[company] && !record?.hidden) fileStake(sim, -1, company, pct);
      if (level < 5 && record) record.hidden = undefined;
      if (level < 20) g.seats = g.seats.filter((c) => c !== company);
      continue;
    }
    if (before < 5 && shell) g.stakes.find((s) => s.company === company)!.hidden = true;
    else if (before < 5) disclose(sim, company, pct);
    if (before < 20 && level >= 20) sim.send({ kind: 'boardSeat', company, amount: pct });
    if (before < 50 && level >= 50) {
      sim.send({ kind: 'control', company, amount: pct });
      sim.unlock('outright');
    }
  }
  g.stakes = g.stakes.filter((s) => s.level > 0);
}

/** A 5% stake made public: the SOB filing, its confirmation, the CEO's letter and the Newswire's story. */
function disclose(sim: Sim, company: number, pct: number): void {
  fileStake(sim, -1, company, pct);
  sim.send({ kind: 'stakeFiled', company, amount: pct });
  sim.send({ kind: 'ceoLetter', company, amount: pct, variant: sim.rng.governance.int(0, 999) });
  sim.report({ kind: 'stake', company, level: pct });
  sim.unlock('filed');
}

/** The shell is gone (discovered or wound up): every stake hidden in it is filed now. Returns the companies. */
export function discloseHidden(sim: Sim): number[] {
  const out: number[] = [];
  for (const s of sim.s.governance.stakes) {
    if (!s.hidden) continue;
    s.hidden = undefined;
    out.push(s.company);
    disclose(sim, s.company, Math.max(0, sim.held(s.company)) / sim.model.shares[s.company]);
  }
  return out;
}

/** A company's annual meeting: twenty trading days after it reports its first quarter. */
export const annualMeeting = (year: number, slot: number) => addTradingDays(reportDay(year * 4, slot), AGM_DAYS);

/** Whether the player's holding is big enough to be asked for its vote. */
function voter(sim: Sim, company: number): boolean {
  const shares = sim.held(company);
  if (shares <= 0) return false;
  return shares / sim.model.shares[company] >= PROXY_STAKE || (shares * sim.market.price[company]) / Math.max(1, sim.nav()) >= PROXY_WEIGHT;
}

/** Each morning: proxies for annual meetings ten trading days away (spec §15.5), and lapsed offers. */
export function morningGovernance(sim: Sim, day: number): void {
  const g = sim.s.governance;
  const year = new Date(day * 86_400_000).getUTCFullYear();
  for (const p of sim.s.account.positions) {
    if (!voter(sim, p.company)) continue;
    const meeting = annualMeeting(year, sim.model.slot[p.company]);
    if (addTradingDays(day, PROXY_DAYS) !== meeting) continue;
    const kind = sim.rng.governance.chance(0.35) ? 'pay' : 'board';
    callMeeting(sim, p.company, kind, meeting);
  }
  for (const o of [...g.offers]) {
    if (day <= o.expires) continue;
    const mail = sim.s.mail.messages.find((m) => m.id === o.mail);
    if (mail && !mail.answer) mail.answer = 'expired';
    g.offers.splice(g.offers.indexOf(o), 1);
  }
}

function callMeeting(sim: Sim, company: number, kind: Meeting['kind'], day: number, bid?: number): Meeting {
  const g = sim.s.governance;
  const id = g.nextMeeting++;
  const mail = sim.send({ kind: 'proxy', company, day, meeting: id, variant: kind === 'board' ? 0 : kind === 'pay' ? 1 : 2 });
  const meeting: Meeting = { id, company, kind, day, mail: mail.id, bid };
  g.meetings.push(meeting);
  if (g.meetings.length > MEETINGS_KEPT) g.meetings.splice(0, g.meetings.length - MEETINGS_KEPT);
  // A merger is voted on when the deal is due to close (events.ts closeDeal); annual meetings at noon.
  if (kind !== 'merger') enqueue(sim.s.events, at(day, 12 * 60), { do: 'meeting', meeting: id });
  return meeting;
}

/** A takeover bid (spec §11.6): if the player holds enough of the target, a special meeting asks for its vote. */
export function mergerMeeting(sim: Sim, bid: NewsItem, closes: number): void {
  if (voter(sim, bid.company)) callMeeting(sim, bid.company, 'merger', closes, bid.id);
}

/** The votes are counted: everyone else's, and the player's, weighted by shares (spec §15.5: your vote weight counts). */
function count(sim: Sim, m: Meeting): NonNullable<Meeting['result']> {
  const rng = sim.rng.governance;
  const [lo, hi] = m.kind === 'board' ? [0.55, 0.97] : m.kind === 'merger' ? [0.55, 0.95] : [0.4, 0.9];
  let others = rng.range(lo, hi);
  // Shareholders are stingier with pay after a bad year.
  if (m.kind === 'pay') {
    const yearAgo = weeklyCloses(sim.s.history, m.company).at(-53)?.[1] ?? sim.companies[m.company].price;
    others += 0.5 * Math.max(-0.3, Math.min(0.3, sim.market.price[m.company] / yearAgo - 1));
  }
  const w = Math.max(0, sim.held(m.company)) / sim.model.shares[m.company];
  const support = m.vote === 'for' ? others * (1 - w) + w : m.vote === 'against' ? others * (1 - w) : others;
  const passed = support > 0.5;
  return { support, passed, decisive: !!m.vote && m.vote !== 'abstain' && passed !== others > 0.5 };
}

/** An annual meeting: the result is written to the player, and a board voted down loses its chief executive. */
export function holdMeeting(sim: Sim, id: number): void {
  const m = sim.s.governance.meetings.find((x) => x.id === id);
  if (!m || m.result || sim.market.state.status[m.company]) return;
  m.result = count(sim, m);
  if (m.result.decisive) sim.unlock('proxy');
  sim.send({ kind: 'voteResult', company: m.company, meeting: m.id, amount: m.result.support, variant: m.kind === 'board' ? 0 : 1 });
  if (m.kind === 'board' && !m.result.passed) {
    const rng = sim.rng.governance;
    plan(sim, 'ceoChange', m.company, at(addTradingDays(dayOf(sim.time), rng.int(1, 5)), OPEN + 5 * rng.int(1, 77)), rng.range(-0.02, 0.05), 0);
  }
}

/** The target's shareholders vote on a takeover as it is due to close: false if they turn it down. */
export function mergerApproved(sim: Sim, bid: number): boolean {
  const m = sim.s.governance.meetings.find((x) => x.bid === bid && x.kind === 'merger' && !x.result);
  if (!m) return true;
  m.result = count(sim, m);
  if (m.result.decisive) sim.unlock('proxy');
  sim.send({ kind: 'voteResult', company: m.company, meeting: m.id, amount: m.result.support, variant: 2 });
  return m.result.passed;
}

/** The player casts its vote (the proxy letter's For / Against / Abstain). */
export function castVote(sim: Sim, meeting: number, vote: Vote): string | undefined {
  const m = sim.s.governance.meetings.find((x) => x.id === meeting);
  if (!m || m.result) return 'The meeting has already taken place.';
  m.vote = vote;
  return undefined;
}

/** Accepts or declines a board seat (spec §15.5: 20%+). */
export function answerSeat(sim: Sim, company: number, accept: boolean): string | undefined {
  const g = sim.s.governance;
  if (!accept) return undefined;
  if ((g.stakes.find((s) => s.company === company)?.level ?? 0) < 20) return 'You no longer own 20% of the company.';
  if (!g.seats.includes(company)) g.seats.push(company);
  sim.s.clients.reputation = Math.min(100, sim.s.clients.reputation + 1);
  sim.unlock('director');
  return undefined;
}

/**
 * The owner of a company (spec §15.5: 50%+) tells the board what to do: replace the chief executive (a new portrait), or
 * raise or cut the dividend. The company announces it the same day, as any such news.
 */
export function directBoard(sim: Sim, company: number, action: 'replaceCeo' | 'raiseDividend' | 'cutDividend'): string | undefined {
  if (sim.market.state.status[company]) return 'The company is no longer listed.';
  if ((sim.s.governance.stakes.find((s) => s.company === company)?.level ?? 0) < 50) return 'You no longer control the company.';
  if (action === 'cutDividend' && sim.s.fundamentals.dividend[company] <= 0) return 'The company pays no dividend to cut.';
  const rng = sim.rng.governance;
  const time = Math.max(sim.time + 5, at(dayOf(sim.time), OPEN + 5 * rng.int(1, 77)));
  if (action === 'replaceCeo') plan(sim, 'ceoChange', company, time, rng.range(-0.03, 0.06), 0);
  else plan(sim, 'dividendChange', company, time, action === 'raiseDividend' ? rng.range(0.01, 0.05) : -rng.range(0.01, 0.06), 0);
  return undefined;
}

/**
 * Each week's end: a competitor may bid for one of the player's filed stakes, at a premium (spec §15.5), more often when
 * competitors are aggressive.
 */
export function weeklyGovernance(sim: Sim, day: number): void {
  const g = sim.s.governance;
  const rng = sim.rng.governance;
  const chance = BID_CHANCE[sim.s.settings.aggression];
  const bidders = sim.s.world.firms.flatMap((f, k) => (f.strategy === 'index' ? [] : [k]));
  if (!chance || !bidders.length) return;
  for (const s of g.stakes) {
    // Competitors bid for the stakes they can see.
    if (s.hidden || !rng.chance(chance)) continue;
    const shares = sim.held(s.company);
    if (shares <= 0) continue;
    const price = sim.market.price[s.company] * (1 + rng.range(0.1, 0.3));
    const expires = addTradingDays(day, 5);
    const mail = sim.send({ kind: 'stakeBid', company: s.company, firm: rng.pick(bidders), shares, amount: shares * price, day: expires });
    g.offers.push({ mail: mail.id, expires });
  }
}

/**
 * A strategic investment offer (spec §15.6): now and then a competitor offers the firm cash for a share of its future
 * fees, once the firm has made a name for itself.
 */
export function investmentOffer(sim: Sim, day: number): void {
  const g = sim.s.governance;
  if (day < g.nextInvestment) return;
  const rng = sim.rng.governance;
  g.nextInvestment = addTradingDays(day, rng.int(60, 180));
  const firms = sim.s.world.firms.flatMap((f, k) => (f.strategy === 'index' ? [] : [k]));
  // Only a firm with clients earns fees to share.
  if (g.investor || !firms.length || !sim.s.settings.clients || sim.s.clients.reputation < 30) return;
  const amount = nice(Math.max(50_000, sim.nav() * rng.range(0.05, 0.2)));
  const share = rng.pick([0.1, 0.15, 0.2, 0.25]);
  const expires = addTradingDays(day, 5);
  const mail = sim.send({ kind: 'investmentOffer', firm: rng.pick(firms), amount, rate: share, day: expires });
  g.offers.push({ mail: mail.id, expires });
}

const nice = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v) - 1);
  return Math.round(v / p) * p;
};

/** Whether an offer letter can still be taken up. */
export const offerOpen = (g: GovernanceState, mail: number) => g.offers.some((o) => o.mail === mail);

export const closeOffer = (g: GovernanceState, mail: number) => {
  g.offers = g.offers.filter((o) => o.mail !== mail);
};

/** Board letters to a controlling owner each quarter (spec §15.5): what would you like the company to do? */
export function quarterlyBoardLetters(sim: Sim): void {
  for (const s of sim.s.governance.stakes) if (s.level >= 50) sim.send({ kind: 'control', company: s.company, amount: sim.held(s.company) / sim.model.shares[s.company] });
}

