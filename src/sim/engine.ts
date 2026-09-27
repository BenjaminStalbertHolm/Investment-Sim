import { ceoName, decodeCeo } from '../world/ceo';
import { decodeCompany, type Company } from '../world/company';
import { generateWorld, type World, type WorldOptions } from '../world/generator';
import type { Firm, Holding } from '../world/ownership';
import { Rng, type RngState } from '../world/rng';
import {
  book, bookCash, bookFill, direction, isStop, opens, type Account, type Order, type OrderRequest, type OrderStatus, type Side,
} from './account';
import { bankruptcyReport, type BankruptcyReport, type Cause } from './bankruptcy';
import {
  BAR_MINUTES, BARS_PER_DAY, gameYear, CLOSE, OPEN, START_DAY, addTradingDays, at, dayOf, holiday, isTradingDay, minuteOf,
  nextOpen, nextTradingDay, phaseAt, previousTradingDay, weekday, type GameTime, type Phase,
} from './calendar';
import {
  DEFAULT_FEES, accept, clientUnits, closeOfDay, decline, firstOffer, founding, mandateWarnings, morningClients,
  quarterEnd, settle, unitPrice, type ClientsState, type Fees,
} from './clients';
import {
  Commodities, chain, initialCommodities, listed, opekMeetings, parseContract, pregameCommodity, type CommodityState,
  type Contract, type PriceContext,
} from './commodities';
import type { Sim, Streams } from './context';
import { CONTRACTS, CONTRACT_INDEX, EXPIRY_WARNING_DAYS, MAINTENANCE, MJ, OPEK_MINUTE, STORAGE_RATE } from './data/commodities';
import {
  applyFollowUp, closeDeal, dump, enqueue, eventRates, fire, leak, newEvents, pick, planAhead, planPicks, type EventsState,
  type Timed,
} from './events';
import { bookFutures, chargeStorage, expire, goodsAtSpot, goodsValue, sellGoods, settleFutures, type Expiry } from './futures';
import {
  BANK_LIMIT, GRACE_DAYS, HISTORY, LATE_FEE, MIN_LOAN, TERMS, TIERS, accrue, accrued, bankDebt, bankRate, creditScore,
  isPaymentDay, lateAmount, newLoans, nextPayment, paymentDay, payoffAmount, quoteLoan, schedule, splitRepayment,
  type Loan, type LoansState, type Structure,
} from './loans';
import { initialMacro, release, releasesOn, type MacroState } from './macro';
import { FOLDER_OF, digest, morningMail, newMailState, noteTrade, type Mail, type MailDraft, type MailLine, type MailState } from './mail';
import { MAINTENANCE_LONG, MAINTENANCE_SHORT, MARGIN_SPREAD, buyingPower, requirements } from './margin';
import type { NewsItem, NewsQuery, Rumour } from './news';
import { hireJournalists, type Journalist } from './press';
import {
  QUARTERS, initialFundamentals, nextReport, quarterReported, reportDay, reportEarnings, type Fundamentals,
} from './earnings';
import {
  createHistory, dailyBars, endsWeek, oldestDay, packHistory, recordDay, unpackHistory, weekCloses, weeklyCloses,
  weeklyValues, type Bar, type HistoryState,
} from './history';
import { LISTING, Market, PARTICIPATION, initialMarket, type Listing, type MarketState } from './market';
import { BAR_YEARS, buildModel, type Model } from './model';
import { pregameBars, pregameDays, pregameIndex, pregameMarket, sessionBars } from './pregame';
import { defaultPlayer, type Player } from './player';
import type { GameSettings } from './settings';
import { RECALL_DAYS, borrowOf, pileIn, recallChance, revertShortInterest, squeeze, type Borrow } from './shorts';
import {
  INDEX, chartCommodity, type AccountView, type CalendarEntry, type ClientsView, type CompanyDetails, type ContractQuote,
  type Directory, type EngineEvent, type Estimate, type FirmView, type FuturesView, type Holder, type LiveBars, type LoansView, type RepayQuote,
  type MarketTable, type OutlookView, type PositionView, type Quote, type QuarterResult, type Timeframe,
} from './types';
import { seasonOf } from './earnings';

/** The generated world, as saved: genomes rather than decoded companies (spec §18). */
export interface SavedWorld {
  seed: string;
  genomes: string[];
  tiers: Uint8Array;
  firms: Firm[];
  holdings: Holding[];
  insiderPct: Float64Array;
  floatPct: Float64Array;
}

/** Everything the simulation needs to carry on exactly where it was (spec §18 SimState). */
export interface SimState {
  world: SavedWorld;
  settings: GameSettings;
  player: Player;
  clock: GameTime;
  rng: Record<keyof Streams, RngState>;
  market: MarketState;
  fundamentals: Fundamentals;
  history: HistoryState;
  account: Account;
  /** [day, net worth, MAJOR 500] at each close. */
  stats: [number, number, number][];
  /** Phase 6: the economy, corporate events and the news archive, the press, clients and mail. */
  macro: MacroState;
  events: EventsState;
  journalists: Journalist[];
  clients: ClientsState;
  mail: MailState;
  /** Phase 7: commodities and the weather and OPEK outlooks, bank loans and credit, and the end (spec §16). */
  commodities: CommodityState;
  loans: LoansState;
  bankruptcy?: BankruptcyReport;
}

const STREAMS: (keyof Streams)[] = ['tick', 'regime', 'earnings', 'events', 'macro', 'clients', 'mail', 'commodities', 'broker'];
/** The stream each saved state is named after (spec §10.1). */
export const STREAM_NAMES: Record<keyof Streams, string> = {
  tick: 'market:tick', regime: 'market:regime', earnings: 'earnings', events: 'events', macro: 'macro', clients: 'clients', mail: 'mail',
  commodities: 'commodities', broker: 'broker',
};
const MORNING = 7 * 60;
/** Half the bid-ask spread of a front-month futures contract; further months are wider. */
const FUTURES_SPREAD = 0.0002;

export interface NewGameOptions extends WorldOptions {
  settings: GameSettings;
  firmName: string;
  /** Logo and CEO; a default logo and a CEO drawn from the seed when omitted. */
  player?: Omit<Player, 'firmName'>;
}

const SESSIONS_KEPT = 5;
const dollars = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const count = (n: number) => n.toLocaleString('en-US');

/** What liquidation must achieve (spec §12.4, §16A): the maintenance requirement, an amount the account can pay out, or everything. */
type Goal = 'margin' | { cash: number } | 'all';

/**
 * The market simulation (spec §11): runs headless in tests and inside the Web Worker in the game. It owns market
 * truth; the UI only reads snapshots and sends orders. It is also the firm's broker and bank (Phase 7).
 */
export class Engine implements Sim {
  readonly market: Market;
  readonly rng: Streams;
  readonly commodities: Commodities;
  /** Chance per trading day that each company has a corporate event (derived, never saved). */
  private readonly eventRate: Float64Array;
  /** Companies the player is looking at get real 5-minute bars (spec §11.3), as do holdings and the MAJOR 500. */
  private watched = new Set<number>();
  private readonly intraday = new Map<number, Bar[]>();
  private events: EngineEvent[] = [];
  private pregame?: { days: number[]; market: Float64Array };
  private readonly pregameCommodities = new Map<number, Bar[]>();

  private constructor(
    /** The whole saved state. Modules on the engine's clock (events, clients, mail) read and change it. */
    readonly s: SimState,
    readonly companies: readonly Company[],
    readonly model: Model = buildModel(s.world.seed, companies, s.settings),
  ) {
    this.market = new Market(s.market, model, s.settings);
    this.market.rate = s.macro.rate;
    this.rng = Object.fromEntries(STREAMS.map((k) => [k, Rng.fromState(s.rng[k])])) as unknown as Streams;
    this.eventRate = eventRates(companies, s.world.tiers, s.settings.events);
    this.commodities = new Commodities(s.commodities, s.settings.volatility);
    // Commodities move alongside the stock market, and move the industries that depend on them (spec §11.2).
    this.market.onFactors = (market, years, regime) => this.commodities.step(this.rng.commodities, market, years, regime, this.s.macro.rate);
  }

  static newGame(options: NewGameOptions): Engine {
    return Engine.create(generateWorld(options), options);
  }

  /** A new game on a generated world, at the opening bell of the start date. */
  static create(world: World, options: Pick<NewGameOptions, 'settings' | 'firmName' | 'player' | 'playerFirm'>): Engine {
    const { seed, companies } = world;
    const { settings } = options;
    const model = buildModel(seed, companies, settings);
    const clock = at(START_DAY, OPEN);
    const capital = settings.startingCapital;
    const player: Player = {
      ...defaultPlayer(seed, options.firmName),
      ...options.player,
      firmName: options.firmName,
      presetFirm: options.playerFirm,
    };
    const market = initialMarket(companies, model, Rng.stream(seed, 'market:value'));
    const state: SimState = {
      world: {
        seed,
        genomes: companies.map((c) => c.genome),
        tiers: Uint8Array.from(world.tiers),
        firms: world.firms,
        holdings: world.holdings,
        insiderPct: Float64Array.from(world.insiderPct),
        floatPct: Float64Array.from(world.floatPct),
      },
      settings,
      player,
      clock,
      rng: Object.fromEntries(STREAMS.map((k) => [k, Rng.stream(seed, STREAM_NAMES[k]).state()])) as SimState['rng'],
      market,
      fundamentals: initialFundamentals(companies),
      history: createHistory(companies.length),
      account: {
        cash: capital,
        deposits: capital,
        positions: [],
        closed: [],
        orders: [],
        nextOrder: 1,
        // The starting capital is the founding clients' seed money (spec §15.1).
        ledger: [{ time: clock, kind: 'deposit', amount: capital, balance: capital, note: settings.clients ? 'Founding clients' : undefined }],
        futures: [],
        goods: [],
        charges: 0,
      },
      stats: [],
      macro: initialMacro(),
      events: newEvents(),
      journalists: hireJournalists(seed),
      clients: founding(Rng.stream(seed, 'clients:founders'), capital, 1000, player.ceoName, player.firmName, settings.clients),
      mail: newMailState(addTradingDays(START_DAY, 7)),
      commodities: initialCommodities(seed),
      loans: newLoans(),
    };
    state.clients.nextOffer = firstOffer(START_DAY);
    const engine = new Engine(structuredClone(state), companies, model);
    engine.firstDay();
    return engine;
  }

  /** The start of the first day: the game begins at the bell, after the morning's work. */
  private firstDay(): void {
    const day = dayOf(this.s.clock);
    this.send({ kind: 'welcome' });
    if (this.s.settings.clients) this.send({ kind: 'founders', amount: this.s.settings.startingCapital });
    this.scheduleDay(day);
  }

  /** Continues a game from exportState(). Companies are decoded from their genomes, not regenerated. */
  static restore(saved: SimState): Engine {
    // Loans saved by the first Phase 7 build, before interest accrued day by day, start accruing from the save.
    for (const loan of saved.loans.loans) {
      loan.interest ??= 0;
      loan.accruedTo ??= dayOf(saved.clock);
    }
    return new Engine({ ...saved, history: unpackHistory(saved.history) }, saved.world.genomes.map(decodeCompany));
  }

  /** A snapshot of the whole simulation, ready to save (spec §18). Intraday bars are not part of it. */
  exportState(): SimState {
    this.s.rng = Object.fromEntries(STREAMS.map((k) => [k, this.rng[k].state()])) as SimState['rng'];
    return structuredClone({ ...this.s, history: packHistory(this.s.history) });
  }

  get time(): GameTime {
    return this.s.clock;
  }
  get phase(): Phase {
    return phaseAt(this.s.clock);
  }
  get seed(): string {
    return this.s.world.seed;
  }
  get settings(): GameSettings {
    return this.s.settings;
  }
  get firmName(): string {
    return this.s.player.firmName;
  }
  get player(): Player {
    return { ...this.s.player };
  }
  /** Renames the firm or changes its logo or CEO (My Computer → Firm). */
  setPlayer(change: Partial<Omit<Player, 'presetFirm'>>): Player {
    this.s.player = { ...this.s.player, ...change };
    return this.player;
  }
  get halted(): boolean {
    return this.market.state.halted;
  }
  /** Trading happens now: the market is open and not halted. */
  get trading(): boolean {
    return this.phase === 'open' && !this.market.state.halted;
  }
  /** The firm went bankrupt (spec §16): the clock has stopped for good. */
  get bankrupt(): boolean {
    return !!this.s.bankruptcy;
  }

  // ---------- Time (spec §11.1) ----------

  /** Runs every morning, open, bar, close and scheduled task up to `target`. A bankruptcy stops the clock. */
  advanceTo(target: GameTime): void {
    while (!this.s.bankruptcy) {
      const market = this.nextMarket();
      const queued = this.s.events.queue[0];
      // A task runs before a later market moment; at the same minute, the market (open, bar, close) goes first.
      if (queued && queued.time < market) {
        if (queued.time > target) break;
        this.s.clock = Math.max(this.s.clock, queued.time);
        this.run(this.s.events.queue.shift()!);
        continue;
      }
      if (market > target) break;
      this.s.clock = market;
      const minute = minuteOf(market);
      if (minute === MORNING) this.morning();
      else if (minute === OPEN) this.open();
      else {
        this.bar((minute - OPEN) / BAR_MINUTES - 1);
        if (minute === CLOSE) this.close();
      }
    }
    if (target > this.s.clock && !this.s.bankruptcy) this.s.clock = target;
  }

  advance(minutes: number): void {
    this.advanceTo(this.s.clock + minutes);
  }

  /** "Skip to next open": runs the rest of today and the night, and stops at the next opening bell. */
  skipToNextOpen(): void {
    this.advanceTo(nextOpen(this.s.clock));
  }

  /** Runs to the close of the `n`th session from now; today's counts if it has not closed yet. */
  runSessions(n: number): void {
    let day = dayOf(this.s.clock);
    if (!isTradingDay(day) || minuteOf(this.s.clock) >= CLOSE) day = nextTradingDay(day);
    for (let k = 1; k < n; k++) day = nextTradingDay(day);
    this.advanceTo(at(day, CLOSE));
  }

  /** The next market moment after the clock: the morning's work (07:00), the open (09:30) or a bar end (09:35 … 16:00). */
  private nextMarket(): GameTime {
    const day = dayOf(this.s.clock);
    const minute = minuteOf(this.s.clock);
    if (isTradingDay(day)) {
      if (minute < MORNING) return at(day, MORNING);
      if (minute < OPEN) return at(day, OPEN);
      if (minute < CLOSE) return at(day, OPEN + (Math.floor((minute - OPEN) / BAR_MINUTES) + 1) * BAR_MINUTES);
    }
    return at(nextTradingDay(day), MORNING);
  }

  private run(task: Timed): void {
    switch (task.do) {
      case 'fire':
        return fire(this, task.plan);
      case 'rumour':
        return leak(this, task.plan);
      case 'followUp':
        return applyFollowUp(this, task);
      case 'dealClose':
        return closeDeal(this, task.news);
      case 'delist':
        if (!this.market.state.status[task.company]) this.delist(task.company, LISTING.bankrupt, this.market.price[task.company]);
        return;
      case 'dump':
        return dump(this, task.company, task.move);
      case 'pick':
        return pick(this, task);
      case 'release': {
        const r = release(task.kind, this.s.macro, this.market, this.rng.macro);
        this.report({ kind: r.kind, company: -1, level: r.level, prev: r.prev, expect: r.expect, move: r.surprise, follow: r.tone });
        if (r.kind === 'fed') this.commodities.rateChange(r.level - r.prev);
        return;
      }
      case 'redeem':
        return settle(this, task.client);
      case 'buyIn':
        return this.buyIn(task.company);
      case 'outlook':
        return this.outlookDue(task.id);
    }
  }

  /** Decides what today brings: the day's releases, picks and events ahead, then the morning post (spec §15.3). */
  private scheduleDay(day: number): void {
    for (const r of releasesOn(day)) {
      const time = at(day, r.minute);
      if (time > this.s.clock) enqueue(this.s.events, time, { do: 'release', kind: r.kind });
    }
    planAhead(this, day, this.eventRate);
    planPicks(this, day);
  }

  /** 07:00 on a trading day. */
  private morning(): void {
    const day = dayOf(this.s.clock);
    const { settings } = this.s;
    this.scheduleDay(day);
    morningMail(this, day, settings.insiderTips, settings.tipReliability);
    if (settings.clients) morningClients(this, day, this.fees);
    this.outlooks(day);
    this.expiryWarnings(day);
  }

  /**
   * Opening bell: short interest drifts, the regime moves on, earnings and dividends released overnight, the gap, then
   * the broker and the bank (margin calls and loan payments due) and everything queued for the open.
   */
  private open(): void {
    const day = dayOf(this.s.clock);
    revertShortInterest(this.market.state.shortInterest, this.model.shortBase);
    this.commodities.startDay(this.rng.commodities, this.s.macro.inflation);
    this.market.startDay(this.rng.regime);
    const reports = reportEarnings(day, this.s.fundamentals, this.market, this.companies, this.rng.earnings, (i, m) => this.squeeze(i, m));
    this.payDividends(reports.map((r) => r.company));
    for (const { company, move } of reports) {
      // The archive keeps the reports that make news: large companies, and big surprises at the not-so-small.
      const cap = this.companies[company].marketCap;
      if (cap < 10e9 && (cap < 300e6 || Math.abs(move) < 0.2)) continue;
      const q = company * QUARTERS + QUARTERS - 1;
      this.report({ kind: 'earnings', company, move, amount: this.s.fundamentals.quarterRevenue[q], level: this.s.fundamentals.quarterIncome[q] });
    }
    this.market.openingGap(this.rng.tick);
    let oldest = day;
    for (let k = 1; k < SESSIONS_KEPT; k++) oldest = previousTradingDay(oldest);
    for (const [id, bars] of this.intraday) this.intraday.set(id, bars.filter((b) => b.time >= oldest * 86_400));
    this.marginDue(day);
    if (!this.s.bankruptcy) this.loansDue(day);
    if (this.s.bankruptcy) return;
    for (const order of this.openOrders()) this.execute(order);
  }

  /**
   * A quarter of each payer's annual dividend goes out on its report day (spec §15.2): the price and value drop by it
   * before the open, and the firm is paid for the shares it holds — or pays it, on shares it is short.
   */
  private payDividends(companies: number[]): void {
    const { dividend } = this.s.fundamentals;
    const lines: { company: number; shares: number; amount: number }[] = [];
    for (const i of companies) {
      const paid = dividend[i] / 4;
      if (paid <= 0) continue;
      const cut = Math.min(0.5, paid / this.market.price[i]);
      this.market.push(i, -cut);
      this.market.state.lnV[i] += Math.log1p(-cut);
      const shares = this.held(i);
      if (!shares) continue;
      bookCash(this.s.account, i, 'dividend', shares * paid, this.s.clock);
      lines.push({ company: i, shares, amount: shares * paid });
    }
    if (lines.length) this.send({ kind: 'dividend', lines, amount: lines.reduce((a, l) => a + l.amount, 0) });
  }

  private bar(k: number): void {
    const tracked = this.tracked();
    const before = tracked.map((id) => (id === INDEX ? this.market.indexLevel : this.market.price[id]));
    if (!this.market.bar(this.rng.tick, k)) return;
    const time = (dayOf(this.s.clock) * 1440 + OPEN + k * BAR_MINUTES) * 60;
    tracked.forEach((id, n) => {
      const open = before[n];
      const bars = this.intraday.get(id) ?? this.intraday.set(id, []).get(id)!;
      if (id === INDEX) {
        const close = this.market.indexLevel;
        bars.push({ time, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 0 });
      } else {
        const close = this.market.price[id];
        const wick = 0.25 * this.model.idio[id] * this.market.wick[id];
        const volume = this.market.barVolume[id];
        bars.push({ time, open, high: Math.max(open, close) * (1 + wick), low: Math.min(open, close) * (1 - wick), close, volume });
      }
    });
    if (this.market.state.halted) this.events.push({ kind: 'halt' });
    this.workOrders();
  }

  private close(): void {
    const day = dayOf(this.s.clock);
    const { market } = this;
    const { dayOpen, dayHigh, dayLow, dayVolume, index } = market.state;
    const prices = { open: dayOpen, high: dayHigh, low: dayLow, close: market.price, volume: dayVolume };
    recordDay(this.s.history, day, prices, [index.open, index.high, index.low, market.indexLevel]);
    for (const order of this.openOrders()) if (order.tif === 'day') this.finish(order, 'expired');
    // Futures (spec §12.3): the daily settlement, then contracts at their last trading day are delivered or settled.
    const account = this.s.account;
    const p = this.prices();
    settleFutures(account, (key) => this.futuresPrice(key, p), this.s.clock);
    for (const e of expire(account, day, (k) => this.commodities.spot(k, p), this.s.clock)) this.expired(e);
    this.commodities.close(p);
    // Overnight charges for the calendar days until the next session: borrow fees, margin and loan interest, storage.
    const nights = nextTradingDay(day) - day;
    this.chargeBorrow(nights);
    this.chargeInterest(nights);
    this.accrueLoans(nextTradingDay(day));
    chargeStorage(account, nights, (code) => this.commodities.spot(CONTRACT_INDEX[code], p), this.s.clock);
    this.recalls(day);
    digest(this, day);
    const { settings } = this.s;
    closeOfDay(this, this.fees);
    const month = (d: number) => new Date(d * 86_400_000).getUTCMonth();
    const next = nextTradingDay(day);
    if (Math.floor(month(next) / 3) !== Math.floor(month(day) / 3)) quarterEnd(this, this.fees, settings.clientPatience);
    this.checkMargin(day);
    this.s.stats.push([day, this.netWorth(), market.indexLevel]);
    this.events.push({ kind: 'close', day, weekEnd: endsWeek(day) });
  }

  private get fees(): Fees {
    return this.s.player.fees ?? DEFAULT_FEES;
  }

  // ---------- News and mail (spec §14.1, §15) ----------

  report(draft: Omit<NewsItem, 'id' | 'time'>): NewsItem {
    const news = this.s.events.news;
    const item = { ...draft, id: news.length, time: this.s.clock } as NewsItem;
    for (const key of Object.keys(item) as (keyof NewsItem)[]) if (item[key] === undefined) delete item[key];
    news.push(item);
    const holdings = [item.company, item.other].filter((c): c is number => c !== undefined && c >= 0 && this.held(c) !== 0);
    if (this.s.mail.alerts && holdings.length && item.kind !== 'takeoverDone') this.send({ kind: 'alert', news: item.id, company: holdings[0] });
    return item;
  }

  send(draft: MailDraft): Mail {
    const messages = this.s.mail.messages;
    const mail: Mail = { ...draft, id: messages.length + 1, time: draft.time ?? this.s.clock, read: draft.read ?? FOLDER_OF[draft.kind] === 'sent', flagged: false, deleted: false };
    for (const key of Object.keys(mail) as (keyof Mail)[]) if (mail[key] === undefined) delete mail[key];
    messages.push(mail);
    if (!mail.read) this.events.push({ kind: 'mail', id: mail.id });
    return mail;
  }

  /**
   * A company leaves the market (spec §11.6). Open orders are cancelled; the firm's shares are paid out at `price` (a
   * takeover) or written off (a bankruptcy) — a short is closed there too; competitors' stakes go with it; the MAJOR 500
   * gets a new member.
   */
  delist(company: number, reason: Listing, price: number): void {
    const final = reason === LISTING.bankrupt ? 0 : price;
    this.market.delist(company, reason, reason === LISTING.bankrupt ? Math.max(0.01, price) : price);
    for (const order of this.openOrders()) if (order.company === company) this.finish(order, 'cancelled', 'The company was delisted.');
    const shares = this.held(company);
    if (shares) {
      bookCash(this.s.account, company, reason === LISTING.bankrupt ? 'writeoff' : 'acquisition', shares * final, this.s.clock);
      this.send({ kind: 'delisted', company, reason: reason === LISTING.bankrupt ? 'bankrupt' : 'acquired', amount: shares * final, lines: [{ company, shares, amount: shares * final }] });
    }
    this.s.world.holdings = this.s.world.holdings.filter((h) => h.company !== company);
    this.events.push({ kind: 'delisted', company });
  }

  /** Net asset value of the book (spec §15.1): what the firm is worth. */
  nav(): number {
    return this.netWorth();
  }

  /** The broker sells the largest long positions first until the cash covers `amount` (redemptions, spec §15.1). */
  raiseCash(amount: number): void {
    if (!this.trading) return;
    const { price } = this.market;
    const positions = this.s.account.positions.filter((p) => p.shares > 0).sort((a, b) => b.shares * price[b.company] - a.shares * price[a.company] || a.company - b.company);
    for (const p of positions) {
      const short = amount - this.s.account.cash;
      if (short <= 0) break;
      const bid = price[p.company] * (1 - this.market.halfSpread[p.company]);
      const shares = Math.min(p.shares, Math.ceil((short * 1.02 + this.s.settings.commission.fixed) / bid));
      this.placeOrder({ company: p.company, side: 'sell', type: 'market', shares, tif: 'day' });
    }
  }

  /** Unread letters (not counting sent or deleted ones) and the newest letter's id: the tray badge. */
  mailStatus(): { unread: number; latest: number } {
    const messages = this.s.mail.messages;
    let unread = 0;
    for (const m of messages) if (!m.read && !m.deleted) unread++;
    return { unread, latest: messages.length };
  }

  /** Size of the news archive; it only grows. */
  get newsCount(): number {
    return this.s.events.news.length;
  }

  /** Every letter, oldest first (spec §15), and whether news alerts are on. */
  mail(): { messages: Mail[]; alerts: boolean } {
    return { messages: structuredClone(this.s.mail.messages), alerts: this.s.mail.alerts };
  }

  /** Marks letters read or unread, flagged, deleted. */
  markMail(ids: readonly number[], patch: Partial<Pick<Mail, 'read' | 'flagged' | 'deleted'>>): void {
    for (const m of this.s.mail.messages) if (ids.includes(m.id)) Object.assign(m, patch);
  }

  /** The action buttons (spec §15): accept or decline a mandate, report a tip to the SOB. */
  mailAction(id: number, action: 'accept' | 'decline' | 'report'): string | undefined {
    if (this.s.bankruptcy) return 'The firm is bankrupt.';
    const mail = this.s.mail.messages.find((m) => m.id === id);
    if (!mail || mail.answer) return 'You have already answered this message.';
    if (mail.kind === 'offer' && action !== 'report') {
      if (action === 'accept') {
        const error = accept(this, mail.client!);
        if (error) return error;
        mail.answer = 'accepted';
      } else {
        decline(this, mail.client!);
        mail.answer = 'declined';
      }
      this.send({ kind: 'reply', client: mail.client, variant: action === 'accept' ? 1 : 0 });
      return undefined;
    }
    if (mail.kind === 'tip' && action === 'report') {
      const tip = this.s.mail.tips.find((t) => t.id === mail.tip);
      if (tip) tip.reported = true;
      mail.answer = 'reported';
      // Reporting tips gives a small reputation boost (spec §15.4).
      this.s.clients.reputation = Math.min(100, this.s.clients.reputation + 1);
      this.send({ kind: 'reply', tip: mail.tip, company: mail.company, variant: 2 });
      return undefined;
    }
    return 'This message has no such action.';
  }

  /** News alerts for held tickers (spec §15.3). */
  setAlerts(on: boolean): void {
    this.s.mail.alerts = on;
  }

  /** The news archive (spec §14.1), newest first. */
  news(q: NewsQuery = {}): NewsItem[] {
    const news = this.s.events.news;
    if (q.ids) return q.ids.flatMap((id) => (news[id] ? [structuredClone(news[id])] : []));
    const out: NewsItem[] = [];
    const limit = q.limit ?? 50;
    for (let k = news.length - 1; k >= 0 && out.length < limit; k--) {
      const n = news[k];
      if (q.to !== undefined && n.time >= q.to) continue;
      if (q.from !== undefined && n.time < q.from) break;
      if (q.company !== undefined && n.company !== q.company && n.other !== q.company) continue;
      if (q.firm !== undefined && n.firm !== q.firm) continue;
      if (q.kinds && !q.kinds.includes(n.kind)) continue;
      if (q.industry !== undefined && (n.company < 0 || this.model.sector[n.company] !== q.industry)) continue;
      if (q.minCap !== undefined && (n.company < 0 || this.companies[n.company].marketCap < q.minCap)) continue;
      out.push(structuredClone(n));
    }
    return out;
  }

  /** Rumours so far (spec §11.7), newest first. */
  rumours(company?: number, limit = 50): Rumour[] {
    const all = this.s.events.rumours;
    const out: Rumour[] = [];
    for (let k = all.length - 1; k >= 0 && out.length < limit; k--) if (company === undefined || all[k].company === company) out.push({ ...all[k] });
    return out;
  }

  journalists(): Journalist[] {
    return structuredClone(this.s.journalists);
  }

  /** The firm's clients, mandates and fees (spec §15.1). */
  clients(): ClientsView {
    const c = this.s.clients;
    const unit = unitPrice(this);
    const held = clientUnits(c);
    return {
      aum: this.nav(),
      unit,
      clientAssets: held * unit,
      firmCapital: (c.units - held) * unit,
      reputation: c.reputation,
      feesEarned: c.feesEarned,
      fees: this.fees,
      clients: structuredClone(c.clients),
      macro: { ...this.s.macro },
    };
  }

  /**
   * What the next weeks hold (spec §12.8): earnings for `companies`, releases and Federal Reservoir meetings, OPEK
   * meetings, the last trading days of the futures held and loan payments.
   */
  calendar(from: number, to: number, companies: readonly number[]): CalendarEntry[] {
    const out: CalendarEntry[] = [];
    const opek = new Set([...opekMeetings(new Date(from * 86_400_000).getUTCFullYear()), ...opekMeetings(new Date(to * 86_400_000).getUTCFullYear())]);
    const expiries = this.s.account.futures.map((p) => parseContract(p.contract)!);
    const loans = this.s.loans.loans.filter((l) => l.status === 'active');
    const rate = loans.length ? this.bankRate() : 0;
    for (const l of loans) {
      // Later payments are shown at today's rate.
      for (const p of schedule(l, rate)) {
        if (p.day >= from && p.day <= to) out.push({ day: p.day, minute: OPEN, kind: 'loan', loan: l.id, amount: p.interest + p.principal });
      }
    }
    for (let day = isTradingDay(from) ? from : nextTradingDay(from); day <= to; day = nextTradingDay(day)) {
      for (const r of releasesOn(day)) out.push({ day, minute: r.minute, kind: r.kind });
      if (opek.has(day)) out.push({ day, minute: OPEK_MINUTE, kind: 'opek' });
      for (const c of expiries) if (c.expiry === day) out.push({ day, minute: CLOSE, kind: 'expiry', contract: c.key });
      const { index } = seasonOf(day);
      if (index < 0) continue;
      for (const c of companies) {
        if (this.model.slot[c] === index && !this.market.state.status[c]) {
          out.push({ day, minute: OPEN - 60, kind: 'earnings', company: c, dividend: this.s.fundamentals.dividend[c] / 4 });
        }
      }
    }
    return out.sort((a, b) => a.day - b.day || a.minute - b.minute);
  }

  // ---------- Orders (spec §12.2) ----------

  openOrders(): Order[] {
    return this.s.account.orders.filter((o) => o.status === 'open');
  }

  /** Accepts an order, filling it at once if the market is trading; otherwise it queues for the open. */
  placeOrder(request: OrderRequest): { order: Order } | { error: string } {
    const error = this.check(request);
    if (error) return { error };
    const account = this.s.account;
    if (request.replaces !== undefined) this.cancelOrder(request.replaces);
    const order: Order = {
      ...request,
      id: account.nextOrder++,
      placed: this.s.clock,
      status: 'open',
      filled: 0,
      price: 0,
      commission: 0,
      updated: this.s.clock,
    };
    // A trailing stop starts its trail behind the price now.
    if (order.type === 'trailingStop') order.stop = this.market.price[order.company] * (1 + direction(order.side) * order.trail!);
    for (const key of Object.keys(order) as (keyof Order)[]) if (order[key] === undefined) delete order[key];
    account.orders.push(order);
    if (this.trading) this.execute(order);
    return { order: structuredClone(order) };
  }

  cancelOrder(id: number): boolean {
    const order = this.s.account.orders.find((o) => o.id === id && o.status === 'open');
    if (order) this.finish(order, 'cancelled');
    return !!order;
  }

  /** What an order would cost now: price with spread and impact, commission, buying power and margin (spec §12.2). */
  estimate(r: OrderRequest): Estimate {
    const { market } = this;
    const i = r.company;
    const mid = market.price[i];
    const half = market.halfSpread[i];
    const sign = direction(r.side);
    const impact = market.impact(i, r.shares);
    const atMarket = mid * (1 + sign * (half + impact));
    let price = atMarket;
    if (r.type === 'limit') price = sign > 0 ? Math.min(r.limit!, atMarket) : Math.max(r.limit!, atMarket);
    else if (r.type === 'stopLimit') price = r.limit!;
    else if (r.type === 'stop') price = r.stop! * (1 + sign * (half + impact));
    else if (r.type === 'trailingStop') price = mid * (1 + sign * (r.trail ?? 0)) * (1 + sign * (half + impact));
    const value = r.shares * price;
    const commission = this.commission(value, true);
    const power = this.buyingPower(r.replaces);
    const after = this.held(i) + sign * r.shares;
    const exposure = Math.abs(after) * mid;
    return {
      bid: mid * (1 - half),
      ask: mid * (1 + half),
      price,
      value,
      commission,
      total: sign > 0 ? value + commission : value - commission,
      impact,
      volumeShare: r.shares / market.adv[i],
      buyingPower: power,
      buyingPowerAfter: power - (opens(r.side) ? this.reserve(r) : 0),
      warnings: opens(r.side) ? mandateWarnings(this, i, after) : [],
      margin: { initial: exposure / this.s.settings.maxLeverage, maintenance: exposure * (after >= 0 ? MAINTENANCE_LONG : MAINTENANCE_SHORT) },
      borrow: r.side === 'short' ? this.borrow(i) : undefined,
    };
  }

  private check(r: OrderRequest): string | undefined {
    if (this.s.bankruptcy) return 'The firm is bankrupt.';
    if (!Number.isInteger(r.company) || r.company < 0 || r.company >= this.companies.length) return 'Unknown symbol.';
    if (this.market.state.status[r.company]) return 'This company is no longer listed.';
    if (!Number.isInteger(r.shares) || r.shares < 1) return 'Enter a whole number of shares.';
    if (r.shares > this.model.shares[r.company]) return 'That is more shares than the company has issued.';
    const positive = (v?: number) => Number.isFinite(v) && v! > 0;
    if ((r.type === 'limit' || r.type === 'stopLimit') && !positive(r.limit)) return 'Enter a limit price.';
    if ((r.type === 'stop' || r.type === 'stopLimit') && !positive(r.stop)) return 'Enter a stop price.';
    if (r.type === 'trailingStop' && !(positive(r.trail) && r.trail! <= 0.5)) return 'Enter a trail between 0% and 50%.';
    if (r.replaces !== undefined && !this.openOrders().some((o) => o.id === r.replaces)) {
      return 'The order you are changing has already been filled or cancelled.';
    }
    const held = this.held(r.company);
    const pending = (side: Side) =>
      this.openOrders().reduce((n, o) => (o.side === side && o.company === r.company && o.id !== r.replaces ? n + o.shares - o.filled : n), 0);
    const ticker = this.companies[r.company].ticker;
    switch (r.side) {
      case 'sell': {
        const available = Math.max(0, held) - pending('sell');
        if (r.shares > available) return available > 0 ? `You can sell at most ${count(available)} shares.` : 'You have no shares to sell.';
        return undefined;
      }
      case 'cover': {
        const available = Math.max(0, -held) - pending('cover');
        if (r.shares > available) return available > 0 ? `You can cover at most ${count(available)} shares.` : `You have no short position in ${ticker} to cover.`;
        return undefined;
      }
      case 'buy':
        if (held < 0) return `You are short ${count(-held)} ${ticker}: use Buy to Cover to close the short first.`;
        break;
      case 'short': {
        if (!this.s.settings.shortSelling) return 'Short selling is switched off in this game.';
        if (held > 0) return `You own ${count(held)} ${ticker}: sell them before selling short.`;
        // The locate (spec §12.4): the broker must find shares to borrow.
        const available = this.borrow(r.company, pending('short')).available;
        if (r.shares > available) {
          return available > 0 ? `Your broker can locate only ${count(available)} shares of ${ticker} to borrow.` : `Your broker cannot locate any shares of ${ticker} to borrow.`;
        }
        break;
      }
      default:
        return 'Unknown action.';
    }
    if (this.s.account.call) return 'Your account has a margin call: until it is met, only orders that reduce positions are accepted.';
    if (this.estimate(r).buyingPowerAfter < 0) return 'Insufficient buying power.';
    return undefined;
  }

  /**
   * Fills what can be filled right now: a market order, or the marketable part of a limit order. A stop order waits until
   * the market reaches its stop, then works as a market order (a limit order, for stop-limits).
   */
  private execute(order: Order): void {
    const { market } = this;
    const i = order.company;
    if (isStop(order.type) && !order.triggered) {
      if (!this.stopReached(order)) return;
      order.triggered = true;
    }
    const sign = direction(order.side);
    const mid = market.price[i];
    const half = market.halfSpread[i];
    let shares = order.shares - order.filled;
    if (!opens(order.side)) shares = Math.min(shares, this.closable(order));
    const limit = order.type === 'limit' || order.type === 'stopLimit' ? order.limit! : undefined;
    if (limit !== undefined) {
      // The impact a limit leaves room for caps the size: impact(q) = k·√(q / ADV) and k = impact at one ADV.
      const room = sign * (limit / mid - 1) - half;
      if (room < 0) return;
      const k = market.impact(i, market.adv[i]);
      if (k > 0) shares = Math.min(shares, Math.floor(market.adv[i] * (room / k) ** 2));
    }
    let borrowable = Infinity;
    if (opens(order.side)) shares = Math.min(shares, this.affordable(order, half + market.impact(i, shares)));
    if (order.side === 'short') shares = Math.min(shares, (borrowable = this.borrow(i, this.pendingShort(i, order.id)).available));
    if (shares >= 1) {
      const impact = market.impact(i, shares);
      this.fill(order, shares, mid * (1 + sign * (half + impact)));
      // Half of the impact stays in the price after the fill (the I term of spec §11.2).
      market.push(i, (sign * impact) / 2);
    }
    if (limit === undefined && order.status === 'open') {
      const note = !opens(order.side)
        ? 'Not enough shares for the whole order.'
        : borrowable <= order.shares - order.filled
          ? 'No more shares could be borrowed.'
          : 'Not enough buying power for the whole order.';
      this.finish(order, order.filled ? 'cancelled' : 'rejected', note);
    }
  }

  /** Whether a stop order's stop has been reached; a trailing stop first follows the market. */
  private stopReached(order: Order): boolean {
    const price = this.market.price[order.company];
    const up = direction(order.side) > 0;
    if (order.type === 'trailingStop') {
      order.stop = up ? Math.min(order.stop!, price * (1 + order.trail!)) : Math.max(order.stop!, price * (1 - order.trail!));
    }
    return up ? price >= order.stop! : price <= order.stop!;
  }

  /**
   * Each bar: stop orders watch their stops, and resting limit orders fill at their limit once the market reaches it, up
   * to a share of each bar's volume.
   */
  private workOrders(): void {
    const { market } = this;
    for (const order of this.openOrders()) {
      if (isStop(order.type) && !order.triggered) {
        this.execute(order);
        continue;
      }
      if (order.type !== 'limit' && order.type !== 'stopLimit') continue;
      const i = order.company;
      const sign = direction(order.side);
      const limit = order.limit!;
      const quote = market.price[i] * (1 + sign * market.halfSpread[i]);
      if (sign > 0 ? quote > limit : quote < limit) continue;
      let shares = Math.min(order.shares - order.filled, Math.floor(PARTICIPATION * market.barVolume[i]));
      if (opens(order.side)) shares = Math.min(shares, this.affordable(order, Math.max(0, sign * (limit / market.price[i] - 1))));
      else shares = Math.min(shares, this.closable(order));
      if (order.side === 'short') shares = Math.min(shares, this.borrow(i, this.pendingShort(i, order.id)).available);
      if (shares >= 1) this.fill(order, shares, limit);
    }
  }

  /** Shares an order to close a position can still close: a sale up to the long, a cover up to the short. */
  private closable(order: Order): number {
    const held = this.held(order.company);
    return Math.max(0, order.side === 'sell' ? held : -held);
  }

  /**
   * Buying power a share of an opening order uses: its value at `basis`, plus leverage times what the spread, impact and
   * commission take from equity (`cost`, a fraction of the price).
   */
  private perShare(basis: number, cost: number): number {
    return basis * (1 + this.s.settings.maxLeverage * (cost + this.s.settings.commission.rate * (1 + cost)));
  }

  /** Whole shares of an opening order the buying power pays for, each losing `cost` of its price to the fill. */
  private affordable(order: Order, cost: number): number {
    const power = this.buyingPower(order.id) - (order.filled ? 0 : this.s.settings.maxLeverage * this.s.settings.commission.fixed);
    return Math.max(0, Math.floor((power * (1 - 1e-12)) / this.perShare(this.market.price[order.company], cost)));
  }

  private fill(order: Order, shares: number, price: number): void {
    const commission = this.commission(shares * price, !order.filled);
    bookFill(this.s.account, order, shares, price, commission, this.s.clock);
    noteTrade(this, order.company, order.side, shares, price);
    this.events.push({ kind: 'fill', order: order.id, company: order.company, side: order.side, shares, price });
  }

  private finish(order: Order, status: OrderStatus, note?: string): void {
    order.status = status;
    order.updated = this.s.clock;
    if (note) order.note = note;
  }

  private commission(value: number, first: boolean): number {
    const { fixed, rate } = this.s.settings.commission;
    return (first ? fixed : 0) + rate * value;
  }

  /** Shares of a company the firm holds; negative when it is short. */
  held(company: number): number {
    return this.s.account.positions.find((p) => p.company === company)?.shares ?? 0;
  }

  /** An order the broker places itself, at market, whatever the account's buying power (spec §12.4). */
  private force(company: number, side: Side, shares: number, reason: Order['forced']): Order {
    const account = this.s.account;
    const order: Order = {
      company, side, type: 'market', shares, tif: 'day', id: account.nextOrder++, placed: this.s.clock, status: 'open', filled: 0,
      price: 0, commission: 0, updated: this.s.clock, forced: reason,
    };
    account.orders.push(order);
    this.execute(order);
    return order;
  }

  // ---------- Margin (spec §12.4) ----------

  /** Equity (cash, longs, shorts and futures P&L since the last settlement), what the positions require, and the excess. */
  private marginFigures() {
    const { price } = this.market;
    const account = this.s.account;
    let long = 0;
    let short = 0;
    for (const p of account.positions) {
      const value = p.shares * price[p.company];
      if (value >= 0) long += value;
      else short -= value;
    }
    let open = 0;
    let futures = 0;
    if (account.futures.length) {
      const pc = this.prices();
      for (const f of account.futures) {
        const c = parseContract(f.contract)!;
        const spec = CONTRACTS[c.k];
        const now = this.commodities.futures(c.k, c.expiry, pc);
        open += (now - f.mark) * f.contracts * spec.multiplier;
        futures += Math.abs(f.contracts) * now * spec.multiplier * spec.margin;
      }
    }
    const equity = account.cash + long - short + open;
    const { initial, maintenance } = requirements(long, short, futures, this.s.settings.maxLeverage);
    return { equity, long, short, open, futures, initial, maintenance, excess: equity - initial };
  }

  /**
   * The buying power an order uses when it fills, held back while it waits: Buy and Sell Short orders (closing orders free
   * it instead). A buy limit fills at its limit or better; a stop at its stop or worse; a short limit at its limit or better.
   */
  private reserve(o: OrderRequest & { filled?: number }): number {
    const { market } = this;
    const i = o.company;
    const shares = o.shares - (o.filled ?? 0);
    const mid = market.price[i];
    let basis = mid;
    let cost = market.halfSpread[i] + market.impact(i, shares);
    if (o.side === 'short') basis = Math.max(mid, o.limit ?? 0);
    else if (o.type === 'limit' || o.type === 'stopLimit') {
      basis = Math.min(mid, o.limit!);
      cost = Math.max(0, o.limit! / mid - 1);
    } else if (o.type === 'stop' || o.type === 'trailingStop') basis = Math.max(mid, o.stop ?? mid * (1 + (o.trail ?? 0)));
    return shares * this.perShare(basis, cost) + (o.filled ? 0 : this.s.settings.maxLeverage * this.s.settings.commission.fixed);
  }

  /** Stock buying power (spec §12.4): the excess over initial margin at max leverage, less what open orders hold back. */
  private buyingPower(except?: number): number {
    const m = this.marginFigures();
    let reserved = 0;
    for (const o of this.openOrders()) if (opens(o.side) && o.id !== except) reserved += this.reserve(o);
    return buyingPower(m.equity, m.initial, this.s.settings.maxLeverage) - reserved;
  }

  /**
   * At each close (spec §12.4): equity below the maintenance requirement brings a margin call, due after the difficulty's
   * grace (at once, if equity has gone negative); a call is met when equity is back above it.
   */
  private checkMargin(day: number): void {
    const account = this.s.account;
    const m = this.marginFigures();
    const exposed = account.positions.length > 0 || account.futures.length > 0;
    const deficit = m.maintenance - m.equity;
    if (deficit > 1e-6 && (exposed || !this.s.settings.noBankruptcy)) {
      if (account.call) account.call.amount = deficit;
      else {
        const due = m.equity <= 0 ? nextTradingDay(day) : addTradingDays(day, this.s.settings.marginGrace);
        account.call = { issued: this.s.clock, due, amount: deficit };
        this.send({ kind: 'marginCall', amount: deficit, day: due });
      }
    } else if (account.call) {
      account.call = undefined;
      this.send({ kind: 'marginMet' });
    }
  }

  /** A margin call due at this open and still unmet: forced liquidation, worst positions first (spec §12.4). */
  private marginDue(day: number): void {
    const account = this.s.account;
    if (!account.call || day < account.call.due) return;
    const before = this.marginFigures();
    if (before.equity >= before.maintenance && before.equity >= 0) {
      account.call = undefined;
      this.send({ kind: 'marginMet' });
      return;
    }
    const lines = this.liquidate('margin', 'margin');
    account.call = undefined;
    this.send({ kind: 'liquidation', reason: 'margin', lines, amount: before.maintenance - before.equity });
    const after = this.marginFigures();
    if (after.equity < 0) this.goBankrupt('margin', before.maintenance - before.equity, -after.equity);
  }

  /**
   * Forced liquidation (spec §12.4, §16A): the broker cancels the firm's open orders, then closes positions worst first —
   * those losing most — each only as far as needed, until `goal` is met; goods in the lobby go last.
   */
  private liquidate(goal: Goal, reason: 'margin' | 'loan'): MailLine[] {
    for (const o of this.openOrders()) this.finish(o, 'cancelled', 'Cancelled by the broker for a forced liquidation.');
    const leverage = this.s.settings.maxLeverage;
    const shortfall = () => {
      if (goal === 'all') return Infinity;
      const m = this.marginFigures();
      return goal === 'margin' ? m.maintenance - m.equity : goal.cash - m.excess;
    };
    const { price } = this.market;
    const pc = this.prices();
    const worst = [
      ...this.s.account.positions.map((p) => ({ stock: p.company, pnl: p.shares * price[p.company] - p.cost })),
      ...this.s.account.futures.map((f) => {
        const c = parseContract(f.contract)!;
        return { contract: f.contract, pnl: (this.commodities.futures(c.k, c.expiry, pc) - f.entry) * f.contracts * CONTRACTS[c.k].multiplier };
      }),
    ].sort((a, b) => a.pnl - b.pnl);
    const lines: MailLine[] = [];
    for (const item of worst) {
      const need = shortfall();
      if (need <= 0) break;
      if ('stock' in item && item.stock !== undefined) {
        const i = item.stock;
        const held = this.held(i);
        if (!held) continue;
        // Each dollar sold frees its maintenance (or initial) requirement, less what the sale costs.
        const frees = goal === 'margin' ? (held > 0 ? MAINTENANCE_LONG : MAINTENANCE_SHORT) : 1 / leverage;
        const shares = Math.min(Math.abs(held), Math.ceil((need * 1.2) / Math.max(0.05, frees - 0.02) / price[i]));
        const order = this.force(i, held > 0 ? 'sell' : 'cover', shares, reason);
        if (order.filled) lines.push({ company: i, shares: order.filled, amount: order.filled * order.price, side: order.side, order: order.id });
      } else if ('contract' in item && item.contract) {
        const f = this.s.account.futures.find((x) => x.contract === item.contract);
        if (!f) continue;
        const c = parseContract(f.contract)!;
        const spec = CONTRACTS[c.k];
        const each = this.commodities.futures(c.k, c.expiry, pc) * spec.multiplier;
        const frees = spec.margin * (goal === 'margin' ? MAINTENANCE : 1);
        const n = Math.min(Math.abs(f.contracts), Math.ceil((need * 1.2) / Math.max(1e-3, frees - 0.001) / each));
        const traded = this.tradeFuture(f.contract, -Math.sign(f.contracts) * n, true);
        if ('price' in traded) lines.push({ company: -1, contract: f.contract, shares: n, amount: n * traded.price * spec.multiplier, side: f.contracts > 0 ? 'sell' : 'buy' });
      }
    }
    for (const g of [...this.s.account.goods]) {
      if (shortfall() <= 0) break;
      const amount = sellGoods(this.s.account, g.code, this.commodities.spot(CONTRACT_INDEX[g.code], pc), this.s.clock);
      if (amount !== undefined) lines.push({ company: -1, contract: g.code, shares: g.quantity, amount });
    }
    return lines;
  }

  // ---------- Short selling (spec §12.4) ----------

  /** What the stock loan desk says about borrowing a company's shares: what it can locate, and at what fee. */
  borrow(company: number, pending = this.pendingShort(company)): Borrow {
    const i = company;
    const floatShares = this.s.world.floatPct[i] * this.model.shares[i];
    const cap = this.market.price[i] * this.model.shares[i];
    return borrowOf(cap, floatShares, this.market.state.shortInterest[i], Math.max(0, -this.held(i)), pending);
  }

  /** Shares open Sell Short orders in a company would still borrow, other than order `except`'s. */
  private pendingShort(company: number, except?: number): number {
    return this.openOrders().reduce((n, o) => (o.side === 'short' && o.company === company && o.id !== except ? n + o.shares - o.filled : n), 0);
  }

  squeeze(company: number, move: number): number {
    const shortInterest = this.market.state.shortInterest;
    if (move < 0) {
      shortInterest[company] = pileIn(shortInterest[company], move);
      return move;
    }
    const factor = squeeze(this.borrow(company).shortInterest);
    // The shorts who covered into the squeeze are gone.
    if (factor > 1) shortInterest[company] *= 0.7;
    return move * factor;
  }

  /** Each close: the day's borrow fees on every short (spec §12.4), for the calendar days until the next session. */
  private chargeBorrow(nights: number): void {
    const account = this.s.account;
    let total = 0;
    let shorts = 0;
    for (const p of account.positions) {
      if (p.shares >= 0) continue;
      const fee = (this.borrow(p.company).fee * -p.shares * this.market.price[p.company] * nights) / 360;
      p.fees = (p.fees ?? 0) + fee;
      p.realized -= fee;
      total += fee;
      shorts++;
    }
    if (total) book(account, this.s.clock, 'borrowFee', -total, { note: `${shorts} short position${shorts > 1 ? 's' : ''}` });
  }

  /** The broker's rate on a debit balance: the policy rate plus its spread. */
  private marginRate(): number {
    return this.s.macro.rate + MARGIN_SPREAD * this.s.settings.loanRates;
  }

  /** Each close: interest on money borrowed from the broker (a negative cash balance). */
  private chargeInterest(nights: number): void {
    const account = this.s.account;
    if (account.cash >= 0) return;
    const interest = (-account.cash * this.marginRate() * nights) / 360;
    account.charges += interest;
    book(account, this.s.clock, 'interest', -interest, { note: 'Margin interest' });
  }

  /** Each close: lenders may recall shares the firm has borrowed, likelier when borrow is tight (spec §12.4). */
  private recalls(day: number): void {
    for (const p of this.s.account.positions) {
      if (p.shares >= 0 || p.recall !== undefined) continue;
      const cap = this.market.price[p.company] * this.model.shares[p.company];
      if (!this.rng.broker.chance(recallChance(this.borrow(p.company), cap))) continue;
      p.recall = addTradingDays(day, RECALL_DAYS);
      enqueue(this.s.events, at(p.recall, OPEN), { do: 'buyIn', company: p.company });
      this.send({ kind: 'recall', company: p.company, amount: -p.shares, day: p.recall });
    }
  }

  /** A recall falls due: whatever is still short is bought in at the open. */
  private buyIn(company: number): void {
    const p = this.s.account.positions.find((x) => x.company === company);
    if (!p || p.shares >= 0 || p.recall === undefined || !this.trading || this.s.bankruptcy) return;
    for (const o of this.openOrders()) if (o.company === company && o.side === 'cover') this.finish(o, 'cancelled', 'Replaced by the broker’s buy-in.');
    const order = this.force(company, 'cover', -p.shares, 'buyIn');
    this.send({ kind: 'buyIn', company, lines: [{ company, shares: order.filled, amount: order.filled * order.price, side: 'cover', order: order.id }] });
  }

  // ---------- Futures and commodities (spec §12.3) ----------

  /** What futures prices need: today, the economy and the MAJOR 500. */
  prices(): PriceContext {
    return { day: dayOf(this.s.clock), rate: this.s.macro.rate, inflation: this.s.macro.inflation, index: this.market.indexLevel };
  }

  /** A contract's fair price now. */
  futuresPrice(key: string, pc = this.prices()): number {
    const c = parseContract(key)!;
    return this.commodities.futures(c.k, c.expiry, pc);
  }

  private futuresSpread(c: Contract): number {
    const position = chain(c.k, dayOf(this.s.clock)).findIndex((x) => x.key === c.key);
    return FUTURES_SPREAD * (1 + 0.5 * Math.max(0, position)) * this.s.settings.spread;
  }

  /**
   * Buys (positive) or sells (negative) futures contracts at market, filled at once while the market is open. Opening a
   * position needs its initial margin free; a forced trade (liquidation) skips the checks.
   */
  tradeFuture(key: string, contracts: number, forced = false): { price: number } | { error: string } {
    if (this.s.bankruptcy) return { error: 'The firm is bankrupt.' };
    if (!this.s.settings.futures) return { error: 'Futures trading is switched off in this game.' };
    const c = parseContract(key);
    if (!c || !listed(c, dayOf(this.s.clock))) return { error: 'That contract is not listed.' };
    if (!Number.isInteger(contracts) || contracts === 0) return { error: 'Enter a whole number of contracts.' };
    if (!this.trading) return { error: 'The pit is closed: futures trade from 09:30 to 16:00.' };
    const spec = CONTRACTS[c.k];
    const fair = this.futuresPrice(key);
    if (!forced) {
      const held = this.s.account.futures.find((p) => p.contract === key)?.contracts ?? 0;
      const opening = Math.sign(held) === -Math.sign(contracts) ? Math.max(0, Math.abs(contracts) - Math.abs(held)) : Math.abs(contracts);
      if (opening) {
        if (this.s.account.call) return { error: 'Your account has a margin call: until it is met, only trades that reduce positions are accepted.' };
        const each = fair * spec.multiplier * spec.margin;
        if (opening * each > this.buyingPower() / this.s.settings.maxLeverage) {
          return { error: `Not enough margin: each contract needs ${dollars(each)} of initial margin.` };
        }
      }
    }
    const price = fair * (1 + Math.sign(contracts) * this.futuresSpread(c));
    const commission = this.commission(Math.abs(contracts) * price * spec.multiplier, true);
    bookFutures(this.s.account, key, contracts, price, commission, this.s.clock);
    this.events.push({ kind: 'futures', contract: key, contracts, price });
    return { price };
  }

  /** The Roll button (spec §12.3): closes a position and opens the same in the next contract month. */
  rollFuture(key: string): { price: number } | { error: string } {
    const p = this.s.account.futures.find((x) => x.contract === key);
    if (!p) return { error: 'You hold no such contract.' };
    const c = parseContract(key)!;
    const next = chain(c.k, dayOf(this.s.clock)).find((x) => x.month > c.month);
    if (!next) return { error: 'There is no later contract to roll into.' };
    const n = p.contracts;
    const closed = this.tradeFuture(key, -n);
    return 'error' in closed ? closed : this.tradeFuture(next.key, n);
  }

  /** Sells goods from the lobby to a local merchant, at a discount to spot (spec §12.3). */
  sellGoods(code: string): { amount: number } | { error: string } {
    if (this.s.bankruptcy) return { error: 'The firm is bankrupt.' };
    const k = CONTRACT_INDEX[code];
    if (k === undefined) return { error: 'There is nothing like that in the lobby.' };
    const amount = sellGoods(this.s.account, code, this.commodities.spot(k, this.prices()), this.s.clock);
    return amount === undefined ? { error: 'There is nothing like that in the lobby.' } : { amount };
  }

  /** Letters about contracts held to expiry: goods delivered, a failure to deliver, a cash settlement. */
  private expired(e: Expiry): void {
    const kind = e.outcome === 'delivered' ? 'delivery' : e.outcome === 'fined' ? 'ftd' : 'cashSettled';
    this.send({ kind, contract: e.contract, contracts: e.contracts, amount: e.amount, quantity: e.quantity });
  }

  /** Each morning: the futures held that expire within a few trading days get a warning (spec §15.2). */
  private expiryWarnings(day: number): void {
    for (const p of this.s.account.futures) {
      const c = parseContract(p.contract)!;
      if (p.warned || addTradingDays(day, EXPIRY_WARNING_DAYS) < c.expiry) continue;
      p.warned = true;
      const delivery = CONTRACTS[c.k].delivery;
      this.send({ kind: 'expiry', contract: p.contract, contracts: p.contracts, day: c.expiry, quantity: delivery ? Math.abs(p.contracts) * delivery.quantity : undefined });
    }
  }

  /** Each morning: the National Weather Bureau's warnings and OPEK delegates' hints (spec §14), and the news of them. */
  private outlooks(day: number): void {
    const rng = this.rng.commodities;
    const issued = this.commodities.planWeather(rng, day, this.s.clock);
    const opek = this.commodities.planOpek(rng, day, this.s.clock);
    if (opek) issued.push(opek);
    for (const o of issued) {
      enqueue(this.s.events, o.due, { do: 'outlook', id: o.id });
      const [k, move] = o.moves[0];
      // `level` is the day the weather is due, or the meeting.
      this.report({ kind: o.source === 'weather' ? 'weather' : 'opekHint', company: -1, commodity: CONTRACTS[k].code, move: Math.expm1(move), text: o.kind, level: dayOf(o.due) });
    }
  }

  /** The weather hits or not; OPEK announces. */
  private outlookDue(id: number): void {
    const o = this.commodities.resolve(this.rng.commodities, id);
    if (!o) return;
    const main = o.moves[0][0];
    const moved = Math.expm1(o.actual.find(([k]) => k === main)?.[1] ?? 0);
    const code = CONTRACTS[main].code;
    // `prev` is the day the warning or the hint came out.
    const warned = dayOf(o.issued);
    if (o.source === 'opek') this.report({ kind: 'opek', company: -1, commodity: code, move: moved, expect: Math.expm1(o.moves[0][1]), text: o.result, prev: warned });
    else if (o.result === 'hit') this.report({ kind: 'weatherHit', company: -1, commodity: code, move: moved, text: o.kind, prev: warned });
    else this.report({ kind: 'weatherBust', company: -1, commodity: code, move: Math.expm1(-o.moves[0][1] * o.priced), text: o.kind, prev: warned });
  }

  // ---------- Loans and credit (spec §16A) ----------

  /** The credit score and its parts (spec §16A, Equifacts). */
  private credit() {
    const stats = this.s.stats;
    const worth = this.netWorth();
    const past = stats.length > 126 ? stats[stats.length - 127][1] : this.s.account.ledger[0]?.amount ?? worth;
    const debt = bankDebt(this.s.loans) + Math.max(0, -this.s.account.cash);
    return creditScore(this.s.loans.history, debt, worth, past > 0 ? worth / past - 1 : 0);
  }

  /** The bank's rate on all its loans to the firm, with `extra` more debt. */
  private bankRate(extra = 0): number {
    return bankRate(bankDebt(this.s.loans) + extra, this.credit().score, this.s.macro.rate, this.s.settings.loanRates);
  }

  /** Whether the bank can debit `amount`: the account keeps its initial margin afterwards. */
  private payable(amount: number): boolean {
    return amount <= Math.max(0, this.marginFigures().excess) + 1e-9;
  }

  /** Each close: bank loans' interest up to the next session, at the day's floating rate (spec §16A). */
  private accrueLoans(to: number): void {
    const loans = this.s.loans.loans.filter((l) => l.status === 'active');
    if (!loans.length) return;
    const rate = this.bankRate();
    for (const loan of loans) this.s.account.charges += accrue(loan, to, rate);
  }

  /** Each open: payments due on the first trading day of the month, and missed payments made good or defaulted. */
  private loansDue(day: number): void {
    const state = this.s.loans;
    if (!state.loans.some((l) => l.status === 'active')) return;
    const rate = this.bankRate();
    const payday = isPaymentDay(day);
    for (const loan of state.loans) {
      if (loan.status !== 'active' || this.s.bankruptcy) continue;
      this.s.account.charges += accrue(loan, day, rate);
      if (loan.late) {
        if (this.payable(lateAmount(loan))) this.payLate(loan, day);
        else if (day > loan.late.deadline) this.defaultLoan(loan, day);
      } else if (payday && paymentDay(loan, loan.paid + 1) === day) this.payLoan(loan, rate, day);
    }
  }

  /** A payment falls due: the interest accrued since the last one, and principal. */
  private payLoan(loan: Loan, rate: number, day: number): void {
    const state = this.s.loans;
    const account = this.s.account;
    const { interest, principal } = nextPayment(loan, rate)!;
    if (!this.payable(interest + principal)) {
      // Missed (spec §16A): a late fee and a mark on the credit report, and five trading days to pay; a second miss defaults.
      // Its interest was charged as it accrued; now it is owed with the payment.
      loan.missed++;
      const fee = LATE_FEE * (interest + principal);
      account.charges += fee;
      loan.interest = 0;
      loan.late = { interest, fee, principal, deadline: addTradingDays(day, GRACE_DAYS) };
      state.history += HISTORY.late;
      state.record.push({ day, kind: 'late', loan: loan.id, amount: interest + principal });
      if (loan.missed >= 2) return this.defaultLoan(loan, day);
      this.send({ kind: 'loanLate', loan: loan.id, amount: interest + principal + fee, day: loan.late.deadline });
      return;
    }
    book(account, this.s.clock, 'loanInterest', -interest, { note: `Loan ${loan.id}` });
    if (principal) book(account, this.s.clock, 'repayment', -principal, { note: `Loan ${loan.id}` });
    loan.interest = 0;
    loan.balance -= principal;
    loan.paid++;
    loan.interestPaid += interest;
    if (state.history < HISTORY.maxOnTime) state.history = Math.min(HISTORY.maxOnTime, state.history + HISTORY.onTime);
    if (loan.paid >= loan.months || loan.balance < 0.005) this.loanRepaid(loan, day);
  }

  /** A missed payment made good within the grace period. Its interest and fee were charged when they arose. */
  private payLate(loan: Loan, day: number): void {
    const late = loan.late!;
    const account = this.s.account;
    book(account, this.s.clock, 'loanInterest', -(late.interest + late.fee), { note: `Loan ${loan.id}, paid late` });
    if (late.principal) book(account, this.s.clock, 'repayment', -late.principal, { note: `Loan ${loan.id}` });
    loan.balance -= late.principal;
    loan.interestPaid += late.interest;
    loan.paid++;
    loan.late = undefined;
    this.s.loans.record.push({ day, kind: 'paidLate', loan: loan.id, amount: late.interest + late.fee + late.principal });
    if (loan.paid >= loan.months || loan.balance < 0.005) this.loanRepaid(loan, day);
  }

  /** The loan is repaid. Interest still accrued on it (a last payment made late) is collected with it. */
  private loanRepaid(loan: Loan, day: number): void {
    if (loan.interest > 0.005) {
      book(this.s.account, this.s.clock, 'loanInterest', -loan.interest, { note: `Loan ${loan.id}, interest to date` });
      loan.interestPaid += loan.interest;
    }
    loan.status = 'repaid';
    loan.balance = 0;
    loan.interest = 0;
    loan.closed = day;
    this.s.loans.history += HISTORY.repaid;
    this.s.loans.record.push({ day, kind: 'repaid', loan: loan.id, amount: loan.principal });
    this.send({ kind: 'loanRepaid', loan: loan.id, amount: loan.principal });
  }

  /** A default (spec §16A): the bank sells what it must to recover the whole loan; a shortfall is bankruptcy. */
  private defaultLoan(loan: Loan, day: number): void {
    const account = this.s.account;
    const owedInterest = loan.interest + (loan.late ? loan.late.interest + loan.late.fee : 0);
    const owed = loan.balance + owedInterest;
    const lines = this.liquidate({ cash: owed }, 'loan');
    const paid = this.s.settings.noBankruptcy ? owed : Math.min(owed, Math.max(0, this.marginFigures().excess));
    const interestPaid = Math.min(paid, owedInterest);
    if (interestPaid) book(account, this.s.clock, 'loanInterest', -interestPaid, { note: `Loan ${loan.id}, recovered` });
    if (paid > interestPaid) book(account, this.s.clock, 'repayment', -(paid - interestPaid), { note: `Loan ${loan.id}, recovered` });
    // What the bank did not recover of the interest owed stays a loss; the principal it did not recover is still owed.
    loan.balance -= paid - interestPaid;
    loan.interest = 0;
    loan.late = undefined;
    loan.status = 'defaulted';
    loan.closed = day;
    this.s.loans.history += HISTORY.default;
    this.s.loans.record.push({ day, kind: 'default', loan: loan.id, amount: owed });
    this.send({ kind: 'loanDefault', loan: loan.id, amount: owed, lines });
    if (paid < owed - 0.005) this.goBankrupt('loan', owed, owed - paid);
    else loan.balance = 0;
  }

  /** What a new loan would cost today (spec §16A: shown before signing). */
  loanQuote(amount: number, structure: Structure, months: number) {
    const rate = this.bankRate(amount);
    const debt = bankDebt(this.s.loans) + amount;
    const tier = TIERS.find((t) => debt <= t.max) ?? TIERS[TIERS.length - 1];
    return { rate, tier: tier.name, ...quoteLoan(amount, structure, months, rate), firstPayment: paymentDay({ opened: dayOf(this.s.clock) } as Loan, 1) };
  }

  /** Signs a loan with First Continental Bank (spec §16A): the money arrives at once. */
  takeLoan(amount: number, structure: Structure, months: number): { loan: Loan } | { error: string } {
    if (this.s.bankruptcy) return { error: 'The firm is bankrupt.' };
    const debt = bankDebt(this.s.loans);
    if (!Number.isFinite(amount) || amount < MIN_LOAN) return { error: `The bank lends at least ${dollars(MIN_LOAN)}.` };
    if (debt + amount > BANK_LIMIT + 0.005) return { error: `The bank lends at most ${dollars(BANK_LIMIT)} in all: you can borrow up to ${dollars(BANK_LIMIT - debt)} more.` };
    if (!TERMS.includes(months)) return { error: 'Choose a term of one to five years.' };
    if (structure !== 'amortising' && structure !== 'interestOnly') return { error: 'Choose how to repay the loan.' };
    const state = this.s.loans;
    const day = dayOf(this.s.clock);
    const loan: Loan = {
      id: state.nextId++, principal: amount, balance: amount, structure, months, opened: day, paid: 0, interest: 0, accruedTo: day, missed: 0,
      interestPaid: 0, status: 'active',
    };
    state.loans.push(loan);
    book(this.s.account, this.s.clock, 'loan', amount, { note: `Loan ${loan.id}` });
    state.record.push({ day, kind: 'opened', loan: loan.id, amount });
    this.send({ kind: 'loan', loan: loan.id, amount, rate: this.bankRate(), day: paymentDay(loan, 1) });
    return { loan: structuredClone(loan) };
  }

  /**
   * Pays `amount` to the bank on a loan (spec §16A): a missed payment first, then the interest accrued to date, then
   * principal with the 1% early repayment fee. The bank takes only money the positions don't need as margin.
   */
  repayLoan(id: number, amount: number): { loan: Loan; paid: number } | { error: string } {
    if (this.s.bankruptcy) return { error: 'The firm is bankrupt.' };
    const loan = this.s.loans.loans.find((l) => l.id === id && l.status === 'active');
    if (!loan) return { error: 'There is no such loan.' };
    if (!(amount > 0)) return { error: 'Enter an amount to pay.' };
    const day = dayOf(this.s.clock);
    this.s.account.charges += accrue(loan, day, this.bankRate());
    const split = splitRepayment(loan, amount);
    if (loan.late && split.late < lateAmount(loan) - 0.005) return { error: `The missed payment of ${dollars(lateAmount(loan))} has to be paid first.` };
    if (!this.payable(split.total)) {
      return { error: `You can pay the bank ${dollars(Math.max(0, this.marginFigures().excess))} now: the rest of your money is needed as margin for your positions.` };
    }
    const account = this.s.account;
    if (split.late) {
      const interest = loan.interest;
      this.payLate(loan, day);
      // That was its last payment: the loan is repaid, with the interest accrued since.
      if (loan.status !== 'active') return { loan: structuredClone(loan), paid: split.late + interest };
    }
    if (split.interest) {
      book(account, this.s.clock, 'loanInterest', -split.interest, { note: `Loan ${loan.id}, interest to date` });
      loan.interest -= split.interest;
      loan.interestPaid += split.interest;
    }
    if (split.principal) {
      book(account, this.s.clock, 'repayment', -split.principal, { note: `Loan ${loan.id}, early` });
      loan.balance -= split.principal;
    }
    if (split.fee) {
      book(account, this.s.clock, 'loanFee', -split.fee, { note: `Loan ${loan.id}: early repayment fee` });
      account.charges += split.fee;
    }
    if (loan.status === 'active' && loan.balance < 0.005) this.loanRepaid(loan, day);
    return { loan: structuredClone(loan), paid: split.total };
  }

  /**
   * What paying `amount` on a loan would do (the repayment form's preview): how it splits, whether the money is there,
   * and the loan's next payment afterwards, at the rate its smaller debt would pay.
   */
  repayQuote(id: number, amount: number): RepayQuote | undefined {
    const found = this.s.loans.loans.find((l) => l.id === id && l.status === 'active');
    if (!found) return undefined;
    const loan = structuredClone(found);
    const rate = this.bankRate();
    accrue(loan, dayOf(this.s.clock), rate);
    const split = splitRepayment(loan, Math.max(0, amount));
    const repaid = (split.late ? loan.late!.principal : 0) + split.principal;
    const after: Loan = {
      ...loan, balance: loan.balance - repaid, interest: loan.interest - split.interest, late: split.late ? undefined : loan.late,
      paid: loan.paid + (split.late ? 1 : 0),
    };
    const rateAfter = this.bankRate(-repaid);
    return {
      ...split, owed: loan.balance, interestToDate: loan.interest, missed: lateAmount(loan), payoffAmount: payoffAmount(loan),
      available: Math.max(0, this.marginFigures().excess), rate, rateAfter, balanceAfter: after.balance,
      before: loan.late ? undefined : nextPayment(loan, rate), after: after.balance > 0.005 && !after.late ? nextPayment(after, rateAfter) : undefined,
    };
  }

  // ---------- Bankruptcy (spec §16) ----------

  /** An obligation the firm cannot meet after selling everything: the end, unless the game is a sandbox. */
  private goBankrupt(cause: Cause, owed: number, shortfall: number): void {
    if (this.s.settings.noBankruptcy || this.s.bankruptcy) return;
    this.liquidate('all', cause);
    const tickers = this.companies.map((c) => c.ticker);
    this.s.bankruptcy = bankruptcyReport({
      day: dayOf(this.s.clock), cause, owed, shortfall, netWorth: this.netWorth(), player: this.s.player, seed: this.seed,
      stats: this.s.stats, closed: this.s.account.closed, tickers, clients: this.s.clients.clients,
    });
    this.send({ kind: 'bankrupt', reason: cause, amount: shortfall });
    this.events.push({ kind: 'bankrupt' });
  }

  /** The final report (spec §16), once the firm is bankrupt. */
  bankruptcy(): BankruptcyReport | undefined {
    return structuredClone(this.s.bankruptcy);
  }

  // ---------- Views ----------

  /** What the firm is worth (spec §16): equity plus goods at resale value, less bank debt and what it owes on it. */
  netWorth(): number {
    return this.marginFigures().equity + this.goodsValue() - bankDebt(this.s.loans) - accrued(this.s.loans);
  }

  private goodsValue(): number {
    const pc = this.prices();
    return this.s.account.goods.reduce((a, g) => a + goodsValue(g, this.commodities.spot(CONTRACT_INDEX[g.code], pc)), 0);
  }

  quote(i: number): Quote {
    const { price, halfSpread, state } = this.market;
    const last = price[i];
    const prev = state.prevClose[i];
    return {
      last,
      prevClose: prev,
      change: last - prev,
      pct: last / prev - 1,
      bid: last * (1 - halfSpread[i]),
      ask: last * (1 + halfSpread[i]),
      open: state.dayOpen[i],
      high: state.dayHigh[i],
      low: state.dayLow[i],
      volume: state.dayVolume[i],
    };
  }

  indexQuote(): Quote {
    const { index } = this.market.state;
    const last = this.market.indexLevel;
    const change = last - index.prevClose;
    return { last, prevClose: index.prevClose, change, pct: change / index.prevClose, bid: last, ask: last, open: index.open, high: index.high, low: index.low, volume: 0 };
  }

  positions(): PositionView[] {
    const { price, state } = this.market;
    return this.s.account.positions.map((p) => ({
      company: p.company,
      shares: p.shares,
      cost: p.cost,
      last: price[p.company],
      value: p.shares * price[p.company],
      dayChange: p.shares * (price[p.company] - state.prevClose[p.company]),
      unrealized: p.shares * price[p.company] - p.cost,
      realized: p.realized,
      ...(p.shares < 0 ? { borrowFee: this.borrow(p.company).fee, fees: p.fees ?? 0, recall: p.recall } : {}),
    }));
  }

  account(): AccountView {
    const positions = this.positions();
    const { cash, deposits, closed, futures, goods, charges, call } = this.s.account;
    const sum = (f: (p: PositionView) => number) => positions.reduce((a, p) => a + f(p), 0);
    const m = this.marginFigures();
    const goodsValue = this.goodsValue();
    const goodsCost = goods.reduce((a, g) => a + g.cost + g.storage, 0);
    const loans = bankDebt(this.s.loans) + accrued(this.s.loans);
    return {
      cash,
      value: m.long - m.short,
      netWorth: m.equity + goodsValue - loans,
      deposits,
      dayChange: sum((p) => p.dayChange),
      unrealized: sum((p) => p.unrealized) + m.open + goodsValue - goodsCost,
      realized: sum((p) => p.realized) + futures.reduce((a, f) => a + f.realized, 0) + closed.reduce((a, c) => a + c.realized, 0) - charges,
      buyingPower: this.buyingPower(),
      equity: m.equity,
      longValue: m.long,
      shortValue: m.short,
      futuresPnl: m.open,
      futuresMargin: m.futures,
      goodsValue,
      loans,
      initial: m.initial,
      maintenance: m.maintenance,
      excess: m.excess,
      call: call && { ...call },
      bankrupt: !!this.s.bankruptcy,
    };
  }

  /** MajorTrade → Futures & Commodities and the exchange's board (spec §12.3). */
  futures(): FuturesView {
    const pc = this.prices();
    const { settle } = this.s.commodities;
    const chains = CONTRACTS.map((spec, k) =>
      chain(k, pc.day).map((c): ContractQuote => {
        const price = this.commodities.futures(k, c.expiry, pc);
        const half = this.futuresSpread(c);
        return { ...c, price, bid: price * (1 - half), ask: price * (1 + half), settle: settle.prices[c.key], margin: price * spec.multiplier * spec.margin };
      }),
    );
    return {
      enabled: this.s.settings.futures,
      trading: this.trading,
      day: pc.day,
      ...this.commodityQuotes(),
      chains,
      positions: this.s.account.futures.map((f) => {
        const c = parseContract(f.contract)!;
        const spec = CONTRACTS[c.k];
        const price = this.commodities.futures(c.k, c.expiry, pc);
        return {
          contract: f.contract, k: c.k, expiry: c.expiry, contracts: f.contracts, entry: f.entry, mark: f.mark, price,
          open: (price - f.mark) * f.contracts * spec.multiplier, pnl: (price - f.entry) * f.contracts * spec.multiplier,
          realized: f.realized, margin: Math.abs(f.contracts) * price * spec.multiplier * spec.margin,
        };
      }),
      goods: this.s.account.goods.map((g) => {
        const spot = this.commodities.spot(CONTRACT_INDEX[g.code], pc);
        return { ...g, value: goodsValue(g, spot), perDay: STORAGE_RATE * goodsAtSpot(g, spot) };
      }),
      yield10: this.s.commodities.yield10,
      rate: this.s.macro.rate,
    };
  }

  /** Each futures contract's underlying: its price now and at the last close, for the tray and the Futures tab. */
  commodityQuotes(): { spot: number[]; previous: number[] } {
    const pc = this.prices();
    return {
      spot: CONTRACTS.map((_, k) => this.commodities.spot(k, pc)),
      previous: CONTRACTS.map((_, k) => (k === MJ ? this.market.state.index.prevClose : this.commodities.previous(k))),
    };
  }

  /** The weather warnings and OPEK meetings so far (spec §14), newest first: what happened only once it has. */
  outlookViews(limit = 60): OutlookView[] {
    return this.s.commodities.outlooks
      .slice(-limit)
      .reverse()
      .map((o) => ({
        id: o.id, source: o.source, kind: o.kind, issued: o.issued, due: o.due, moves: structuredClone(o.moves), done: !!o.done,
        ...(o.done ? { result: o.result, actual: structuredClone(o.actual) } : {}),
      }));
  }

  /** MajorTrade → Financing, First Continental Bank and Equifacts (spec §12.9, §16A). */
  loans(): LoansView {
    const state = this.s.loans;
    const rate = this.bankRate();
    const credit = this.credit();
    const debt = bankDebt(state);
    return {
      loans: state.loans.map((l) => ({
        ...structuredClone(l),
        next: l.status === 'active' && !l.late ? nextPayment(l, rate) : undefined,
        payoff: l.status === 'active' ? payoffAmount(l) : 0,
      })),
      debt,
      accrued: accrued(state),
      rate,
      tiers: TIERS.map((t) => ({ ...t, rate: bankRate(t.max, credit.score, this.s.macro.rate, this.s.settings.loanRates) })),
      headroom: Math.max(0, BANK_LIMIT - debt),
      score: credit.score,
      factors: { history: credit.history, leverage: credit.leverage, trend: credit.trend },
      record: structuredClone(state.record),
      policy: this.s.macro.rate,
      marginRate: this.marginRate(),
    };
  }

  ledger() {
    return structuredClone(this.s.account.ledger);
  }
  orders(): Order[] {
    return structuredClone(this.s.account.orders);
  }
  closedPositions() {
    return structuredClone(this.s.account.closed);
  }
  stats(): [number, number, number][] {
    return structuredClone(this.s.stats);
  }

  directory(): Directory {
    return {
      tickers: this.companies.map((c) => c.ticker),
      names: this.companies.map((c) => c.name),
      industries: this.companies.map((c) => c.industry.name),
      genomes: this.companies.map((c) => c.genome),
      firms: this.s.world.firms.map(({ id, name, strategy, preset }) => ({ id, name, strategy, preset })),
    };
  }

  details(i: number): CompanyDetails {
    const c = this.companies[i];
    const f = this.s.fundamentals;
    const price = this.market.price[i];
    const shares = this.model.shares[i];
    const eps = f.income[i] / shares;
    const today = dayOf(this.s.clock);
    const year = this.daily(i).slice(-252);
    const borrow = this.borrow(i);
    return {
      id: i,
      genome: c.genome,
      name: c.name,
      ticker: c.ticker,
      industry: c.industry.name,
      subIndustry: c.subIndustry,
      hq: `${c.hq.name}, ${c.hq.country}`,
      ceo: this.s.events.ceos[i] ? ceoName(decodeCeo(this.s.events.ceos[i])) : `${c.ceo.firstName} ${c.ceo.lastName}`,
      ceoCode: this.s.events.ceos[i],
      status: this.market.state.status[i] as Listing,
      founded: gameYear(START_DAY) - c.founded,
      shares,
      marketCap: price * shares,
      revenue: f.revenue[i],
      income: f.income[i],
      eps,
      pe: eps > 0 ? price / eps : null,
      dividendYield: f.dividend[i] / price,
      beta: c.beta,
      volatility: c.volatility,
      high52: Math.max(...year.map((b) => b.high)),
      low52: Math.min(...year.map((b) => b.low)),
      adv: this.market.adv[i],
      nextEarnings: nextReport(f.reported[i] === today ? today + 1 : today, this.model.slot[i]),
      lastEarnings: f.reported[i],
      insiderPct: this.s.world.insiderPct[i],
      floatPct: this.s.world.floatPct[i],
      shortInterest: borrow.shortInterest,
      borrowFee: borrow.fee,
      quarters: this.quarters(i),
      holders: this.holders(i),
    };
  }

  /** The last eight quarters' results, oldest first. */
  private quarters(i: number): QuarterResult[] {
    const f = this.s.fundamentals;
    const shares = this.model.shares[i];
    // Before its first report in the game, a company's latest quarter is the one reported before the start.
    const latest = quarterReported(f.reported[i] >= 0 ? f.reported[i] : START_DAY);
    return Array.from({ length: QUARTERS }, (_, k) => {
      const quarter = latest - (QUARTERS - 1 - k);
      const revenue = f.quarterRevenue[i * QUARTERS + k];
      const income = f.quarterIncome[i * QUARTERS + k];
      return { quarter, reported: reportDay(quarter, this.model.slot[i]), revenue, income, eps: income / shares };
    });
  }

  /** A company's institutional holders, largest first (the holdings table is sorted by company). */
  private holders(i: number): Holder[] {
    const { holdings } = this.s.world;
    let lo = 0;
    let hi = holdings.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (holdings[mid].company < i) lo = mid + 1;
      else hi = mid;
    }
    const out: Holder[] = [];
    for (let k = lo; k < holdings.length && holdings[k].company === i; k++) out.push({ firm: holdings[k].firm, shares: holdings[k].shares });
    return out;
  }

  /** A competitor's holdings at today's prices, and their value week by week since the start. */
  firm(f: number): FirmView {
    const { price } = this.market;
    const held = this.s.world.holdings.filter((h) => h.firm === f);
    const holdings = held
      .map(({ company, shares }) => ({ company, shares, value: shares * price[company], pct: shares / this.model.shares[company] }))
      .sort((a, b) => b.value - a.value);
    const aum = holdings.reduce((a, h) => a + h.value, 0);
    const index = new Map(this.s.history.index.map(([day, , , , close]) => [day, close]));
    const start = held.reduce((a, h) => a + h.shares * this.companies[h.company].price, 0);
    const history: [number, number, number][] = [
      [START_DAY, start, 1000],
      ...weeklyValues(this.s.history, held).map(([day, value]): [number, number, number] => [day, value, index.get(day)!]),
    ];
    // Then now, in place of this week's close if that was today.
    const today = dayOf(this.s.clock);
    if (history.length > 1 && history.at(-1)![0] === today) history.pop();
    history.push([today, aum, this.market.indexLevel]);
    return { firm: f, aum, holdings, history };
  }

  /** Every company's latest numbers, column by column. */
  table(): MarketTable {
    const { market, model } = this;
    const f = this.s.fundamentals;
    const h = this.s.history;
    const weeks = h.weekDays.length;
    const start = () => Float64Array.from(this.companies, (c) => c.price);
    return {
      last: market.price.slice(),
      prevClose: market.state.prevClose.slice(),
      volume: market.state.dayVolume.slice(),
      shares: model.shares.slice(),
      revenue: f.revenue.slice(),
      income: f.income.slice(),
      dividendYield: f.dividend.map((d, i) => d / market.price[i]),
      sector: model.sector.slice(),
      status: market.state.status.slice(),
      reported: f.reported.slice(),
      week: weeks
        ? { day: h.weekDays[weeks - 1], close: weekCloses(h, weeks - 1), previous: weeks > 1 ? weekCloses(h, weeks - 2) : start() }
        : undefined,
    };
  }

  /** Market status for the tray. */
  holiday(): string | undefined {
    return holiday(dayOf(this.s.clock));
  }

  // ---------- Charts (spec §13) ----------

  /** Companies the UI watches (watchlists, open charts); holdings are always watched. */
  watch(ids: Iterable<number>): void {
    this.watched = new Set(ids);
    const keep = new Set(this.tracked());
    for (const id of this.intraday.keys()) if (!keep.has(id)) this.intraday.delete(id);
  }

  private tracked(): number[] {
    const ids = new Set([INDEX, ...[...this.watched].filter((id) => id >= 0)]);
    for (const p of this.s.account.positions) ids.add(p.company);
    return [...ids];
  }

  /** The latest 5-minute bar and today's bar so far, for live chart updates. Commodities have daily closes only. */
  live(id: number): LiveBars {
    if (id < INDEX) {
      const k = chartCommodity(id);
      const pc = this.prices();
      const close = this.commodities.spot(k, pc);
      const open = this.commodities.previous(k);
      return this.phase === 'open' ? { day: { time: (pc.day * 1440 + CLOSE) * 60, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 0 } } : {};
    }
    return { bar: this.intraday.get(id)?.at(-1), day: this.runningBar(id) };
  }

  bars(id: number, timeframe: Timeframe): Bar[] {
    if (id < INDEX) return this.commodityBars(chartCommodity(id), timeframe);
    switch (timeframe) {
      case '1D':
        return this.sessions(id, 1);
      case '5D':
        return this.sessions(id, SESSIONS_KEPT);
      case '1M':
        return this.daily(id).slice(-22);
      case '6M':
        return this.daily(id).slice(-126);
      case '1Y':
        return this.daily(id).slice(-252);
      case '5Y':
        return this.weekly(id).slice(-261);
      case 'MAX':
        return this.weekly(id);
    }
  }

  /**
   * A contract's underlying, day by day (spec §13): generated years before the start, the recorded closes, and now. The
   * index future's is the MAJOR 500's. Commodities keep daily closes only, so the intraday timeframes show a month.
   */
  private commodityBars(k: number, timeframe: Timeframe): Bar[] {
    if (k === MJ) return this.bars(INDEX, timeframe);
    const { days, closes } = this.s.commodities;
    let pre = this.pregameCommodities.get(k);
    if (!pre) this.pregameCommodities.set(k, (pre = pregameCommodity(this.seed, k, this.pregameData().days)));
    const n = CONTRACTS.length;
    const game = days.map((day, row): Bar => {
      const close = closes[row * n + k];
      return { time: (day * 1440 + CLOSE) * 60, open: close, high: close, low: close, close, volume: 0 };
    });
    const pc = this.prices();
    const now = this.commodities.spot(k, pc);
    const today = this.phase === 'open' && days.at(-1) !== pc.day ? [{ time: (pc.day * 1440 + CLOSE) * 60, open: now, high: now, low: now, close: now, volume: 0 }] : [];
    const all = [...pre, ...game, ...today];
    const length = { '1D': 22, '5D': 22, '1M': 22, '6M': 126, '1Y': 252, '5Y': 1260, MAX: all.length }[timeframe];
    return all.slice(-length);
  }

  private pregameData() {
    if (!this.pregame) {
      const days = pregameDays(START_DAY);
      this.pregame = { days, market: pregameMarket(this.seed, days.length) };
    }
    return this.pregame;
  }

  /** Today's bar so far, while today's session is open. */
  private runningBar(id: number): Bar | undefined {
    if (this.phase !== 'open') return undefined;
    const time = (dayOf(this.s.clock) * 1440 + CLOSE) * 60;
    if (id === INDEX) {
      const { open, high, low } = this.market.state.index;
      return { time, open, high, low, close: this.market.indexLevel, volume: 0 };
    }
    const { dayOpen, dayHigh, dayLow, dayVolume } = this.market.state;
    return { time, open: dayOpen[id], high: dayHigh[id], low: dayLow[id], close: this.market.price[id], volume: dayVolume[id] };
  }

  /** Daily bars: generated pre-game history, the recorded days, and today so far. */
  private daily(id: number): Bar[] {
    const { days, market } = this.pregameData();
    const h = this.s.history;
    const pre = id === INDEX ? pregameIndex(this.seed, days, market) : pregameBars(this.seed, id, this.companies[id], days, market);
    const game =
      id === INDEX
        ? h.index.map(([day, open, high, low, close]) => ({ time: (day * 1440 + CLOSE) * 60, open, high, low, close, volume: 0 }))
        : dailyBars(h, id, CLOSE);
    const today = this.runningBar(id);
    return [...pre, ...game, ...(today ? [today] : [])];
  }

  /** Weekly bars from the daily ones, with the weekly closes archive covering days that left the ring. */
  private weekly(id: number): Bar[] {
    const weeks: Bar[] = [];
    let week = -1;
    for (const b of this.daily(id)) {
      const day = Math.floor(b.time / 86_400);
      const start = day - ((weekday(day) + 6) % 7);
      const last = weeks.at(-1);
      if (start === week && last) {
        last.high = Math.max(last.high, b.high);
        last.low = Math.min(last.low, b.low);
        last.close = b.close;
        last.volume += b.volume;
        last.time = b.time;
      } else {
        weeks.push({ ...b });
        week = start;
      }
    }
    if (id === INDEX) return weeks;
    // Only closes survive for those weeks: each opens where the week before closed.
    const oldest = oldestDay(this.s.history) ?? Infinity;
    const archived = weeklyCloses(this.s.history, id)
      .filter(([day]) => day < oldest)
      .map(([day, close]) => ({ time: (day * 1440 + CLOSE) * 60, open: NaN, high: close, low: close, close, volume: 0 }));
    const bars = [...weeks, ...archived].sort((a, b) => a.time - b.time);
    bars.forEach((b, k) => {
      if (!Number.isNaN(b.open)) return;
      b.open = k ? bars[k - 1].close : b.close;
      b.high = Math.max(b.open, b.close);
      b.low = Math.min(b.open, b.close);
    });
    return bars;
  }

  /**
   * 5-minute bars for the last `count` sessions: real bars where the company was being watched, the rest generated
   * from each session's daily bar (spec §11.3 keeps intraday bars for watched companies only, and never saves them).
   */
  private sessions(id: number, count: number): Bar[] {
    const today = dayOf(this.s.clock);
    const started = isTradingDay(today) && minuteOf(this.s.clock) >= OPEN;
    const days = [started ? today : previousTradingDay(today)];
    while (days.length < count) days.unshift(previousTradingDay(days[0]));
    const byDay = new Map(this.daily(id).map((b) => [Math.floor(b.time / 86_400), b]));
    const real = this.intraday.get(id) ?? [];
    const barVol = id === INDEX ? 0.15 * Math.sqrt(BAR_YEARS) : this.model.volatility[id] * Math.sqrt(BAR_YEARS);
    return days.flatMap((day) => {
      const daily = byDay.get(day);
      if (!daily) return [];
      const own = real.filter((b) => Math.floor(b.time / 86_400) === day);
      const elapsed = day === today ? Math.min(BARS_PER_DAY, Math.floor((minuteOf(this.s.clock) - OPEN) / BAR_MINUTES)) : BARS_PER_DAY;
      const rng = Rng.stream(this.seed, `session:${id}:${day}`);
      if (!own.length) {
        return sessionBars(rng, day, 0, elapsed, daily.open, daily.close, [daily.low, daily.high], daily.volume, barVol);
      }
      const first = (own[0].time / 60 - day * 1440 - OPEN) / BAR_MINUTES;
      const volume = Math.max(0, daily.volume - own.reduce((a, b) => a + b.volume, 0));
      return [...sessionBars(rng, day, 0, first, daily.open, own[0].open, undefined, volume, barVol), ...own];
    });
  }

  /** Events since the last call: fills, closes (for autosave), halts. */
  drainEvents(): EngineEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
