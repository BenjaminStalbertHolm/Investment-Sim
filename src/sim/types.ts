import type { ClosedPosition, FundPosition, LedgerEntry, MarginCall, Order, Side } from './account';
import type { StakeFiling } from './governance';
import type { SobAction } from './regulator';
import type { BankruptcyReport } from './bankruptcy';
import type { GameTime, Phase } from './calendar';
import type { Client, Fees } from './clients';
import type { CreditEvent, Loan, Payment, Repayment, Tier } from './loans';
import type { Borrow } from './shorts';
import type { Bar } from './history';
import type { MacroState } from './macro';
import type { Listing } from './market';
import type { MacroKind } from './news';
import type { CellarPost, DarkRequest, Outage, Outcome, SharkLoan, Shell, Terms } from './darkweb';
import type { MarketId, ServiceId } from './data/darkweb';
import type { Employee } from './staff';
import type { Auction, OwnedAsset, OwnedItem } from './lifestyle';
import type { Alert, Contact, DeskState, ImMessage, Page, Rule } from './desk';
import type { PendingIpo } from './ipo';
import type { Tamagotcha } from './period';
import type { GameSettings } from './settings';

/** Chart timeframes (spec §13). */
export type Timeframe = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y' | 'MAX';
export const TIMEFRAMES: readonly Timeframe[] = ['1D', '5D', '1M', '6M', '1Y', '5Y', 'MAX'];

/** Chart and quote id of the MAJOR 500. */
export const INDEX = -1;
/** Chart ids of the futures contracts' underlyings (data/commodities.ts order): -2, -3, … */
export const commodityChart = (k: number) => -2 - k;
export const chartCommodity = (id: number) => -2 - id;
/** Chart ids of the index funds (data/funds.ts order): -100, -101, … */
export const FUND_CHART = -100;
export const fundChart = (f: number) => FUND_CHART - f;
export const chartFund = (id: number) => FUND_CHART - id;

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
  /** Negative for a short. */
  shares: number;
  /** Remaining cost basis, commissions included (for a short, minus what the sale brought in). */
  cost: number;
  last: number;
  /** Negative for a short. */
  value: number;
  dayChange: number;
  unrealized: number;
  realized: number;
  /** Shorts: the annual borrow fee now, the fees paid so far and a lender's recall deadline (spec §12.4–12.5). */
  borrowFee?: number;
  fees?: number;
  recall?: number;
}

/** The account (spec §12.4–12.5): a margin account, with futures, goods in the lobby and bank loans. */
export interface AccountView {
  cash: number;
  /** Market value of the long positions less the short ones. */
  value: number;
  /** What the firm is worth: equity plus goods at resale value, less bank debt (spec §16). */
  netWorth: number;
  deposits: number;
  dayChange: number;
  unrealized: number;
  realized: number;
  buyingPower: number;
  /** Cash + longs − shorts + open futures P&L. */
  equity: number;
  longValue: number;
  shortValue: number;
  /** Futures P&L since the last settlement, and the initial margin they tie up. */
  futuresPnl: number;
  futuresMargin: number;
  goodsValue: number;
  /** Bank debt, with interest and fees owed on missed payments. */
  loans: number;
  /** Index fund units at their value (part of `longValue`), and an SOB fine not yet paid (Phase 8). */
  fundsValue: number;
  fine: number;
  /** A loan shark's loan and the interest accrued on it (Phase 9). */
  sharks: number;
  /** Phase 10: luxuries and collectibles at what they would fetch, and wages owed to staff. */
  lifestyleValue: number;
  wages: number;
  /** Requirements: initial (1 / max leverage on stocks) and maintenance (25% long, 30% short); and the equity above initial. */
  initial: number;
  maintenance: number;
  excess: number;
  call?: MarginCall;
  bankrupt: boolean;
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
  /** Phase 10B: the chief executive is a goat (spec §16C.3). */
  ceoVariant?: 'goat';
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
  /** Short interest, yours included, as a share of the float; and what borrowing the shares costs a year (spec §12.4). */
  shortInterest: number;
  borrowFee: number;
  /** The last eight quarters, oldest first. */
  quarters: QuarterResult[];
  /** Institutional holders, largest first. */
  holders: Holder[];
  /** The player sits on the board (spec §15.5). */
  seat: boolean;
  /** The offshore shell the player's stake is held through, unfiled (spec §14A). */
  shell?: string;
  /** Phase 10: credit rating notches from its standing at the start (spec §14.2), the day it listed if it came later (an IPO), and its splits. */
  rating: number;
  listed?: number;
  split?: number;
}

/** A competitor firm's book (spec §14 firm websites, spec §16). */
export interface FirmView {
  firm: number;
  /** Its fund's assets now: holdings at market prices and cash. */
  aum: number;
  cash: number;
  /** Companies it holds now. */
  positions: number;
  /** Its latest public SOB filing (spec §14: 45 days late): the quarter's last day, and the holdings, largest first.
   *  `pct` is the share of the company it owned. */
  filed: number;
  holdings: { company: number; shares: number; value: number; pct: number }[];
  /** [day, unit value, MAJOR 500] at the start (unit value 1) and at each week's close, then now. */
  history: [number, number, number][];
}

/** MajorTrade → Funds (spec §11.5). */
export interface FundsView {
  trading: boolean;
  /** Half the bid-ask spread on a unit. */
  spread: number;
  list: { fund: number; nav: number; prevClose: number; members: number; fee: number }[];
  positions: (FundPosition & { nav: number; value: number; unrealized: number })[];
}

/** The Securities Oversight Bureau's view of the firm, and the public filings (spec §14, §16B). */
export interface SobView {
  heat: number;
  peak: number;
  record: SobAction[];
  audit?: { opened: number; due: number };
  fine?: { amount: number; due: number };
  suspended?: number;
  frozen?: number;
  /** 5% filings, newest first (firm −1 is the player). */
  filings: StakeFiling[];
  /** The player's stakes over 5%, and its board seats. */
  stakes: { company: number; level: number }[];
  seats: number[];
  investor?: { firm: number; share: number; amount: number; day: number; paid: number };
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
  /** Phase 10: credit rating notches from each company's standing at the start (spec §14.2 ratings agencies). */
  rating: Int8Array;
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
  /** The margin the position after this order needs: initial and maintenance (spec §12.2). */
  margin: { initial: number; maintenance: number };
  /** Short sales: what the stock loan desk says. */
  borrow?: Borrow;
}

export type EngineEvent =
  | { kind: 'fill'; order: number; company: number; side: Side; shares: number; price: number }
  | { kind: 'close'; day: number; weekEnd: boolean }
  | { kind: 'halt' }
  | { kind: 'mail'; id: number }
  | { kind: 'delisted'; company: number }
  | { kind: 'futures'; contract: string; contracts: number; price: number }
  | { kind: 'bankrupt' }
  | { kind: 'fund'; fund: number; units: number; price: number }
  | { kind: 'achievement'; id: string }
  // Phase 10: a page, an ISeekYou message, a new company on the market (an IPO).
  | { kind: 'page' }
  | { kind: 'im' }
  | { kind: 'listed'; company: number }
  | { kind: 'bounce' }
  // Phase 10B: Doors crashes on stage at COMDEXX, and the player's screen fakes a blue screen (spec §16C.2).
  | { kind: 'demoCrash' };

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
  kind: MacroKind | 'earnings' | 'expiry' | 'opek' | 'loan';
  company?: number;
  /** The quarterly dividend paid that day, per share. */
  dividend?: number;
  /** A held futures contract's last trading day. */
  contract?: string;
  /** A loan payment: the loan and roughly how much. */
  loan?: number;
  amount?: number;
}

/** A futures contract on the board (spec §12.3). */
export interface ContractQuote {
  key: string;
  k: number;
  month: number;
  expiry: number;
  price: number;
  bid: number;
  ask: number;
  /** Last settlement, if there was one. */
  settle?: number;
  /** Initial margin per contract. */
  margin: number;
}

export interface FuturesPositionView {
  contract: string;
  k: number;
  expiry: number;
  contracts: number;
  entry: number;
  mark: number;
  price: number;
  /** Since the last settlement (not yet paid), and since the position was opened. */
  open: number;
  pnl: number;
  realized: number;
  margin: number;
}

export interface GoodsView {
  code: string;
  quantity: number;
  cost: number;
  storage: number;
  /** What the merchant would pay now, and the storage a day costs. */
  value: number;
  perDay: number;
  delivered: GameTime;
}

/** MajorTrade → Futures & Commodities and the Chicago Murkantile Exchange (spec §12.3, §14). */
export interface FuturesView {
  enabled: boolean;
  trading: boolean;
  day: number;
  /** Each contract's underlying: price now and at the last close. */
  spot: number[];
  previous: number[];
  /** Listed contracts per commodity, nearest first. */
  chains: ContractQuote[][];
  positions: FuturesPositionView[];
  goods: GoodsView[];
  /** The 10-year yield and the policy rate, for the note and index futures. */
  yield10: number;
  rate: number;
}

/** A weather warning or an OPEK meeting as the public sees it: what happened only once it has. */
export interface OutlookView {
  id: number;
  source: 'weather' | 'opek';
  kind: string;
  issued: GameTime;
  due: GameTime;
  /** The contracts it moves, and by how much the outlook says (log moves). */
  moves: [number, number][];
  done: boolean;
  /** Once done: 'hit' or 'bust', or OPEK's decision; and what actually moved. */
  result?: string;
  actual?: [number, number][];
}

/** MajorTrade → Financing, First Continental Bank and Equifacts (spec §12.9, §16A). */
export interface LoansView {
  /** Each loan with its next payment (at today's rate) and what clearing it today would take. */
  loans: (Loan & { next?: Payment; payoff: number })[];
  /** Principal owed, and interest and fees owed on missed payments. */
  debt: number;
  accrued: number;
  /** The bank's rate on the current debt, and each tier's rate for this firm today. */
  rate: number;
  tiers: (Tier & { rate: number })[];
  /** What more the bank would lend. */
  headroom: number;
  score: number;
  /** The score's parts (spec §16A: payment history, leverage, net worth trend, SOB record). */
  factors: { history: number; leverage: number; trend: number; sob: number };
  record: CreditEvent[];
  policy: number;
  /** Interest on a margin debit balance. */
  marginRate: number;
}

/** What a payment to the bank would do (MajorTrade → Financing, First Continental Bank). */
export interface RepayQuote extends Repayment {
  /** The loan today: principal owed, interest accrued to date, a missed payment, and all it takes to clear it. */
  owed: number;
  interestToDate: number;
  missed: number;
  payoffAmount: number;
  /** What the bank can take now: equity the positions don't need as margin. */
  available: number;
  /** The bank's rate now and on the smaller debt afterwards (it may fall into a cheaper tier). */
  rate: number;
  rateAfter: number;
  balanceAfter: number;
  /** The next payment before and after. */
  before?: Payment;
  after?: Payment;
}

export type { BankruptcyReport };

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
  /** Each futures contract's underlying: price now and at the last close (spec §12.3). */
  commodities: { spot: number[]; previous: number[] };
  /** Heat now and at its highest (spec §16B: the tray's thermometer), and trading suspended until (a trading day). */
  sob: { heat: number; peak: number; suspended?: number };
  /** The dark web's marks on the world (spec §14A): furniture repossessed until a trading day, web sites down or defaced. */
  darkweb: DarkWebStatus;
  /** Phase 10: ISeekYou's unread messages, the newest page, and how many companies there are (the directory grows with IPOs). */
  desk: { im: { unread: number; latest: number }; page: number; companies: number };
}

export interface DarkWebStatus {
  repossessed?: number;
  outages: Outage[];
}

/** A vendor as the market shows it (its nature is hidden). */
export interface VendorView {
  id: number;
  handle: string;
  market: MarketId;
  rating: number;
  reviews: number;
  /** Days since the account was opened. */
  age: number;
  left?: number;
}

/** A purchase as the buyer sees it: what it will cost and do, and — once it is due — how it turned out. */
export interface PurchaseView {
  id: number;
  time: GameTime;
  request: DarkRequest;
  terms: Terms;
  handle: string;
  due: GameTime;
  done?: GameTime;
  result?: Outcome | 'refund';
  company?: number;
  direction?: 1 | -1;
}

/** The Garlic Browser's markets (spec §14A): vendors, their listings with terms, the firm's orders, shell, loan and contacts. */
export interface DarkWebView {
  enabled: boolean;
  heat: number;
  vendors: VendorView[];
  /** Every active vendor's listings, with the terms for a default request (every listing shows its terms, spec §14A). */
  listings: { service: ServiceId; vendor: number; request: DarkRequest; terms?: Terms; error?: string }[];
  purchases: PurchaseView[];
  shell?: Shell & { discovery: number };
  shells: Shell[];
  shark?: SharkLoan & { owed: number; weekly: number };
  bribed: { journalist: number; bribes: number }[];
  /** Companies reporting in the next two weeks, largest first (the Leak Bazaar's stock), and whose stakes the shell hides. */
  reporting: number[];
  hidden: number[];
  cellar: CellarPost[];
}

/** PeopleSoftie HR, Monstrous.com and Greg's List (Phase 10). */
export interface StaffView {
  people: Employee[];
  /** The office (index into OFFICES), the day the firm moved in, and the staff it holds. */
  office: number;
  moved: number;
  capacity: number;
  /** A month's wages, and wages owed. */
  payroll: number;
  owed: number;
  prestige: number;
  bills: { rent: number; upkeep: number; subscriptions: number };
}

/** The Lifestyles Catalogue, eBuy, conferences, the lotto and Hindsight Research (Phase 10). */
export interface LifestyleView {
  assets: OwnedAsset[];
  hype: { level: number; phase: number }[];
  auctions: (Omit<Auction, 'ai'> & { value: number })[];
  items: (OwnedItem & { value: number })[];
  realized: number;
  value: number;
  prestige: number;
  tickets: { conference: string; year: number }[];
  lotto: { tickets: number; draws: { day: number; numbers: number[]; won: number; tickets: number }[] };
  hindsight?: { since: number };
}

export interface DeskView {
  rules: Rule[];
  alerts: Alert[];
  pages: Page[];
  contacts: Contact[];
  messages: ImMessage[];
  letter?: DeskState['letter'];
  /** Rules only run while a Trader is on staff. */
  trader: boolean;
}

export interface IpoView {
  pending: Omit<PendingIpo, 'hot' | 'pop'>[];
}

/** The fun modules as the UI shows them (Phase 10B): each module's part only while it is on. */
export interface ModulesView {
  flags: GameSettings['modules'];
  geo?: {
    tensions: { pair: string; rung: number; since: number }[];
    leaders: Record<string, { title: string; name: string; note?: string; ceo: string; since: number }>;
  };
  period?: { bubble: number; popped?: number; elNino?: { from: number; to: number }; tamagotcha?: Tamagotcha; renamed: number[] };
  gags?: {
    stress: number;
    horoscope: { week: number; sign: 1 | -1 };
    hemline: { month: number; sign: 1 | -1 };
    pizza?: { month: number; decided: number; audit: boolean };
    goat?: number;
    enrun?: { company: number; stage: number };
    darts: { picks: number[]; wins: number; losses: number };
  };
}

export type { Bar, ClosedPosition, LedgerEntry, Order };
