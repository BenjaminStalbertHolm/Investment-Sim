// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, START_DAY, addTradingDays, at } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { SAVE_FORMAT, packSave, unpackSave, type Manifest } from '../src/state/saveFile';
import { SAVE_VERSION, migrate } from '../src/state/migrations';
import { autosave, boot, importSave, loadGame, saveGame, useGame } from '../src/state/game';
import { DEFAULT_PREFS, usePrefs } from '../src/state/prefs';
import { deleteSave, listSaves } from '../src/state/saves';
import { useShell } from '../src/state/shell';
import { generateWorld } from '../src/world/generator';
import { connect } from './harness';

// Phase 11 (spec §9, §17, §18): autosave on the schedule set, Ironman's one slot, pausing for pages, and loading old saves.

let engine: Engine;
let speeds: number[] = [];
let push: (snapshot: unknown) => void = () => undefined;

/** The worker as far as saving goes: the engine, and the file format the real worker writes. */
vi.mock('../src/sim/client', () => ({
  simulation: () => ({
    connect: (callback: (s: unknown) => void) => void (push = callback),
    setSpeed: (n: number) => void speeds.push(n),
    watch: () => undefined,
    save: (name: string, ui: unknown) => {
      const manifest: Manifest = { format: SAVE_FORMAT, version: SAVE_VERSION, name, firmName: engine.firmName, gameTime: engine.time, netWorth: engine.netWorth(), savedAt: Date.now() };
      return { bytes: packSave({ manifest, sim: engine.exportState(), game: ui }), manifest };
    },
    inspect: (bytes: Uint8Array) => unpackSave(bytes, true).manifest,
    load: (bytes: Uint8Array) => {
      const raw = unpackSave(bytes);
      const from = raw.manifest.version;
      // The migration under test is the game's notice, not the steps (tests/save.test.ts has those): an old save takes an identity step.
      const docs = migrate(raw, { [SAVE_VERSION - 1]: (d) => d });
      engine = Engine.restore(docs.sim as never);
      return {
        directory: engine.directory(), seed: engine.seed, firmName: engine.firmName, player: engine.player, settings: engine.settings,
        game: docs.game, manifest: docs.manifest, upgradedFrom: from < SAVE_VERSION ? from : undefined,
      };
    },
    newGame: () => undefined,
    directory: () => engine.directory(),
  }),
}));

const FIRM = 'Autosave Capital';
const close = (day: number, weekEnd = false) => ({ kind: 'close', day, weekEnd });
const snap = (events: unknown[]) => ({ ...(useGame.getState().snapshot as object), events });
/** Lets a save that has begun finish. */
const settle = async () => {
  await new Promise((r) => setTimeout(r, 20));
  for (let k = 0; k < 400 && useGame.getState().busy; k++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 20));
};

beforeAll(() => {
  const world = generateWorld({ seed: 'phase 11 game', companyCount: 800 });
  engine = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: FIRM });
  engine.advanceTo(at(addTradingDays(START_DAY, 2), CLOSE));
}, 60_000);

beforeEach(async () => {
  for (const s of await listSaves()) await deleteSave(s.id);
  usePrefs.setState(DEFAULT_PREFS);
  speeds = [];
  connect(engine, FIRM);
  useGame.setState({ slot: undefined, alert: undefined, notice: undefined, bankrupt: undefined });
  useShell.setState({ speed: 1, setup: false });
  // The worker's callback is registered by boot(); there is nothing saved, so Setup opens.
  await boot();
});
afterEach(() => useShell.setState({ setup: false }));

const ids = async () => (await listSaves()).map((s) => s.id).sort();

describe('autosave on the schedule set in My Computer → Game', () => {
  it('saves at each week’s last close by default, and not on other days', async () => {
    push(snap([close(START_DAY + 1)]));
    await settle();
    expect(await ids()).toEqual([]);
    push(snap([close(START_DAY + 4, true)]));
    await settle();
    expect(await ids()).toEqual(['autosave-1']);
  });

  it('saves every day when asked, and never when told never', async () => {
    usePrefs.setState({ autosave: 'day' });
    push(snap([close(START_DAY + 1)]));
    await settle();
    expect(await ids()).toEqual(['autosave-1']);
    usePrefs.setState({ autosave: 'never' });
    push(snap([close(START_DAY + 4, true)]));
    await settle();
    expect(await ids()).toEqual(['autosave-1']);
    // …but before a risky action it still saves.
    await autosave();
    expect(await ids()).toEqual(['autosave-1', 'autosave-2']);
  });

  it('saves on the first close of a month', async () => {
    usePrefs.setState({ autosave: 'month' });
    const jan30 = Date.UTC(1998, 0, 30) / 86_400_000;
    push(snap([close(jan30 - 1)]));
    push(snap([close(jan30)]));
    await settle();
    expect(await ids()).toEqual([]);
    push(snap([close(jan30 + 3)]));
    await settle();
    expect(await ids()).toEqual(['autosave-1']);
  });
});

describe('pausing for pages', () => {
  it('stops the clock when a page arrives, if asked', async () => {
    push(snap([{ kind: 'page' }]));
    await settle();
    expect(speeds).toEqual([]);
    usePrefs.setState({ pauseOnPage: true });
    push(snap([{ kind: 'page' }]));
    await settle();
    expect(speeds).toEqual([0]);
    expect(useShell.getState().speed).toBe(0);
    expect(useGame.getState().notice?.text).toMatch(/paused/);
    // Already paused: nothing more to do.
    push(snap([{ kind: 'page' }]));
    await settle();
    expect(speeds).toEqual([0]);
  });
});

describe('Ironman (spec §9: single autosave slot, no reloading)', () => {
  const ironman = () => useGame.setState({ settings: { ...engine.settings, ironman: true } });

  it('saves everything — Ctrl+S, Save As and autosave — to its one slot', async () => {
    ironman();
    await saveGame();
    expect(await ids()).toEqual([`ironman-${engine.seed}`]);
    await saveGame({ id: 'save-elsewhere', name: 'Somewhere else' });
    await autosave();
    expect(await ids()).toEqual([`ironman-${engine.seed}`]);
    const [slot] = await listSaves();
    expect(slot).toMatchObject({ name: `${FIRM} (Ironman)`, auto: false });
    // Saving keeps the game's slot the one Ctrl+S goes to.
    expect(useGame.getState().slot?.id).toBe(`ironman-${engine.seed}`);
  });

  it('saves at every close', async () => {
    ironman();
    push(snap([close(START_DAY + 1)]));
    await settle();
    expect(await ids()).toEqual([`ironman-${engine.seed}`]);
  });

  it('refuses to import a save', async () => {
    ironman();
    await importSave(new File([new Uint8Array([1, 2, 3])], 'other.d98'));
    expect(useGame.getState().alert).toMatch(/Ironman/);
    expect(await ids()).toEqual([]);
  });

  it('is an ordinary game without it: named slots and three rotating autosaves', async () => {
    await autosave();
    await autosave();
    await autosave();
    await autosave();
    expect(await ids()).toEqual(['autosave-1', 'autosave-2', 'autosave-3']);
  });
});

describe('loading an older save (spec §18: versioned with migrations)', () => {
  const put = async (id: string, version: number) => {
    const { writeSave } = await import('../src/state/saves');
    const bytes = packSave({
      manifest: { format: SAVE_FORMAT, version, name: id, firmName: FIRM, gameTime: engine.time, netWorth: 0, savedAt: 0 },
      sim: engine.exportState(),
      game: { windows: { windows: [], lastBounds: {}, zCounter: 1, idCounter: 1 }, shell: { iconPositions: {}, speed: 1, tickerTape: false }, trade: { watchlists: [], active: '', tab: 'quotes' }, browser: { favourites: [], history: [], dialup: 'short' } },
    });
    await writeSave({ id, name: id, auto: false, savedAt: 1, gameTime: engine.time, firmName: FIRM, netWorth: 0 }, bytes);
  };

  it('tells the player when a save from an older version was upgraded, and only then', async () => {
    await put('old', SAVE_VERSION - 1);
    await loadGame('old');
    expect(useGame.getState().notice?.text).toMatch(/older version.*upgraded/);
    useGame.setState({ notice: undefined });
    await put('new', SAVE_VERSION);
    await loadGame('new');
    expect(useGame.getState().notice?.text ?? '').not.toMatch(/older version/);
  });
});
