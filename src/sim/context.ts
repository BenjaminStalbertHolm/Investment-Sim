import type { Company } from '../world/company';
import type { Rng } from '../world/rng';
import type { GameTime } from './calendar';
import type { SimState } from './engine';
import type { Mail, MailDraft } from './mail';
import type { Listing, Market } from './market';
import type { Model } from './model';
import type { NewsItem } from './news';

/** The simulation's random streams (spec §10.1): one per concern, so a new kind of mail never changes the market. */
export interface Streams {
  tick: Rng;
  regime: Rng;
  earnings: Rng;
  events: Rng;
  macro: Rng;
  clients: Rng;
  mail: Rng;
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
  /** Shares of a company the firm holds. */
  held(company: number): number;
}
