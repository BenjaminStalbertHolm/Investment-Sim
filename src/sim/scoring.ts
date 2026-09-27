import type { LedgerEntry, LedgerKind } from './account';
import { CLOSE, at } from './calendar';

/**
 * Scoring (spec §16): the firm's record as the league tables and the About box show it — time-weighted returns (clients'
 * money in and out is not performance), annualised return, Sharpe ratio, maximum drawdown, best and worst years, against
 * the MAJOR 500 — and achievements.
 */
export interface ScoringState {
  /** Growth of a dollar invested at the start, time-weighted, at each close (alongside SimState.stats). */
  growth: number[];
  /** Ledger lines at the last close: money in and out since then belongs to the next close's return. */
  ledger: number;
  /** Achievement id → the day it was earned. */
  achievements: Record<string, number>;
}

/** Money in and out that isn't return: clients' deposits and redemptions, a strategic investor's money and its fees. */
export const FLOW_KINDS = new Set<LedgerKind>(['deposit', 'withdrawal', 'investment', 'feeShare']);
/** The risk-free rate a Sharpe ratio is measured against: 1998's Treasury bills. */
const RISK_FREE = 0.05;

/** Money in (+) and out (−) in the ledger's lines from `from` on. */
export function flowsSince(ledger: readonly LedgerEntry[], from: number): number {
  let flow = 0;
  for (let k = Math.max(1, from); k < ledger.length; k++) if (FLOW_KINDS.has(ledger[k].kind)) flow += ledger[k].amount;
  return flow;
}

/** One close's time-weighted return: the change in net worth, less the money that came in. */
export const dayReturn = (before: number, after: number, flow: number) => (before > 0 ? (after - flow) / before - 1 : 0);

/**
 * Growth of a dollar from the start at every close, rebuilt from the closes and the ledger (for saves from before Phase 8).
 * Money that moved at the very minute of a close counts with that close (the live record knows better: it marks the ledger).
 */
export function growthSeries(stats: readonly [number, number, number][], ledger: readonly LedgerEntry[]): number[] {
  let before = ledger[0]?.amount ?? 0;
  let growth = 1;
  let k = 1;
  return stats.map(([day, worth]) => {
    let flow = 0;
    for (; k < ledger.length && ledger[k].time <= at(day, CLOSE); k++) if (FLOW_KINDS.has(ledger[k].kind)) flow += ledger[k].amount;
    growth *= 1 + dayReturn(before, worth, flow);
    before = worth;
    return growth;
  });
}

export interface YearResult {
  year: number;
  ret: number;
  index: number;
  /** The year so far. */
  partial: boolean;
}

export interface Performance {
  days: number;
  total: number;
  annualised: number;
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
  drawdown: number;
  /** The MAJOR 500 over the same time. */
  index: number;
  years: YearResult[];
}

const yearOf = (day: number) => new Date(day * 86_400_000).getUTCFullYear();

/** The firm's record from its closes and their time-weighted growth. */
export function performance(stats: readonly [number, number, number][], growth: readonly number[], today: number): Performance {
  const n = growth.length;
  let peak = 1;
  let maxDrawdown = 0;
  let sum = 0;
  let squares = 0;
  const years: YearResult[] = [];
  let startGrowth = 1;
  let startIndex = 1000;
  for (let k = 0; k < n; k++) {
    const g = growth[k];
    const r = g / (k ? growth[k - 1] : 1) - 1;
    sum += r;
    squares += r * r;
    peak = Math.max(peak, g);
    maxDrawdown = Math.max(maxDrawdown, 1 - g / peak);
    const [day, , index] = stats[k];
    const year = yearOf(day);
    const last = k === n - 1 || yearOf(stats[k + 1][0]) !== year;
    if (last) {
      years.push({ year, ret: g / startGrowth - 1, index: index / startIndex - 1, partial: k === n - 1 && yearOf(today + 7) === year });
      startGrowth = g;
      startIndex = index;
    }
  }
  const mean = n ? sum / n : 0;
  const volatility = n > 1 ? Math.sqrt(Math.max(0, squares / n - mean * mean) * 252) : 0;
  const total = n ? growth[n - 1] - 1 : 0;
  return {
    days: n,
    total,
    annualised: n ? (1 + total) ** (252 / Math.max(n, 21)) - 1 : 0,
    volatility,
    sharpe: volatility > 0 ? (mean * 252 - RISK_FREE) / volatility : 0,
    maxDrawdown,
    drawdown: n ? 1 - growth[n - 1] / peak : 0,
    index: n ? stats[n - 1][2] / 1000 - 1 : 0,
    years,
  };
}

/** Achievements (spec §16: shown in My Computer → About). */
export const ACHIEVEMENTS: readonly { id: string; name: string; text: string }[] = [
  { id: 'firstTrade', name: 'Open for Business', text: 'Made your first trade.' },
  { id: 'mandate', name: 'Other People’s Money', text: 'Won a mandate from a new client.' },
  { id: 'fund', name: 'Buy the Haystack', text: 'Bought units of an index fund.' },
  { id: 'corn', name: 'Took Delivery of Corn', text: 'Held a corn contract to expiry. The lobby smells of silage.' },
  { id: 'crash', name: 'Survived a Crash in the Green', text: 'Ended a crash day up while the MAJOR 500 fell 3% or more.' },
  { id: 'filed', name: 'Schedule 13D', text: 'Crossed 5% of a company and filed with the SOB.' },
  { id: 'director', name: 'A Seat at the Table', text: 'Took a seat on a company’s board.' },
  { id: 'outright', name: 'Owned a Company Outright', text: 'Owned more than half of a listed company.' },
  { id: 'proxy', name: 'Proxy Fighter', text: 'Your vote decided a shareholder meeting.' },
  { id: 'cleared', name: 'Clean Bill of Health', text: 'Came through an SOB audit cleared.' },
  { id: 'levered', name: 'Living Dangerously', text: 'Held more than five dollars of stock for every dollar of equity.' },
  { id: 'doubled', name: 'Double or Nothing', text: 'Doubled your clients’ money, time-weighted.' },
  { id: 'tenBagger', name: 'Ten-Bagger', text: 'Sold shares for ten times what they cost.' },
  { id: 'league', name: 'Top of the League', text: 'Finished in the top three of Barren’s annual league table.' },
  { id: 'whiteRock', name: 'Beat WhiteRock Three Years Running', text: 'Out-returned WhiteRock in three league tables in a row.' },
];
