import * as Comlink from 'comlink';
import { SAVE_VERSION, checkManifest, migrate } from '../state/migrations';
import { SAVE_FORMAT, packSave, unpackSave, type Manifest } from '../state/saveFile';
import type { OrderRequest } from './account';
import { CONTRACTS } from './data/commodities';
import type { Structure } from './loans';
import type { DarkRequest, Terms } from './darkweb';
import type { Mail, MailAction } from './mail';
import type { NewsQuery } from './news';
import { dayOf, minutesPerSecond, phaseEnd, setStartYear } from './calendar';
import { Engine, type NewGameOptions, type SimState } from './engine';
import type { Player } from './player';
import { INDEX, commodityChart, type EngineEvent, type Snapshot, type Timeframe } from './types';

/**
 * The simulation's Web Worker (spec §11). It paces the engine in real time, posts snapshots of what the UI watches at
 * most every 250 ms, and saves and loads the simulation's half of a game.
 */

const SNAPSHOT_MS = 250;
const TICK_MS = 50;

let engine: Engine | undefined;
let listener: ((snapshot: Snapshot) => void) | undefined;
let speed = 0;
let watched: number[] = [];
let carry = 0;
let last = performance.now();
let posted = 0;
let dirty = false;
let revision = 0;
let events: EngineEvent[] = [];
/** Each watched company's last 20 closes before today, for sparklines. */
const sparks = new Map<number, { day: number; closes: number[] }>();

function tick(): void {
  const now = performance.now();
  // After a stall (a save, a busy tab) the clock carries on rather than racing to catch up.
  const elapsed = Math.min(250, now - last);
  last = now;
  if (engine && speed) {
    carry += (elapsed / 1000) * minutesPerSecond(engine.time, speed);
    // A tick never runs past the end of the phase: a weekend's pace would otherwise skip Monday's pre-market.
    const left = phaseEnd(engine.time) - engine.time;
    const minutes = Math.min(Math.floor(carry), left);
    carry = minutes === left ? 0 : carry - minutes;
    if (minutes > 0) {
      engine.advance(minutes);
      dirty = true;
    }
  }
  if (dirty && now - posted >= SNAPSHOT_MS) post();
}

function spark(e: Engine, id: number, last: number): number[] {
  const day = dayOf(e.time);
  let cached = sparks.get(id);
  if (cached?.day !== day) {
    const closes = e.bars(id, '1M').filter((b) => b.time < day * 86_400).slice(-19).map((b) => b.close);
    sparks.set(id, (cached = { day, closes }));
  }
  return [...cached.closes, last];
}

function post(): void {
  const e = engine;
  if (!e || !listener) return;
  posted = performance.now();
  dirty = false;
  events.push(...e.drainEvents());
  if (events.some((ev) => ev.kind !== 'halt' && ev.kind !== 'mail')) revision++;
  const quotes: Snapshot['quotes'] = {};
  const live: Snapshot['live'] = { [INDEX]: e.live(INDEX) };
  for (const id of watched) {
    const quote = e.quote(id);
    quotes[id] = { ...quote, spark: spark(e, id, quote.last) };
    live[id] = e.live(id);
  }
  // Commodity charts follow the spot through the day.
  CONTRACTS.forEach((_, k) => (live[commodityChart(k)] = e.live(commodityChart(k))));
  listener({
    time: e.time,
    phase: e.phase,
    holiday: e.holiday(),
    halted: e.halted,
    speed,
    index: e.indexQuote(),
    quotes,
    live,
    account: e.account(),
    positions: e.positions(),
    openOrders: e.openOrders(),
    revision,
    events,
    mail: e.mailStatus(),
    news: e.newsCount,
    commodities: e.commodityQuotes(),
    sob: e.sobStatus(),
    darkweb: e.darkwebStatus(),
    desk: e.deskStatus(),
  });
  events = [];
}

function changed<T>(result: T): T {
  revision++;
  dirty = true;
  posted = 0;
  return result;
}

function start(e: Engine) {
  engine = e;
  setStartYear(e.settings.startYear);
  carry = 0;
  sparks.clear();
  e.watch(watched);
  changed(undefined);
  return { directory: e.directory(), seed: e.seed, firmName: e.firmName, player: e.player, settings: e.settings };
}

const game = () => {
  if (!engine) throw new Error('No game is running.');
  return engine;
};

const api = {
  /** Receives snapshots from now on. */
  connect(callback: (snapshot: Snapshot) => void): void {
    listener = callback;
    dirty = true;
  },

  newGame(options: NewGameOptions) {
    return start(Engine.newGame(options));
  },

  /** Loads a .d98 file: the simulation resumes here, and the UI's half of the game goes back to the caller. */
  load(bytes: Uint8Array) {
    const documents = migrate(unpackSave(bytes));
    return { ...start(Engine.restore(documents.sim as SimState)), game: documents.game, manifest: documents.manifest };
  },

  /** A .d98 file's manifest, once checked to be a save this version can load. */
  inspect(bytes: Uint8Array): Manifest {
    const { manifest } = unpackSave(bytes, true);
    checkManifest(manifest);
    return manifest;
  },

  /** A .d98 file of the running game plus the UI's state. The clock stands still while this runs (spec §18). */
  save(name: string, ui: unknown): { bytes: Uint8Array; manifest: Manifest } {
    const e = game();
    const manifest: Manifest = {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      name,
      firmName: e.firmName,
      gameTime: e.time,
      netWorth: e.netWorth(),
      savedAt: Date.now(),
      // A bankrupt firm's save is read-only; the Hall of Shame shows its final report (spec §16).
      bankrupt: e.bankruptcy(),
    };
    const bytes = packSave({ manifest, sim: e.exportState(), game: ui });
    return Comlink.transfer({ bytes, manifest }, [bytes.buffer]);
  },

  /** Renames the firm or changes its logo or CEO. */
  setPlayer(change: Partial<Omit<Player, 'presetFirm'>>): Player {
    return changed(game().setPlayer(change));
  },

  setSpeed(value: number): void {
    speed = value;
    dirty = true;
  },

  skipToNextOpen(): void {
    game().skipToNextOpen();
    carry = 0;
    changed(undefined);
  },

  /** Companies to quote in snapshots and to keep 5-minute bars for (watchlists, open quote windows). */
  watch(ids: number[]): void {
    watched = [...new Set(ids)].filter((id) => id >= 0);
    engine?.watch(watched);
    dirty = true;
  },

  placeOrder: (request: OrderRequest) => changed(game().placeOrder(request)),
  cancelOrder: (id: number) => changed(game().cancelOrder(id)),
  estimate: (request: OrderRequest) => game().estimate(request),
  bars: (id: number, timeframe: Timeframe) => game().bars(id, timeframe),
  details: (id: number) => game().details(id),
  firm: (id: number) => game().firm(id),
  table: () => {
    const t = game().table();
    const arrays = [t.last, t.prevClose, t.volume, t.shares, t.revenue, t.income, t.dividendYield, t.sector, t.reported, t.status, t.rating];
    if (t.week) arrays.push(t.week.close, t.week.previous);
    return Comlink.transfer(t, arrays.map((a) => a.buffer));
  },
  ledger: () => game().ledger(),
  // Phase 6: mail, news, clients.
  mail: () => game().mail(),
  markMail(ids: number[], patch: Partial<Pick<Mail, 'read' | 'flagged' | 'deleted'>>): void {
    game().markMail(ids, patch);
    dirty = true;
    posted = 0;
  },
  mailAction: (id: number, action: MailAction) => changed(game().mailAction(id, action)),
  setAlerts(on: boolean): void {
    game().setAlerts(on);
  },
  news: (query: NewsQuery) => game().news(query),
  rumours: (company?: number, limit?: number) => game().rumours(company, limit),
  journalists: () => game().journalists(),
  clients: () => game().clients(),
  calendar: (from: number, to: number, companies: number[]) => game().calendar(from, to, companies),
  orders: () => game().orders(),
  closedPositions: () => game().closedPositions(),
  stats: () => game().stats(),
  // Phase 7: short selling, futures and commodities, the weather and OPEK, loans, bankruptcy.
  borrow: (company: number) => game().borrow(company),
  futures: () => game().futures(),
  tradeFuture: (contract: string, contracts: number) => changed(game().tradeFuture(contract, contracts)),
  rollFuture: (contract: string) => changed(game().rollFuture(contract)),
  sellGoods: (code: string) => changed(game().sellGoods(code)),
  outlooks: (limit?: number) => game().outlookViews(limit),
  loans: () => game().loans(),
  loanQuote: (amount: number, structure: Structure, months: number) => game().loanQuote(amount, structure, months),
  takeLoan: (amount: number, structure: Structure, months: number) => changed(game().takeLoan(amount, structure, months)),
  repayLoan: (id: number, amount: number) => changed(game().repayLoan(id, amount)),
  repayQuote: (id: number, amount: number) => game().repayQuote(id, amount),
  bankruptcy: () => game().bankruptcy(),
  // Phase 8: index funds, competitors and league tables, the SOB and governance, the firm's record.
  funds: () => game().funds(),
  fundHoldings: (fund: number) => game().fundHoldings(fund),
  tradeFund: (fund: number, units: number) => changed(game().tradeFund(fund, units)),
  league: () => game().league(),
  sob: () => game().sob(),
  record: () => game().record(),
  hotPicks: () => game().hotPicks(),
  // Phase 9: the dark web.
  darkweb: () => game().darkweb(),
  darkQuote: (request: DarkRequest) => game().darkQuote(request),
  darkBuy: (request: DarkRequest, terms: Terms) => changed(game().darkBuy(request, terms)),
  repayShark: () => changed(game().repayShark()),
  closeShell: () => changed(game().closeShell()),
  // Phase 10: staff and the office, the firm's luxuries and pastimes, the trading desk and ISeekYou, IPOs.
  staff: () => game().staff(),
  staffAction: (a: Parameters<Engine['staffAction']>[0]) => changed(game().staffAction(a)),
  lifestyle: () => game().lifestyle(),
  lifestyleAction: (a: Parameters<Engine['lifestyleAction']>[0]) => changed(game().lifestyleAction(a)),
  desk: () => game().desk(),
  deskAction: (a: Parameters<Engine['deskAction']>[0]) => changed(game().deskAction(a)),
  ipos: () => game().ipos(),
  ipoAction: (a: Parameters<Engine['ipoAction']>[0]) => changed(game().ipoAction(a)),
  directory: () => game().directory(),
};

export type SimulationApi = typeof api;

setInterval(tick, TICK_MS);
Comlink.expose(api);
