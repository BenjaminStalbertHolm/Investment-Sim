import 'fake-indexeddb/auto';
import { createStore, keys, set } from 'idb-keyval';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLOSE, START_DAY, at, nextTradingDay } from '../src/sim/calendar';
import { Engine, type SimState } from '../src/sim/engine';
import { DEFAULT_LOGO as PLAYER_LOGO, decodeLogo, encodeLogo } from '../src/art/logo/code';
import { defaultPlayer } from '../src/sim/player';
import { DIFFICULTIES, changeSettings } from '../src/sim/settings';
import { decodeCeo } from '../src/world/ceo';
import { newBrowserState } from '../src/state/browser';
import { SAVE_VERSION, migrate } from '../src/state/migrations';
import { SAVE_FORMAT, packSave, unpackSave, type Manifest } from '../src/state/saveFile';
import { cleanUp, deleteSave, listSaves, nextAutosave, readSave, writeSave, type SaveSlot } from '../src/state/saves';
import { generateWorld, type World } from '../src/world/generator';
import { difference } from './util';

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'save test', companyCount: 1000 });
});

const manifest = (extra: Partial<Manifest> = {}): Manifest => ({
  format: SAVE_FORMAT, version: SAVE_VERSION, name: 'Test', firmName: 'Test', gameTime: 0, netWorth: 0, savedAt: 0, ...extra,
});

/** The trading days of the first `n` sessions. */
const sessions = (n: number) => {
  const days = [START_DAY];
  while (days.length < n) days.push(nextTradingDay(days.at(-1)!));
  return days;
};

/** The player's actions in session `s`, placed at 10:30: the same in every run. */
function trade(e: Engine, s: number): void {
  const i = (s * 37) % 1000;
  if (s % 3 === 0) e.placeOrder({ company: i, side: 'buy', type: 'market', shares: 100, tif: 'day' });
  if (s % 5 === 0) {
    const j = (i + 1) % 1000;
    e.placeOrder({ company: j, side: 'buy', type: 'limit', limit: e.market.price[j] * 0.97, shares: 200, tif: 'gtc' });
  }
  if (s % 7 === 0) {
    const p = e.positions()[0];
    if (p) e.placeOrder({ company: p.company, side: 'sell', type: 'market', shares: Math.ceil(p.shares / 2), tif: 'day' });
  }
}

/** A state without what Phase 6 added. */
function beforePhase6(state: SimState) {
  const { macro: _m, events: _e, journalists: _j, clients: _c, mail: _mail, ...rest } = state;
  const { events: _re, macro: _rm, clients: _rc, mail: _rmail, ...rng } = state.rng;
  const { dividend: _d, ...fundamentals } = state.fundamentals;
  return { ...rest, rng, fundamentals };
}

const saveAndLoad = (e: Engine): Engine => {
  const bytes = packSave({ manifest: manifest(), sim: e.exportState() });
  return Engine.restore(migrate(unpackSave(bytes)).sim as SimState);
};

describe('save system (spec §18)', () => {
  it('save test: 60 days, save, load, 60 more days = 120 days without saving', () => {
    const days = sessions(120);
    // Phase 5: a Custom game with its own logo and CEO, renamed and redesigned along the way.
    const settings = changeSettings(DIFFICULTIES.hard, { startingCapital: 2_500_000, startYear: 2001 });
    const player = { logoCode: encodeLogo(PLAYER_LOGO), ceoName: 'Pat Doe', ceoCode: 'BJaA2pIrBgMQEws' };
    const straight = Engine.create(world, { settings, firmName: 'Test', player });
    let saved = Engine.create(world, { settings, firmName: 'Test', player });
    days.forEach((day, s) => {
      for (const e of [straight, saved]) {
        e.advanceTo(at(day, 10 * 60 + 30));
        trade(e, s);
        if (s === 30) e.setPlayer({ firmName: 'Renamed Capital', logoCode: encodeLogo({ ...PLAYER_LOGO, effect: 'bevel' }) });
        if (s === 90) e.setPlayer({ ceoName: 'Pat Doe-Ray' });
        // Phase 6: answer the mail — take mandates, report a tip, read and flag letters.
        if (s % 20 === 10) {
          const offer = e.mail().messages.find((m) => m.kind === 'offer' && !m.answer);
          if (offer) e.mailAction(offer.id, 'accept');
        }
        if (s === 45) {
          const tip = e.mail().messages.find((m) => m.kind === 'tip' && !m.answer);
          if (tip) e.mailAction(tip.id, 'report');
          e.markMail([1, 2, 3], { read: true, flagged: true });
          e.setAlerts(false);
        }
      }
      if (s === 60) {
        // Save at any moment: mid-session, with open orders.
        saved.advanceTo(at(day, 11 * 60));
        expect(saved.openOrders().length).toBeGreaterThan(0);
        expect(saved.phase).toBe('open');
        saved = saveAndLoad(saved);
      }
      for (const e of [straight, saved]) e.advanceTo(at(day, CLOSE));
    });
    expect(saved.orders().length).toBeGreaterThan(50);
    expect(difference(saved.exportState(), straight.exportState())).toBeUndefined();
    // Phase 6: mail, news, rumours, clients and the economy all carried over, answers included.
    const state = saved.exportState();
    expect(state.mail.messages.length).toBeGreaterThan(100);
    expect(state.mail.messages.some((m) => m.answer === 'accepted')).toBe(true);
    expect(state.events.news.length).toBeGreaterThan(500);
    expect(state.events.rumours.length).toBeGreaterThan(20);
    expect(state.clients.clients.filter((c) => c.status === 'active').length).toBeGreaterThan(2);
    expect(state.events.queue.length).toBeGreaterThan(0);
    // Phase 4: the quarterly results the IR pages show carry over, including reports made after loading.
    const quarters = saved.details(5).quarters;
    expect(quarters.at(-1)!.reported).toBeGreaterThan(START_DAY);
    expect(quarters).toEqual(straight.details(5).quarters);
    // Phase 5: the firm, its logo and CEO, and the Custom settings carry over.
    expect(saved.player).toMatchObject({ firmName: 'Renamed Capital', ceoName: 'Pat Doe-Ray', ceoCode: player.ceoCode });
    expect(decodeLogo(saved.player.logoCode).effect).toBe('bevel');
    expect(saved.settings).toEqual(settings);
    expect(saved.settings.difficulty).toBe('custom');
  }, 60_000);

  it('upgrades a version 3 save: mail, news, clients and the economy start where the game stands', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Old Firm' });
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    e.runSessions(4);
    const sim = e.exportState() as Partial<SimState> & SimState;
    const nav = e.nav();
    const { macro: _m, events: _e, journalists: _j, clients: _c, mail: _mail, ...v3 } = sim;
    const { events: _re, macro: _rm, clients: _rc, mail: _rmail, ...rng } = sim.rng;
    const { status: _s, ...market } = sim.market;
    const { members: _members, ...index } = sim.market.index;
    const { dividend: _d, ...fundamentals } = sim.fundamentals;
    const old = { ...v3, rng, market: { ...market, index }, fundamentals };
    const upgraded = migrate(unpackSave(packSave({ manifest: manifest({ version: 3 }), sim: old, game: {} })));
    const loaded = Engine.restore(upgraded.sim as SimState);
    expect(loaded.mail().messages.map((m) => m.kind)).toEqual(['welcome']);
    const clients = loaded.clients();
    expect(clients.clients.map((c) => c.kind)).toEqual(['founder', 'founder']);
    expect(clients.unit).toBeCloseTo(1, 9);
    expect(clients.clientAssets).toBeCloseTo(nav, 4);
    expect(loaded.journalists().length).toBeGreaterThan(40);
    expect(Array.from(loaded.exportState().market.index.members)).toEqual(Array.from(sim.market.index.members));
    loaded.runSessions(3);
    expect(loaded.newsCount).toBeGreaterThan(10);
    expect(loaded.mail().messages.some((m) => m.kind === 'briefing')).toBe(true);
  });

  it('upgrades a version 2 save: default logo, a CEO from the seed, and the advanced settings', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.hard, firmName: 'Old Firm' });
    const sim = e.exportState();
    const { commission, spread, smallCapSpread, volatility, crashes, impact, startingCapital } = DIFFICULTIES.hard;
    const old = {
      ...sim,
      player: { firmName: 'Old Firm' },
      settings: { difficulty: 'hard', startingCapital, commission, spread, smallCapSpread, volatility, crashes, impact },
    };
    const upgraded = migrate(unpackSave(packSave({ manifest: manifest({ version: 2 }), sim: old, game: {} })));
    const loaded = Engine.restore(upgraded.sim as SimState);
    expect(loaded.settings).toEqual(DIFFICULTIES.hard);
    expect(loaded.player).toEqual(defaultPlayer(world.seed, 'Old Firm'));
    expect(decodeLogo(loaded.player.logoCode)).toMatchObject({ motif: 'bull', shape: 'circle' });
    expect(() => decodeCeo(loaded.player.ceoCode)).not.toThrow();
  });

  it('upgrades a version 1 save: quarterly results backfilled, browser favourites and history added', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Test' });
    e.runSessions(3);
    const sim = e.exportState();
    const old = { ...sim, fundamentals: { ...sim.fundamentals } } as Record<string, unknown> & SimState;
    delete (old.fundamentals as Partial<SimState['fundamentals']>).quarterRevenue;
    delete (old.fundamentals as Partial<SimState['fundamentals']>).quarterIncome;
    const v1 = unpackSave(packSave({ manifest: manifest({ version: 1 }), sim: old, game: { trade: {} } }));
    const upgraded = migrate(v1);
    expect(upgraded.manifest.version).toBe(SAVE_VERSION);
    expect(upgraded.game).toMatchObject({ trade: {}, browser: newBrowserState() });
    const loaded = Engine.restore(upgraded.sim as SimState);
    // Everything before Phase 6 is as it was; Phase 6 starts afresh (its own test below).
    expect(difference(beforePhase6(loaded.exportState()), beforePhase6(sim))).toBeUndefined();
  });

  it('packs documents with every kind of typed array into a zip and back', () => {
    const documents = {
      manifest: manifest({ name: 'Round trip' }),
      game: { windows: [{ id: 'w1', bounds: { x: 1, y: 2 } }], nested: { list: [1, 'two', null, true] } },
      sim: {
        f64: Float64Array.of(Math.PI, -0, Number.NaN, Infinity),
        f32: Float32Array.of(1.5, -2.25),
        i32: Int32Array.of(-2147483648, 2147483647),
        i16: Int16Array.of(-32768, 32767),
        u16: Uint16Array.of(0, 65535),
        u8: Uint8Array.of(0, 255),
        view: new Int32Array(new Int32Array([9, 8, 7, 6]).buffer, 4, 2),
        empty: new Float64Array(0),
      },
    };
    const back = unpackSave(packSave(documents));
    expect(back).toEqual(documents);
    expect((back.sim as { i32: Int32Array }).i32).toBeInstanceOf(Int32Array);
    expect(unpackSave(packSave(documents), true)).toEqual({ manifest: documents.manifest });
  });

  it('rejects files that are not saves, and saves from a newer version', () => {
    expect(() => unpackSave(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => migrate({ manifest: { ...manifest(), format: 'nope' as typeof SAVE_FORMAT } })).toThrow(/not a Majorsoft/);
    expect(() => migrate({ manifest: manifest({ version: SAVE_VERSION + 1 }) })).toThrow(/newer version/);
  });

  it('upgrades old saves through each migration in turn', () => {
    const steps = { 1: (d: { manifest: Manifest; log?: string[] }) => ({ ...d, log: ['1→2'] }), 2: (d: { manifest: Manifest; log?: string[] }) => ({ ...d, log: [...d.log!, '2→3'] }) };
    const upgraded = migrate({ manifest: manifest({ version: 1 }) }, steps, 3);
    expect(upgraded).toMatchObject({ manifest: { version: 3 }, log: ['1→2', '2→3'] });
  });
});

describe('save slots in IndexedDB (spec §17–18)', () => {
  const slot = (id: string, savedAt: number, auto = false): Omit<SaveSlot, 'file' | 'size'> => ({
    id, name: id, auto, savedAt, gameTime: 0, firmName: 'Test', netWorth: 0,
  });
  const files = () => keys<string>(createStore('majorsoft-doors-98', 'saves')).then((k) => k.filter((x) => x !== 'index'));

  beforeEach(async () => {
    for (const s of await listSaves()) await deleteSave(s.id);
    await cleanUp();
  });

  it('writes, lists, reads and deletes slots', async () => {
    await writeSave(slot('one', 1), Uint8Array.of(1));
    await writeSave(slot('two', 2), Uint8Array.of(2, 2));
    expect((await listSaves()).map((s) => [s.id, s.size])).toEqual([['one', 1], ['two', 2]]);
    expect(await readSave('two')).toEqual(Uint8Array.of(2, 2));
    await deleteSave('one');
    expect((await listSaves()).map((s) => s.id)).toEqual(['two']);
    await expect(readSave('one')).rejects.toThrow(/could not be found/);
    expect(await files()).toHaveLength(1);
  });

  it('overwrites a slot by switching to a new file, leaving nothing behind', async () => {
    const first = await writeSave(slot('game', 1), Uint8Array.of(1));
    const second = await writeSave(slot('game', 2), Uint8Array.of(9, 9));
    expect(second.file).not.toBe(first.file);
    expect(await readSave('game')).toEqual(Uint8Array.of(9, 9));
    expect(await files()).toEqual([second.file]);
  });

  it('sweeps away files a crash left behind', async () => {
    await writeSave(slot('game', 1), Uint8Array.of(1));
    await set('file:game:half-written', Uint8Array.of(0), createStore('majorsoft-doors-98', 'saves'));
    await cleanUp();
    expect(await files()).toHaveLength(1);
    expect(await readSave('game')).toEqual(Uint8Array.of(1));
  });

  it('rotates three autosaves', async () => {
    const ids: string[] = [];
    for (let k = 0; k < 5; k++) {
      const id = nextAutosave(await listSaves());
      ids.push(id);
      await writeSave(slot(id, 100 + k, true), Uint8Array.of(k));
    }
    expect(ids).toEqual(['autosave-1', 'autosave-2', 'autosave-3', 'autosave-1', 'autosave-2']);
    expect((await listSaves()).filter((s) => s.auto)).toHaveLength(3);
  });
});
