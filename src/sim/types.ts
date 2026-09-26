import type { ClosedPosition, LedgerEntry, Order, Side } from './account';
import type { GameTime, Phase } from './calendar';
import type { Client, Fees } from './clients';
import type { Bar } from './history';
import type { MacroState } from './macro';
import type { Listing } from './market';
import type { MacroKind } from './news';

/** Chart timeframes (spec §13). */
export type Timeframe = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y' | 'MAX';
export const TIMEFRAMES: readonly Timeframe[] = ['1D', '5D', '1M', '6M', '1Y', '5Y', 'MAX'];

/** Chart and quote id of the MAJOR 500. */
export const INDEX = -1;

export interface Quote {
  last: number;
  prevClose: number;
  change: number;
  pct: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export interface PositionView {
  company: number;
  shares: number;
  /** Remaining cost basis, commissions included. */
  cost: number;
  last: number;
  value: number;
  dayChange: number;
  unrealized: number;
  realized: number;
}

export interface AccountView {
  cash: number;
  /** Market value of the positions. */
  value: number;
  netWorth: number;
  deposits: number;
  dayChange: number;
  unrealized: number;
  realized: number;
  buyingPower: number;
}

/** One quarter's results. `quarter` is year × 4 + (0 … 3). */
export interface QuarterResult {
  quarter: number;
  /** Day it was reported. */
  reported: number;
  revenue: number;
  income: number;
  eps: number;
}

/** A line of a company's institutional holders table: a competitor firm (index into Directory.firms). */
export interface Holder {
  firm: number;
  shares: number;
}

/** Key stats for the quote window and the company's Investor Relations page. */
export interface CompanyDetails {
  id: number;
  genome: string;
  name: string;
  ticker: string;
  industry: string;
  subIndustry: string;
  hq: string;
  ceo: string;
  /** The CEO's portrait code when a new CEO has taken over (spec §11.6). */
  ceoCode?: string;
  /** Still trading, or taken over or bankrupt (spec §11.6). */
  status: Listing;
  founded: number;
  shares: number;
  marketCap: number;
  revenue: number;
  income: number;
  eps: number;
  pe: number | null;
  dividendYield: number;
  beta: number;
  volatility: number;
  high52: number;
  low52: number;
  /** Average daily volume, shares. */
  adv: number;
  nextEarnings: number;
  lastEarnings: number;
  insiderPct: number;
  floatPct: number;
  /** The last eight quarters, oldest first. */
  quarters: QuarterResult[];
  /** Institutional holders, largest first. */
  holders: Holder[];
}

/** A competitor firm's book (spec §14 firm websites). */
export interface FirmView {
  firm: number;
  /** Market value of its holdings. */
  aum: number;
  /** Largest first. `pct` is the share of the company it owns. */
  holdings: { company: number; shares: number; value: number; pct: number }[];
  /** [day, value, MAJOR 500] at the start and at each week's close, then now. */
  history: [number, number, number][];
}

/** Every company's numbers in columns, for market-wide pages: movers, sector map, screener, news (spec §14). */
export interface MarketTable {
  last: Float64Array;
  prevClose: Float64Array;
  /** Shares traded today (or in the last session, until the next open). */
  volume: Float64Array;
  shares: Float64Array;
  /** Trailing twelve months. */
  revenue: Float64Array;
  income: Float64Array;
  dividendYield: Float64Array;
  /** Industry index. */
  sector: Uint8Array;
  /** Day of the latest earnings report, -1 before the first. */
  reported: Int32Array;
  /** Closes at the end of the last two weeks (the start prices stand in before there are two). */
  week?: { day: number; close: Float64Array; previous: Float64Array };
  /** Listing status (market.ts LISTING): delisted companies no longer trade. */
  status: Uint8Array;
}

/** What the order ticket shows before you confirm (spec §12.2). */
export interface Estimate {
  bid: number;
  ask: number;
  /** Expected average fill price. */
  price: number;
  value: number;
  commission: number;
  /** Buys: value plus commission; sells: the proceeds, value less commission. */
  total: number;
  /** Estimated market impact, a fraction of the price. */
  impact: number;
  /** Order size as a share of average daily volume. */
  volumeShare: number;
  buyingPower: number;
  buyingPowerAfter: number;
  /** Mandate constraints the position after this order would break (spec §15.1). */
  warnings: string[];
}

export type EngineEvent =
  | { kind: 'fill'; order: number; company: number; side: Side; shares: number; price: number }
  | { kind: 'close'; day: number; weekEnd: boolean }
  | { kind: 'halt' }
  | { kind: 'mail'; id: number }
  | { kind: 'delisted'; company: number };

/** The firm's clients and money (spec §15.1): everything is AUM; the firm's own capital is the part no client owns. */
export interface ClientsView {
  aum: number;
  unit: number;
  clientAssets: number;
  firmCapital: number;
  reputation: number;
  feesEarned: number;
  fees: Fees;
  clients: Client[];
  macro: MacroState;
}

/** A line of the Trade app's calendar (spec §12.8). `minute` is the time of day. */
export interface CalendarEntry {
  day: number;
  minute: number;
  kind: MacroKind | 'earnings';
  company?: number;
  /** The quarterly dividend paid that day, per share. */
  dividend?: number;
}

/** Company names for lists and search. */
export interface Directory {
  tickers: string[];
  names: string[];
  industries: string[];
  /** Genomes, so the UI can decode any company (websites, spec §14). */
  genomes: string[];
  /** Competitor firms (spec §6, §16). */
  firms: { id: string; name: string; strategy: string; preset: boolean }[];
}

/** Live chart data for a watched company: its latest 5-minute bar and today's daily bar so far. */
export interface LiveBars {
  bar?: Bar;
  day?: Bar;
}

/** What the worker posts at most every 250 ms (spec §11.3). */
export interface Snapshot {
  time: GameTime;
  phase: Phase;
  holiday?: string;
  halted: boolean;
  speed: number;
  index: Quote;
  /** Watched companies, with their last 20 closes for sparklines. */
  quotes: Record<number, Quote & { spark: number[] }>;
  live: Record<number, LiveBars>;
  account: AccountView;
  positions: PositionView[];
  openOrders: Order[];
  /** Bumped whenever the ledger, order history or closed positions change, so views know to refetch. */
  revision: number;
  events: EngineEvent[];
  /** Unread mail (the tray badge), the newest letter and the size of the news archive: views refetch when they change. */
  mail: { unread: number; latest: number };
  news: number;
}

export type { Bar, ClosedPosition, LedgerEntry, Order };
