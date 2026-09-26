import type { ClosedPosition, LedgerEntry, Order, Side } from './account';
import type { GameTime, Phase } from './calendar';
import type { Bar } from './history';

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

/** Key stats for the quote window. */
export interface CompanyDetails {
  id: number;
  name: string;
  ticker: string;
  industry: string;
  subIndustry: string;
  hq: string;
  ceo: string;
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
}

export type EngineEvent =
  | { kind: 'fill'; order: number; company: number; side: Side; shares: number; price: number }
  | { kind: 'close'; day: number; weekEnd: boolean }
  | { kind: 'halt' };

/** Company names for lists and search. */
export interface Directory {
  tickers: string[];
  names: string[];
  industries: string[];
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
}

export type { Bar, ClosedPosition, LedgerEntry, Order };
