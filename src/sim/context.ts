import type { Company } from '../world/company';
import type { Rng } from '../world/rng';
import type { LedgerKind, Order, OrderRequest } from './account';
import type { Cause } from './bankruptcy';
import type { ImMessage, Page } from './desk';
import type { GameTime } from './calendar';
import type { SimState } from './engine';
import type { Mail, MailDraft } from './mail';
import type { Listing, Market } from './market';
import type { Model } from './model';
import type { NewsItem } from './news';
import type { EngineEvent } from './types';

/** The simulation's random streams (spec §10.1): one per concern, so a new kind of mail never changes the market. */
export interface Streams {
  tick: Rng;
  regime: Rng;
  earnings: Rng;
  events: Rng;
  macro: Rng;
  clients: Rng;
  mail: Rng;
  /** Commodity prices, the weather and OPEK (Phase 7). */
  commodities: Rng;
  /** The broker's own dealings with the firm: share recalls. Only the firm's positions draw from it. */
  broker: Rng;
  /** Phase 8: competitors' client flows; shareholder meetings, bids and offers; the SOB's audits. */
  rivals: Rng;
  governance: Rng;
  regulator: Rng;
  /** Phase 9: the dark web — whether a purchase works, vendors coming and going, blackmail (spec §14A). */
  darkweb: Rng;
  /** Phase 10: staff and applicants; the firm's luxuries, collectibles, conferences and lotto; IPOs and splits; messages. */
  staff: Rng;
  lifestyle: Rng;
  ipo: Rng;
  extras: Rng;
  /** Phase 10B: the fun modules (spec §16C), one stream each, drawn on only while the module is on. */
  geo: Rng;
  period: Rng;
  gags: Rng;
}

/** What the engine offers the modules that run on its clock: events, macro, clients and mail. */
export interface Sim {
  readonly s: SimState;
  readonly market: Market;
  readonly model: Model;
  readonly companies: readonly Company[];
  readonly rng: Streams;
  readonly time: GameTime;
  /** Adds a piece of news to the archive, and alerts the player if it is about a holding. */
  report(item: Omit<NewsItem, 'id' | 'time'>): NewsItem;
  send(mail: MailDraft): Mail;
  /** Takes a company off the market: cancels orders, cashes out or writes off the player's shares. */
  delist(company: number, reason: Listing, price: number): void;
  /** Net asset value of the book: cash plus positions at market. */
  nav(): number;
  /** Has the broker sell positions, largest first, until the cash covers `amount`. */
  raiseCash(amount: number): void;
  /** Shares of a company the firm holds; negative when it is short. */
  held(company: number): number;
  /**
   * A news-driven log move for a company, before it reaches the price: good news squeezes heavily shorted stocks further
   * (spec §12.4), bad news brings the short sellers in.
   */
  squeeze(company: number, move: number): number;
  /** Awards an achievement (spec §16), once. */
  unlock(id: string): void;
  /** Pays a strategic investor its share of fees just earned (spec §15.6). */
  shareFees(fee: number): void;
  /** Phase 10: whether the account can pay `amount` from equity the positions don't need. */
  payable(amount: number): boolean;
  /**
   * An obligation falls due (rent, upkeep, wages): paid from free equity, else the broker sells what it must; what still
   * can't be paid is bankruptcy (spec §16). `accrued` amounts were charged as they arose and only move cash now.
   */
  settle(amount: number, bill: Bill): void;
  placeOrder(request: OrderRequest): { order: Order } | { error: string };
  tradeFund(fund: number, units: number, forced?: boolean): { price: number } | { error: string };
  fundPrice(fund: number): number;
  /** A message on the pager (spec §4A), and one from an ISeekYou contact. */
  page(page: Omit<Page, 'id' | 'time'>): void;
  im(message: Omit<ImMessage, 'id' | 'time' | 'read'>): ImMessage;
  /** A new company joins the market (an IPO): every per-company array grows by one. Returns its id. */
  addCompany(genome: string, tier: number, price: number, value: number): number;
  /** Shares allotted to the firm in an IPO, bought at the offer price without commission. */
  allot(company: number, shares: number, price: number): void;
  /** A stock split, `ratio` new shares for each old one. */
  split(company: number, ratio: number): void;
  /** Phase 10B: a reverse split, one new share for `ratio` old, with cash for the fractions. */
  reverseSplit(company: number, ratio: number): void;
  /** A supply shock to a commodity (a log move of its spot, spread over some bars). */
  commodityShock(code: string, move: number, bars: number): void;
  /** Tells the UI something happened (the demo crash's blue screen). */
  emit(event: EngineEvent): void;
}

/** A bill as the engine collects it: the ledger line, whether it was charged already, and what not paying it ends as. */
export interface Bill {
  kind: LedgerKind;
  note: string;
  accrued?: boolean;
  cause: Cause;
}
