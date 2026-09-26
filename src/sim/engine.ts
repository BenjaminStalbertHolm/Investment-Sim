import { ceoName, decodeCeo } from '../world/ceo';
import { decodeCompany, type Company } from '../world/company';
import { generateWorld, type World, type WorldOptions } from '../world/generator';
import type { Firm, Holding } from '../world/ownership';
import { Rng, type RngState } from '../world/rng';
import { bookCash, bookFill, type Account, type Order, type OrderRequest, type OrderStatus } from './account';
import {
  BAR_MINUTES, BARS_PER_DAY, gameYear, CLOSE, OPEN, START_DAY, at, dayOf, holiday, isTradingDay, minuteOf, nextOpen,
  nextTradingDay, phaseAt, previousTradingDay, weekday, type GameTime, type Phase,
} from './calendar';
import {
  DEFAULT_FEES, accept, clientUnits, closeOfDay, decline, firstOffer, founding, mandateWarnings, morningClients,
  quarterEnd, settle, unitPrice, type ClientsState, type Fees,
} from './clients';
import type { Sim, Streams } from './context';
import {
  addTradingDays, applyFollowUp, closeDeal, dump, enqueue, eventRates, fire, leak, newEvents, pick, planAhead, planPicks,
  type EventsState, type Timed,
} from './events';
import { initialMacro, release, releasesOn, type MacroState } from './macro';
import { FOLDER_OF, digest, morningMail, newMailState, noteTrade, type Mail, type MailDraft, type MailState } from './mail';
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
import {
  INDEX, type AccountView, type CalendarEntry, type ClientsView, type CompanyDetails, type Directory, type EngineEvent,
  type Estimate, type FirmView, type Holder, type LiveBars, type MarketTable, type PositionView, type Quote,
  type QuarterResult, type Timeframe,
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
}

const STREAMS: (keyof Streams)[] = ['tick', 'regime', 'earnings', 'events', 'macro', 'clients', 'mail'];
/** The stream each saved state is named after (spec §10.1). */
const STREAM_NAMES: Record<keyof Streams, string> = {
  tick: 'market:tick', regime: 'market:regime', earnings: 'earnings', events: 'events', macro: 'macro', clients: 'clients', mail: 'mail',
};
const MORNING = 7 * 60;

export interface NewGameOptions extends WorldOptions {
  settings: GameSettings;
  firmName: string;
  /** Logo and CEO; a default logo and a CEO drawn from the seed when omitted. */
  player?: Omit<Player, 'firmName'>;
}

const SESSIONS_KEPT = 5;

/**
 * The market simulation (spec §11): runs headless in tests and inside the Web Worker in the game. It owns market
 * truth; the UI only reads snapshots and sends orders.
 */
export class Engine implements Sim {
  readonly market: Market;
  readonly rng: Streams;
  /** Chance per trading day that each company has a corporate event (derived, never saved). */
  private readonly eventRate: Float64Array;
  /** Companies the player is looking at get real 5-minute bars (spec §11.3), as do holdings and the MAJOR 500. */
  private watched = new Set<number>();
  private readonly intraday = new Map<number, Bar[]>();
  private events: EngineEvent[] = [];
  private pregame?: { days: number[]; market: Float64Array };

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
      },
      stats: [],
      macro: initialMacro(),
      events: newEvents(),
      journalists: hireJournalists(seed),
      clients: founding(Rng.stream(seed, 'clients:founders'), capital, 1000, player.ceoName, player.firmName, settings.clients),
      mail: newMailState(addTradingDays(START_DAY, 7)),
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

  // ---------- Time (spec §11.1) ----------

  /** Runs every morning, open, bar, close and scheduled task up to `target`. */
  advanceTo(target: GameTime): void {
    for (;;) {
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
    if (target > this.s.clock) this.s.clock = target;
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
        return;
      }
      case 'redeem':
        return settle(this, task.client);
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
  }

  /** Opening bell: regime, earnings and dividends released overnight, the gap, then everything queued for the open. */
  private open(): void {
    const day = dayOf(this.s.clock);
    this.market.startDay(this.rng.regime);
    const reports = reportEarnings(day, this.s.fundamentals, this.market, this.companies, this.rng.earnings);
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
    for (const order of this.openOrders()) this.execute(order);
  }

  /**
   * A quarter of each payer's annual dividend goes out on its report day (spec §15.2): the price and value drop by it
   * before the open, and the firm is paid for the shares it holds.
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
    this.fillResting();
  }

  private close(): void {
    const day = dayOf(this.s.clock);
    const { market } = this;
    const { dayOpen, dayHigh, dayLow, dayVolume, index } = market.state;
    const prices = { open: dayOpen, high: dayHigh, low: dayLow, close: market.price, volume: dayVolume };
    recordDay(this.s.history, day, prices, [index.open, index.high, index.low, market.indexLevel]);
    for (const order of this.openOrders()) if (order.tif === 'day') this.finish(order, 'expired');
    digest(this, day);
    const { settings } = this.s;
    closeOfDay(this, this.fees);
    const month = (d: number) => new Date(d * 86_400_000).getUTCMonth();
    const next = nextTradingDay(day);
    if (Math.floor(month(next) / 3) !== Math.floor(month(day) / 3)) quarterEnd(this, this.fees, settings.clientPatience);
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
    const holdings = [item.company, item.other].filter((c): c is number => c !== undefined && c >= 0 && this.held(c) > 0);
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
   * takeover) or written off (a bankruptcy); competitors' stakes go with it; the MAJOR 500 gets a new member.
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

  nav(): number {
    return this.netWorth();
  }

  /** The broker sells the largest positions first until the cash covers `amount` (redemptions, spec §15.1). */
  raiseCash(amount: number): void {
    if (!this.trading) return;
    const { price } = this.market;
    const positions = [...this.s.account.positions].sort((a, b) => b.shares * price[b.company] - a.shares * price[a.company] || a.company - b.company);
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

  /** What the next weeks hold (spec §12.8): earnings for `companies`, releases and Federal Reservoir meetings. */
  calendar(from: number, to: number, companies: readonly number[]): CalendarEntry[] {
    const out: CalendarEntry[] = [];
    for (let day = isTradingDay(from) ? from : nextTradingDay(from); day <= to; day = nextTradingDay(day)) {
      for (const r of releasesOn(day)) out.push({ day, minute: r.minute, kind: r.kind });
      const { index } = seasonOf(day);
      if (index < 0) continue;
      for (const c of companies) {
        if (this.model.slot[c] === index && !this.market.state.status[c]) {
          out.push({ day, minute: OPEN - 60, kind: 'earnings', company: c, dividend: this.s.fundamentals.dividend[c] / 4 });
        }
      }
    }
    return out;
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
    account.orders.push(order);
    if (this.trading) this.execute(order);
    return { order: structuredClone(order) };
  }

  cancelOrder(id: number): boolean {
    const order = this.s.account.orders.find((o) => o.id === id && o.status === 'open');
    if (order) this.finish(order, 'cancelled');
    return !!order;
  }

  /** What an order would cost now: price with spread and impact, commission, buying power (spec §12.2). */
  estimate(r: OrderRequest): Estimate {
    const { market } = this;
    const i = r.company;
    const mid = market.price[i];
    const half = market.halfSpread[i];
    const sign = r.side === 'buy' ? 1 : -1;
    const impact = market.impact(i, r.shares);
    const atMarket = mid * (1 + sign * (half + impact));
    const price = r.type === 'limit' ? (sign > 0 ? Math.min(r.limit!, atMarket) : Math.max(r.limit!, atMarket)) : atMarket;
    const value = r.shares * price;
    const commission = this.commission(value, true);
    const buyingPower = this.buyingPower(r.replaces);
    // A buy holds back its worst case: the limit price, or the market price with impact.
    const reserve = sign > 0 ? r.shares * (r.type === 'limit' ? r.limit! : atMarket) + commission : 0;
    const after = this.held(i) + sign * r.shares;
    return {
      bid: mid * (1 - half),
      ask: mid * (1 + half),
      price,
      value,
      commission,
      total: sign > 0 ? value + commission : value - commission,
      impact,
      volumeShare: r.shares / market.adv[i],
      buyingPower,
      buyingPowerAfter: buyingPower - reserve,
      warnings: sign > 0 ? mandateWarnings(this, i, after) : [],
    };
  }

  private check(r: OrderRequest): string | undefined {
    if (!Number.isInteger(r.company) || r.company < 0 || r.company >= this.companies.length) return 'Unknown symbol.';
    if (this.market.state.status[r.company]) return 'This company is no longer listed.';
    if (!Number.isInteger(r.shares) || r.shares < 1) return 'Enter a whole number of shares.';
    if (r.shares > this.model.shares[r.company]) return 'That is more shares than the company has issued.';
    if (r.type === 'limit' && !(Number.isFinite(r.limit) && r.limit! > 0)) return 'Enter a limit price.';
    if (r.replaces !== undefined && !this.openOrders().some((o) => o.id === r.replaces)) {
      return 'The order you are changing has already been filled or cancelled.';
    }
    if (r.side === 'sell') {
      const pending = this.openOrders().reduce(
        (n, o) => (o.side === 'sell' && o.company === r.company && o.id !== r.replaces ? n + o.shares - o.filled : n),
        0,
      );
      const available = this.held(r.company) - pending;
      if (r.shares > available) {
        return available > 0 ? `You can sell at most ${available.toLocaleString('en-US')} shares.` : 'You have no shares to sell.';
      }
      const e = this.estimate(r);
      if (this.s.account.cash + e.value < e.commission) return 'The sale would not cover the commission.';
    } else {
      const e = this.estimate(r);
      if (e.buyingPowerAfter < 0) return 'Insufficient buying power.';
    }
    return undefined;
  }

  /** Fills what can be filled right now: a market order, or the marketable part of a limit order. */
  private execute(order: Order): void {
    const { market } = this;
    const i = order.company;
    const buy = order.side === 'buy';
    const sign = buy ? 1 : -1;
    const mid = market.price[i];
    const half = market.halfSpread[i];
    let shares = order.shares - order.filled;
    if (!buy) shares = Math.min(shares, this.held(i));
    if (order.type === 'limit') {
      // The impact a limit leaves room for caps the size: impact(q) = k·√(q / ADV) and k = impact at one ADV.
      const room = sign * (order.limit! / mid - 1) - half;
      if (room < 0) return;
      const k = market.impact(i, market.adv[i]);
      if (k > 0) shares = Math.min(shares, Math.floor(market.adv[i] * (room / k) ** 2));
    }
    if (buy) shares = Math.min(shares, this.affordable(order, mid * (1 + half + market.impact(i, shares))));
    if (shares >= 1) {
      const impact = market.impact(i, shares);
      // Half of the impact stays in the price after the fill (the I term of spec §11.2).
      if (this.fill(order, shares, mid * (1 + sign * (half + impact)))) market.push(i, (sign * impact) / 2);
    }
    if (order.type === 'market' && order.status === 'open') {
      const note = buy ? 'Not enough cash for the whole order.' : 'Not enough shares for the whole order.';
      this.finish(order, order.filled ? 'cancelled' : 'rejected', note);
    }
  }

  /** Resting limit orders fill at their limit once the market reaches it, up to a share of each bar's volume. */
  private fillResting(): void {
    const { market } = this;
    for (const order of this.openOrders()) {
      if (order.type !== 'limit') continue;
      const i = order.company;
      const buy = order.side === 'buy';
      const quote = market.price[i] * (buy ? 1 + market.halfSpread[i] : 1 - market.halfSpread[i]);
      if (buy ? quote > order.limit! : quote < order.limit!) continue;
      let shares = Math.min(order.shares - order.filled, Math.floor(PARTICIPATION * market.barVolume[i]));
      shares = Math.min(shares, buy ? this.affordable(order, order.limit!) : this.held(i));
      if (shares >= 1) this.fill(order, shares, order.limit!);
    }
  }

  /** Whole shares the cash pays for at `price`, commission included. */
  private affordable(order: Order, price: number): number {
    const { fixed, rate } = this.s.settings.commission;
    const cash = this.s.account.cash - (order.filled ? 0 : fixed);
    return Math.max(0, Math.floor((cash * (1 - 1e-12)) / (price * (1 + rate))));
  }

  private fill(order: Order, shares: number, price: number): boolean {
    const commission = this.commission(shares * price, !order.filled);
    if (order.side === 'sell' && this.s.account.cash + shares * price < commission) {
      this.finish(order, 'cancelled', 'The sale would not cover the commission.');
      return false;
    }
    bookFill(this.s.account, order, shares, price, commission, this.s.clock);
    noteTrade(this, order.company, order.side, shares, price);
    this.events.push({ kind: 'fill', order: order.id, company: order.company, side: order.side, shares, price });
    return true;
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

  held(company: number): number {
    return this.s.account.positions.find((p) => p.company === company)?.shares ?? 0;
  }

  /** Cash less what open buy orders hold back (the account has no margin until Phase 7). */
  private buyingPower(except?: number): number {
    const { market } = this;
    let reserved = 0;
    for (const o of this.openOrders()) {
      if (o.side !== 'buy' || o.id === except) continue;
      const shares = o.shares - o.filled;
      const i = o.company;
      const price = o.type === 'limit' ? o.limit! : market.price[i] * (1 + market.halfSpread[i] + market.impact(i, shares));
      reserved += shares * price + this.commission(shares * price, !o.filled);
    }
    return this.s.account.cash - reserved;
  }

  // ---------- Views ----------

  netWorth(): number {
    let worth = this.s.account.cash;
    for (const p of this.s.account.positions) worth += p.shares * this.market.price[p.company];
    return worth;
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
    }));
  }

  account(): AccountView {
    const positions = this.positions();
    const { cash, deposits, closed } = this.s.account;
    const sum = (f: (p: PositionView) => number) => positions.reduce((a, p) => a + f(p), 0);
    const value = sum((p) => p.value);
    return {
      cash,
      value,
      netWorth: cash + value,
      deposits,
      dayChange: sum((p) => p.dayChange),
      unrealized: sum((p) => p.unrealized),
      realized: sum((p) => p.realized) + closed.reduce((a, c) => a + c.realized, 0),
      buyingPower: this.buyingPower(),
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
    const ids = new Set([INDEX, ...this.watched]);
    for (const p of this.s.account.positions) ids.add(p.company);
    return [...ids];
  }

  /** The latest 5-minute bar and today's bar so far, for live chart updates. */
  live(id: number): LiveBars {
    return { bar: this.intraday.get(id)?.at(-1), day: this.runningBar(id) };
  }

  bars(id: number, timeframe: Timeframe): Bar[] {
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
