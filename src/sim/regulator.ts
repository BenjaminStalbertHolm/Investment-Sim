import type { Side } from './account';
import { OPEN, addTradingDays, at, dayOf, previousTradingDay, type GameTime } from './calendar';
import type { Sim } from './context';
import { enqueue } from './events';
import type { Level } from './settings';

/**
 * Heat and the Securities Oversight Bureau (spec §16B). Heat (0–100) is the regulator's and the press's attention. In this
 * phase it comes from trading just before news: on a genuine inside tip (insider trading), or big and well-timed enough to
 * be flagged by the SOB's market surveillance. It decays by the week. Each month an audit is likelier the hotter the firm
 * (roughly the square of heat); an audit weighs the evidence and ends somewhere on the ladder from cleared to a public
 * enforcement action.
 */
export type SobOutcome = 'cleared' | 'warning' | 'fine' | 'suspension' | 'freeze' | 'enforcement';
export const OUTCOMES: readonly SobOutcome[] = ['cleared', 'warning', 'fine', 'suspension', 'freeze', 'enforcement'];

/** A trade the SOB could hold against the firm: its time, the company, and what it gained. */
export interface Evidence {
  time: GameTime;
  company: number;
  kind: 'insider' | 'preNews';
  gain: number;
  audited?: boolean;
}

/** The firm's record with the SOB (spec §14 enforcement actions). */
export interface SobAction {
  day: number;
  outcome: SobOutcome;
  /** A fine, and the trading day a suspension or freeze ends. */
  amount?: number;
  until?: number;
}

export interface RegulatorState {
  heat: number;
  /** The highest heat so far: the tray's thermometer shows once heat has first risen above zero. */
  peak: number;
  evidence: Evidence[];
  record: SobAction[];
  /** An audit under way: opened, and the day it reports. */
  audit?: { opened: number; due: number };
  /** A fine owed, and the trading day it is taken (spec §16B: unpaid fines follow the missed-payment path). */
  fine?: { amount: number; due: number };
  /** Close-only trading, and an asset freeze (no loans, no withdrawals), until these trading days. */
  suspended?: number;
  frozen?: number;
}

export const newRegulator = (): RegulatorState => ({ heat: 0, peak: 0, evidence: [], record: [] });

/** How closely the SOB looks (spec §9 regulator scrutiny): audit odds and the weight of the evidence. */
export const STRICTNESS: Record<Level, number> = { low: 0.6, normal: 1, high: 1.5 };
/** Heat lost a game week at a decay multiplier of 1 (spec §16B: about −2 a week). */
export const HEAT_DECAY = 2;
/** Surveillance flags trades in the days before a move of at least this much that made at least this much. */
const FLAG_MOVE = 0.08;
const FLAG_GAIN = 25_000;
const LOOKBACK_DAYS = 3;
/** Days to pay a fine, and each outcome's fixed fine. */
export const FINE_DAYS = 5;
const FIXED_FINE: Partial<Record<SobOutcome, number>> = { fine: 50_000, suspension: 250_000, freeze: 500_000, enforcement: 1_000_000 };
/** What each outcome costs the firm's reputation (spec §16) and its credit score (spec §16A: the SOB record). */
export const REPUTATION_HIT: Record<SobOutcome, number> = { cleared: 0, warning: 2, fine: 5, suspension: 10, freeze: 15, enforcement: 30 };
export const CREDIT_HIT: Record<SobOutcome, number> = { cleared: 0, warning: 10, fine: 40, suspension: 60, freeze: 80, enforcement: 150 };

const addHeat = (sim: Sim, amount: number) => {
  const r = sim.s.regulator;
  r.heat = Math.min(100, r.heat + amount);
  r.peak = Math.max(r.peak, r.heat);
};

/**
 * An event breaks (events.ts): the SOB looks at the firm's trades in the company over the last few trading days. Trades
 * on a genuine tip about this very event are insider trading; other big, well-timed trades are flagged all the same.
 */
export function surveil(sim: Sim, company: number, move: number, plan: number): void {
  const since = at(backDays(dayOf(sim.time), LOOKBACK_DAYS), 0);
  const ledger = sim.s.account.ledger;
  let gain = 0;
  for (let k = ledger.length - 1; k >= 0 && ledger[k].time >= since; k--) {
    const e = ledger[k];
    if (e.company !== company || !e.shares || !e.price) continue;
    const side = e.kind as Side;
    const way = side === 'buy' || side === 'cover' ? 1 : side === 'sell' || side === 'short' ? -1 : 0;
    gain += Math.max(0, way * move) * e.shares * e.price;
  }
  const tipped = sim.s.mail.tips.some((t) => t.plan === plan && t.truth === 'genuine' && sim.s.mail.insider.some((x) => x.tip === t.id));
  if (!gain || (!tipped && (Math.abs(move) < FLAG_MOVE || gain < FLAG_GAIN))) return;
  const kind = tipped ? 'insider' : 'preNews';
  sim.s.regulator.evidence.push({ time: sim.time, company, kind, gain });
  addHeat(sim, tipped ? 10 + Math.min(20, gain / 50_000) : 3 + Math.min(10, gain / 100_000));
}

const backDays = (day: number, n: number) => {
  let d = day;
  for (let k = 0; k < n; k++) d = previousTradingDay(d);
  return d;
};

/** Each week's end: heat cools (spec §16B), at the difficulty's rate. */
export function coolHeat(sim: Sim): void {
  const r = sim.s.regulator;
  r.heat = Math.max(0, r.heat - HEAT_DECAY * sim.s.settings.heatDecay);
}

/**
 * The first trading day of each month: an audit, with odds rising with the square of heat and the SOB's strictness. The
 * firm is told, and the audit reports ten trading days later.
 */
export function monthlyAudit(sim: Sim, day: number): void {
  const r = sim.s.regulator;
  if (r.audit) return;
  const chance = Math.min(0.9, (r.heat / 100) ** 2 * STRICTNESS[sim.s.settings.scrutiny]);
  if (!sim.rng.regulator.chance(chance)) return;
  const due = addTradingDays(day, 10);
  r.audit = { opened: day, due };
  sim.send({ kind: 'audit', day: due });
  enqueue(sim.s.events, at(due, OPEN + 30), { do: 'audit' });
}

/**
 * An audit reports (spec §16B): the more evidence (and heat), the further down the ladder — cleared, a warning letter, a
 * fine (a fixed amount plus 50–300% of the illicit gains), a trading suspension (close-only for 5–30 trading days), an
 * asset freeze (no loans, no withdrawals), a public enforcement action. The engine collects the fine.
 */
export function auditReport(sim: Sim): { outcome: SobOutcome; fine: number } | undefined {
  const r = sim.s.regulator;
  if (!r.audit) return undefined;
  const rng = sim.rng.regulator;
  const day = dayOf(sim.time);
  const open = r.evidence.filter((e) => !e.audited);
  const gains = open.reduce((a, e) => a + e.gain, 0);
  const weight = open.reduce((a, e) => a + (e.kind === 'insider' ? 3 + e.gain / 1e6 : 1), 0) + r.heat / 25;
  const strict = STRICTNESS[sim.s.settings.scrutiny];
  const score = weight * strict + rng.normal(0, 0.75);
  const outcome = OUTCOMES[score < 1 ? 0 : score < 2 ? 1 : score < 3.5 ? 2 : score < 5 ? 3 : score < 6.5 ? 4 : 5];
  for (const e of open) e.audited = true;
  r.audit = undefined;
  r.heat = Math.max(0, r.heat - (outcome === 'cleared' ? 15 : 25));
  const fixed = FIXED_FINE[outcome];
  const fine = fixed === undefined ? 0 : Math.round(fixed * strict + gains * rng.range(0.5, 3));
  const action: SobAction = { day, outcome };
  if (fine) {
    action.amount = fine;
    r.fine = { amount: (r.fine?.amount ?? 0) + fine, due: addTradingDays(day, FINE_DAYS) };
  }
  if (outcome === 'suspension' || outcome === 'freeze' || outcome === 'enforcement') {
    action.until = addTradingDays(day, outcome === 'enforcement' ? 30 : rng.int(5, 30));
    r.suspended = Math.max(r.suspended ?? 0, action.until);
    if (outcome === 'freeze') r.frozen = Math.max(r.frozen ?? 0, action.until);
  }
  r.record.push(action);
  sim.s.clients.reputation = Math.max(0, sim.s.clients.reputation - REPUTATION_HIT[outcome]);
  return { outcome, fine };
}

/** The SOB record's weight in the credit score (spec §16A, Equifacts). */
export const creditRecord = (r: RegulatorState) => -Math.min(200, r.record.reduce((a, x) => a + CREDIT_HIT[x.outcome], 0));

/** Close-only trading: a suspension or freeze in force today. */
export const suspended = (r: RegulatorState, day: number) => (r.suspended ?? -1) > day;
export const frozen = (r: RegulatorState, day: number) => (r.frozen ?? -1) > day;
