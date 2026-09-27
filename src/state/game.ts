import * as Comlink from 'comlink';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { AppId } from '../apps/catalog';
import { formatDate, dayOf, setStartYear } from '../sim/calendar';
import { contractLabel } from '../sim/commodities';
import { simulation } from '../sim/client';
import type { BankruptcyReport } from '../sim/bankruptcy';
import type { NewGameOptions } from '../sim/engine';
import type { Player } from '../sim/player';
import { DIFFICULTIES, type GameSettings } from '../sim/settings';
import type { Directory, Snapshot } from '../sim/types';
import { chime } from '../audio/chime';
import { newBrowserState, useBrowser, type Dialup, type Favourite } from './browser';
import { newMailView, useMailView, type MailView } from './mail';
import { cleanUp, listSaves, nextAutosave, readSave, writeSave, type SaveSlot } from './saves';
import { useShell, type Speed } from './shell';
import { newTradeState, useTrade, type TradeTab, type Watchlist } from './trade';
import { useWindows, type Bounds, type WindowState } from './windows';

/** The running game as the UI sees it: the market from the worker's snapshots, and the save slot in use. */
interface GameStore {
  ready: boolean;
  /** What the game is busy doing ("Saving…"), shown in the tray. */
  busy?: string;
  /** Latest broker or system notice, shown briefly in the tray. */
  notice?: { text: string; at: number };
  /** An error for a message box. */
  alert?: string;
  /** Slot the game was loaded from or last saved to; Ctrl+S saves there. */
  slot?: { id: string; name: string };
  seed: string;
  firmName: string;
  /** The firm's logo and CEO (spec §18 player). */
  player?: Player;
  settings?: GameSettings;
  directory: Directory;
  snapshot?: Snapshot;
  /** The firm went bankrupt (spec §16): its final report. The game is read-only from then on. */
  bankrupt?: BankruptcyReport;
  /** What the bankruptcy is showing: the Blue Screen of Debt, then the final report (closed: the desktop, read-only). */
  bust?: 'blueScreen' | 'report';
}

export const useGame = create<GameStore>()(() => ({
  ready: false,
  seed: '',
  firmName: '',
  directory: { tickers: [], names: [], industries: [], genomes: [], firms: [] },
}));

/** The UI's half of a save (spec §18 GameState): windows, desktop, tray and the Trade app's watchlists. */
export interface GameState {
  windows: { windows: WindowState[]; lastBounds: Partial<Record<AppId, Bounds>>; zCounter: number; idCounter: number };
  shell: { iconPositions: Record<string, { x: number; y: number }>; speed: Speed; tickerTape: boolean };
  trade: { watchlists: Watchlist[]; active: string; tab: TradeTab };
  browser: { favourites: Favourite[]; history: string[]; dialup: Dialup };
  /** Outbox Express's folder, sort and junk filter (Phase 6). */
  mail?: MailView;
}

export function gameState(): GameState {
  const { windows, lastBounds, zCounter, idCounter } = useWindows.getState();
  const { iconPositions, speed, tickerTape } = useShell.getState();
  const { watchlists, active, tab } = useTrade.getState();
  const { favourites, history, dialup } = useBrowser.getState();
  const { folder, sort, junkFilter, selected } = useMailView.getState();
  return {
    windows: { windows, lastBounds, zCounter, idCounter },
    shell: { iconPositions, speed, tickerTape },
    trade: { watchlists, active, tab },
    browser: { favourites, history, dialup },
    mail: { folder, sort, junkFilter, selected },
  };
}

const notify = (text: string) => useGame.setState({ notice: { text, at: Date.now() } });
export const showError = (error: unknown) => useGame.setState({ alert: error instanceof Error ? error.message : String(error) });

/** A fresh world seed. Seeds are shareable text; only the choice of a new one uses the platform's randomness. */
export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(7, '0');

let connected = false;
let booting: Promise<void> | undefined;

/** Power on: continue the most recent save, or start a new game if there is none (spec §18 quick-load). */
export function boot(): Promise<void> {
  // One boot at a time (React's StrictMode runs effects twice in development).
  return (booting ??= start().finally(() => (booting = undefined)));
}

async function start(): Promise<void> {
  useGame.setState({ ready: false });
  if (!connected) {
    connected = true;
    void simulation().connect(Comlink.proxy(receive));
    useTrade.subscribe(syncWatch);
    useWindows.subscribe(syncWatch);
  }
  await cleanUp().catch(() => undefined);
  // A bankrupt firm's save is for the Hall of Shame, not for carrying on.
  const latest = (await listSaves().catch(() => [])).filter((s) => !s.bankrupt).sort((a, b) => b.savedAt - a.savedAt)[0];
  if (latest) {
    try {
      return await loadGame(latest.id);
    } catch (error) {
      showError(error);
    }
  }
  // First power-on: Setup runs before the desktop (spec §5).
  useShell.getState().setSetup(true);
}

/** The game Setup installs when cancelled before any game exists. */
export const standardGame = () => newGame({ seed: randomSeed(), settings: DIFFICULTIES.medium, firmName: 'Garage Capital' });

export async function newGame(options: NewGameOptions): Promise<void> {
  useGame.setState({ busy: 'Installing market…' });
  const started = await simulation().newGame(options);
  setStartYear(started.settings.startYear);
  useWindows.getState().closeAll();
  useTrade.setState(newTradeState());
  useBrowser.setState(newBrowserState());
  useMailView.setState(newMailView(), true);
  useGame.setState({ ...started, ready: true, busy: undefined, slot: undefined, snapshot: undefined, bankrupt: undefined, bust: undefined });
  resume();
}

export async function loadGame(id: string): Promise<void> {
  useGame.setState({ busy: 'Loading…' });
  try {
    const loaded = await simulation().load(await readSave(id));
    const ui = loaded.game as GameState;
    useWindows.setState(ui.windows);
    useShell.setState(ui.shell);
    useTrade.setState({ ...ui.trade, ticket: newTradeState().ticket });
    useBrowser.setState(ui.browser);
    useMailView.setState(ui.mail ?? newMailView(), true);
    // Ctrl+S goes back to a manual slot; after loading an autosave it starts a new one.
    const saved = (await listSaves()).find((s) => s.id === id);
    const { directory, seed, firmName, player, settings } = loaded;
    setStartYear(settings.startYear);
    // A bankrupt firm loads read-only: straight to its final report (spec §16).
    const bankrupt = loaded.manifest.bankrupt;
    useGame.setState({
      directory, seed, firmName, player, settings, ready: true, slot: saved && !saved.auto ? { id, name: saved.name } : undefined, bankrupt,
      bust: bankrupt ? 'report' : undefined,
    });
    if (bankrupt) setSpeed(0);
    resume();
  } finally {
    useGame.setState({ busy: undefined });
  }
}

/**
 * Saves the game (spec §18): to the slot given, else the one in use (Ctrl+S), else a new one named after the firm
 * and the game date. The worker stops the clock while it packs the file.
 */
export async function saveGame(target?: { id: string; name: string }): Promise<SaveSlot | undefined> {
  const { firmName, snapshot, bankrupt } = useGame.getState();
  if (bankrupt) {
    notify('A bankrupt firm cannot be saved again: its save is read-only.');
    return undefined;
  }
  const slot = target ??
    useGame.getState().slot ?? { id: `save-${Date.now()}`, name: `${firmName} ${formatDate(dayOf(snapshot?.time ?? 0))}` };
  const saved = await write(slot.id, slot.name, false);
  if (saved) {
    useGame.setState({ slot });
    notify(`Game saved to C:\\Saves\\${slot.name}`);
  }
  return saved;
}

/** Every game week, and before risky actions such as signing a loan (spec §18): into the oldest of the three autosave slots. */
export async function autosave(): Promise<void> {
  if (useGame.getState().bankrupt || useGame.getState().snapshot?.account.bankrupt) return;
  const id = nextAutosave(await listSaves());
  await write(id, `Autosave ${id.slice(-1)}`, true);
}

async function write(id: string, name: string, auto: boolean): Promise<SaveSlot | undefined> {
  if (useGame.getState().busy) return undefined;
  useGame.setState({ busy: 'Saving…' });
  try {
    const { bytes, manifest } = await simulation().save(name, gameState());
    const { savedAt, gameTime, firmName, netWorth } = manifest;
    return await writeSave({ id, name, auto, savedAt, gameTime, firmName, netWorth, bankrupt: !!manifest.bankrupt }, bytes);
  } catch (error) {
    showError(error);
    return undefined;
  } finally {
    useGame.setState({ busy: undefined });
  }
}

/** Adds a .d98 file (from the file picker or dropped on the desktop) to C:\Saves\ and loads it. */
export async function importSave(file: File): Promise<void> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const manifest = await simulation().inspect(bytes);
    const id = `import-${Date.now()}`;
    const { gameTime, firmName, netWorth } = manifest;
    const name = file.name.replace(/\.d98$/i, '') || manifest.name;
    await writeSave({ id, name, auto: false, savedAt: Date.now(), gameTime, firmName, netWorth, bankrupt: !!manifest.bankrupt }, bytes);
    await loadGame(id);
  } catch (error) {
    showError(error instanceof Error && /zip|invalid/i.test(error.message) ? 'This is not a Majorsoft Doors 98 saved game.' : error);
  }
}

/** Downloads a slot as a .d98 file (spec §18). */
export async function exportSave(slot: SaveSlot): Promise<void> {
  const url = URL.createObjectURL(new Blob([(await readSave(slot.id)) as BlobPart], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slot.name.replace(/[\\/:*?"<>|]/g, '_')}.d98`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The firm has gone bankrupt (spec §16): the clock has stopped for good. The game is saved into its slot (a new one if it
 * had none), marked Bankrupt for the Hall of Shame, and the Blue Screen of Debt comes up.
 */
async function goneBust(): Promise<void> {
  setSpeed(0);
  const bankrupt = await simulation().bankruptcy();
  useGame.setState({ bankrupt, bust: 'blueScreen' });
  const { firmName, slot } = useGame.getState();
  const target = slot ?? { id: `save-${Date.now()}`, name: `${firmName} (bankrupt)` };
  if (await write(target.id, target.name, false)) useGame.setState({ slot: target });
}

/** Opens the Setup Wizard over the desktop (My Computer → New Game); the clock stops meanwhile. */
export function openSetup(): void {
  void simulation().setSpeed(0);
  useShell.getState().setSetup(true);
}

/** Leaves Setup: back to the desktop and the clock's speed. */
export function closeSetup(): void {
  useShell.getState().setSetup(false);
  void simulation().setSpeed(useShell.getState().speed);
}

/** Renames the firm or changes its logo or CEO (My Computer → Firm). */
export async function updatePlayer(change: Partial<Omit<Player, 'presetFirm'>>): Promise<void> {
  const player = await simulation().setPlayer(change);
  useGame.setState({ player, firmName: player.firmName });
}

export function setSpeed(speed: Speed): void {
  useShell.getState().setSpeed(speed);
  void simulation().setSpeed(speed);
}

export const skipToNextOpen = () => void simulation().skipToNextOpen();

/** Opens a company's quote window (spec §12.1). */
export function openQuote(company: number): void {
  const { tickers, names } = useGame.getState().directory;
  useWindows.getState().open('quote', { company }, `${tickers[company]} — ${names[company]}`);
}

/** Opens a page in a new Internet Exploiter window. */
export function openUrl(url: string): void {
  useWindows.getState().open('browser', { url });
}

/** Data fetched from the worker (ledger, order history…), refetched whenever the account changes. */
export function useAccountData<T>(fetch: () => Promise<T>): T | undefined {
  const revision = useGame((s) => s.snapshot?.revision);
  const [data, setData] = useState<T>();
  useEffect(() => {
    let current = true;
    void fetch().then((d) => current && setData(d));
    return () => {
      current = false;
    };
    // The fetch function is recreated on every render; the revision says when to call it.
  }, [revision]);
  return data;
}

function resume(): void {
  lastWatch = '';
  syncWatch();
  void simulation().setSpeed(useShell.getState().speed);
}

function receive(snapshot: Snapshot): void {
  useGame.setState({ snapshot });
  const { tickers } = useGame.getState().directory;
  const mail = snapshot.events.filter((e) => e.kind === 'mail').length;
  if (mail) {
    chime();
    notify(`You have ${mail === 1 ? 'a new message' : `${mail} new messages`} in Outbox Express.`);
  }
  for (const event of snapshot.events) {
    if (event.kind === 'close' && event.weekEnd) void autosave();
    else if (event.kind === 'halt') notify('Trading halted: the MAJOR 500 is down 10% today.');
    else if (event.kind === 'fill') {
      const verb = { buy: 'Bought', sell: 'Sold', short: 'Sold short', cover: 'Bought to cover' }[event.side];
      notify(`${verb} ${event.shares.toLocaleString('en-US')} ${tickers[event.company]} at $${event.price.toFixed(2)}`);
    } else if (event.kind === 'futures') {
      notify(`${event.contracts > 0 ? 'Bought' : 'Sold'} ${Math.abs(event.contracts)} ${contractLabel(event.contract)} at ${event.price.toFixed(event.price < 1 ? 4 : 2)}`);
    } else if (event.kind === 'bankrupt') void goneBust();
  }
}

let lastWatch = '';

/** Tells the worker which companies to quote: watchlists, open quote windows and the order ticket's. */
function syncWatch(): void {
  const { watchlists, ticket } = useTrade.getState();
  const ids = new Set(watchlists.flatMap((w) => w.companies));
  for (const w of useWindows.getState().windows) if (w.params?.company !== undefined) ids.add(w.params.company);
  if (ticket.company !== undefined) ids.add(ticket.company);
  const key = [...ids].sort((a, b) => a - b).join();
  if (key === lastWatch || !useGame.getState().ready) return;
  lastWatch = key;
  void simulation().watch([...ids]);
}
