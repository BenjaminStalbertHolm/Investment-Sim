import { decodeCompany, type Company } from '../world/company';
import { generateWorld, type World, type WorldOptions } from '../world/generator';
import type { Firm, Holding } from '../world/ownership';
import { Rng, type RngState } from '../world/rng';
import { bookFill, type Account, type Order, type OrderRequest, type OrderStatus } from './account';
import {
  BAR_MINUTES, BARS_PER_DAY, CLOSE, OPEN, START_DAY, at, dayOf, holiday, isTradingDay, minuteOf, nextOpen,
  nextTradingDay, phaseAt, previousTradingDay, weekday, type GameTime, type Phase,
} from './calendar';
import {
  QUARTERS, initialFundamentals, nextReport, quarterReported, reportDay, reportEarnings, type Fundamentals,
} from './earnings';
import {
  createHistory, dailyBars, endsWeek, oldestDay, packHistory, recordDay, unpackHistory, weekCloses, weeklyCloses,
  weeklyValues, type Bar, type HistoryState,
} from './history';
import { Market, PARTICIPATION, initialMarket, type MarketState } from './market';
import { BAR_YEARS, buildModel, type Model } from './model';
import { pregameBars, pregameDays, pregameIndex, pregameMarket, sessionBars } from './pregame';
import type { GameSettings } from './settings';
import {
  INDEX, type AccountView, type CompanyDetails, type Directory, type EngineEvent, type Estimate, type FirmView,
  type Holder, type LiveBars, type MarketTable, type PositionView, type Quote, type QuarterResult, type Timeframe,
} from './types';

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
  player: { firmName: string };
  clock: GameTime;
  rng: { tick: RngState; regime: RngState; earnings: RngState };
  market: MarketState;
  fundamentals: Fundamentals;
  history: HistoryState;
  account: Account;
  /** [day, net worth, MAJOR 500] at each close. */
  stats: [number, number, number][];
}

export interface NewGameOptions extends WorldOptions {
  settings: GameSettings;
  firmName: string;
}

const SESSIONS_KEPT = 5;

/**
 * The market simulation (spec §11): runs headless in tests and inside the Web Worker in the game. It owns market
 * truth; the UI only reads snapshots and sends orders.
 */
export class Engine {
  readonly market: Market;
  private readonly rng: { tick: Rng; regime: Rng; earnings: Rng };
  /** Companies the player is looking at get real 5-minute bars (spec §11.3), as do holdings and the MAJOR 500. */
  private watched = new Set<number>();
  private readonly intraday = new Map<number, Bar[]>();
  private events: EngineEvent[] = [];
  private pregame?: { days: number[]; market: Float64Array };

  private constructor(
    private readonly s: SimState,
    readonly companies: readonly Company[],
    readonly model: Model = buildModel(s.world.seed, companies, s.settings),
  ) {
    this.market = new Market(s.market, model, s.settings);
    this.rng = { tick: Rng.fromState(s.rng.tick), regime: Rng.fromState(s.rng.regime), earnings: Rng.fromState(s.rng.earnings) };
  }

  static newGame(options: NewGameOptions): Engine {
    return Engine.create(generateWorld(options), options);
  }

  /** A new game on a generated world, at the opening bell of the start date. */
  static create(world: World, options: { settings: GameSettings; firmName: string }): Engine {
    const { seed, companies } = world;
    const model = buildModel(seed, companies, options.settings);
    const clock = at(START_DAY, OPEN);
    const capital = options.settings.startingCapital;
    const stream = (name: string) => Rng.stream(seed, name).state();
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
      settings: options.settings,
      player: { firmName: options.firmName },
      clock,
      rng: { tick: stream('market:tick'), regime: stream('market:regime'), earnings: stream('earnings') },
      market: initialMarket(companies, model, Rng.stream(seed, 'market:value')),
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
        ledger: [{ time: clock, kind: 'deposit', amount: capital, balance: capital }],
      },
      stats: [],
    };
    return new Engine(structuredClone(state), companies, model);
  }

  /** Continues a game from exportState(). Companies are decoded from their genomes, not regenerated. */
  static restore(saved: SimState): Engine {
    return new Engine({ ...saved, history: unpackHistory(saved.history) }, saved.world.genomes.map(decodeCompany));
  }

  /** A snapshot of the whole simulation, ready to save (spec §18). Intraday bars are not part of it. */
  exportState(): SimState {
    this.s.rng = { tick: this.rng.tick.state(), regime: this.rng.regime.state(), earnings: this.rng.earnings.state() };
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
  get halted(): boolean {
    return this.market.state.halted;
  }
  /** Trading happens now: the market is open and not halted. */
  get trading(): boolean {
    return this.phase === 'open' && !this.market.state.halted;
  }

  // ---------- Time (spec §11.1) ----------

  /** Runs every open, bar and close up to `target`. */
  advanceTo(target: GameTime): void {
    for (let next = this.nextEvent(); next <= target; next = this.nextEvent()) {
      this.s.clock = next;
      const minute = minuteOf(next);
      if (minute === OPEN) {
        this.open();
      } else {
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

  /** The next open (09:30) or bar end (09:35 … 16:00) after the clock. */
  private nextEvent(): GameTime {
    const day = dayOf(this.s.clock);
    const minute = minuteOf(this.s.clock);
    if (isTradingDay(day)) {
      if (minute < OPEN) return at(day, OPEN);
      if (minute < CLOSE) return at(day, OPEN + (Math.floor((minute - OPEN) / BAR_MINUTES) + 1) * BAR_MINUTES);
    }
    return at(nextTradingDay(day), OPEN);
  }

  /** Opening bell: regime, earnings released overnight, the gap, then everything queued for the open. */
  private open(): void {
    const day = dayOf(this.s.clock);
    this.market.startDay(this.rng.regime);
    reportEarnings(day, this.s.fundamentals, this.market, this.companies, this.rng.earnings);
    this.market.openingGap(this.rng.tick);
    let oldest = day;
    for (let k = 1; k < SESSIONS_KEPT; k++) oldest = previousTradingDay(oldest);
    for (const [id, bars] of this.intraday) this.intraday.set(id, bars.filter((b) => b.time >= oldest * 86_400));
    for (const order of this.openOrders()) this.execute(order);
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
    this.s.stats.push([day, this.netWorth(), market.indexLevel]);
    this.events.push({ kind: 'close', day, weekEnd: endsWeek(day) });
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
    };
  }

  private check(r: OrderRequest): string | undefined {
    if (!Number.isInteger(r.company) || r.company < 0 || r.company >= this.companies.length) return 'Unknown symbol.';
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

  private held(company: number): number {
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
      ceo: `${c.ceo.firstName} ${c.ceo.lastName}`,
      founded: new Date(START_DAY * 86_400_000).getUTCFullYear() - c.founded,
      shares,
      marketCap: price * shares,
      revenue: f.revenue[i],
      income: f.income[i],
      eps,
      pe: eps > 0 ? price / eps : null,
      dividendYield: c.dividendYield,
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
      dividendYield: Float64Array.from(this.companies, (c) => c.dividendYield),
      sector: model.sector.slice(),
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
