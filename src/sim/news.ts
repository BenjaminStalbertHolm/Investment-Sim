import type { GameTime } from './calendar';
import type { EventKind } from './data/events';

/** Economic releases and the Federal Reservoir (spec §11.4). */
export type MacroKind = 'jobs' | 'cpi' | 'gdp' | 'confidence' | 'fed';
export const MACRO_KINDS: readonly MacroKind[] = ['jobs', 'cpi', 'gdp', 'confidence', 'fed'];

/**
 * What the news archive records (spec §14.1): corporate events, notable earnings, how a takeover ended, the macro
 * calendar, the TV and newsletter stock picks, and the player's own firm.
 */
export type NewsKind =
  | EventKind
  | MacroKind
  | 'earnings'
  | 'takeoverDone'
  | 'takeoverFail'
  | 'tvPick'
  | 'fowlPick'
  | 'firmQuarter'
  | 'mandate';

/**
 * One piece of news, as the archive stores it: facts only. Every outlet's article about it is written from these when
 * it is read (spec §18: derived data is regenerated), so the archive stays small and the words can change freely.
 */
export interface NewsItem {
  id: number;
  kind: NewsKind;
  /** When it broke (Majorsoft Newswire has it at once; other outlets follow, spec §11.7). */
  time: GameTime;
  /** The company it is about, or -1. */
  company: number;
  /** The move it announced (a fraction), or for releases the surprise against expectations. */
  move?: number;
  /** A second move the next morning's papers caused. */
  follow?: number;
  /** When it was first rumoured, if it leaked. */
  rumour?: GameTime;
  /** A competitor firm involved (acquirer, investor, activist), index into the firms. */
  firm?: number;
  /** Another company involved (acquirer, investor). */
  other?: number;
  /** A sum of money: deal value, investment, quarterly revenue, a mandate, the firm's AUM. */
  amount?: number;
  /** A new level and the previous one: the offer price, a dividend, a rate, a release. Earnings: net income. */
  level?: number;
  prev?: number;
  expect?: number;
  /** New CEO's code, and the one they replace. */
  ceo?: string;
  prevCeo?: string;
  /** A name the story needs: the client of a mandate. */
  text?: string;
}

/** A rumour on the Raging Bear boards or in the trade press (spec §11.7), true or bait. */
export interface Rumour {
  time: GameTime;
  company: number;
  /** What is rumoured to be coming. 'pump' is a pump-and-dump's hype. */
  kind: EventKind | 'pump';
  /** Which way the rumour says the price will go. */
  direction: 1 | -1;
  where: 'forum' | 'trade';
}

/** Questions the archive answers (spec §14.1: searchable by ticker, firm, journalist and date). */
export interface NewsQuery {
  company?: number;
  firm?: number;
  /** Industry index of the company it is about. */
  industry?: number;
  kinds?: readonly NewsKind[];
  /** Only news about companies worth at least this much at the start. */
  minCap?: number;
  /** Game times, from inclusive, to exclusive. */
  from?: GameTime;
  to?: GameTime;
  /** Newest first; at most this many. */
  limit?: number;
  ids?: readonly number[];
}
