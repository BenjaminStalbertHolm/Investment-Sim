import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { at, dayOf, nextTradingDay } from '../src/sim/calendar';
import { Engine, type SimState } from '../src/sim/engine';
import { migrate } from '../src/state/migrations';
import { packSave, unpackSave } from '../src/state/saveFile';
import { difference } from './util';
import { DEFAULT_PREFS, SCHEMES, sanitise } from '../src/state/prefs';
import { autosaveDue, ironmanSlot } from '../src/state/autosave';
import { MIGRATIONS, SAVE_VERSION } from '../src/state/migrations';
import { Pipes, SIZE, project, type Cell, type PipeStep } from '../src/shell/saver/pipes';
import { INDEX_ENTRIES } from '../src/apps/help/Help';
import { SECTIONS, TOPICS, TOPIC, ask } from '../src/sites/help/topics';
import { START_DAY } from '../src/sim/calendar';
import { Rng } from '../src/world/rng';
import { generateWorld } from '../src/world/generator';
import { eventRates } from '../src/sim/events';
import { DIFFICULTIES } from '../src/sim/settings';
import { KEEP, pruneBooks, type Account, type Order } from '../src/sim/account';
import { MAX_WEEKS, RING_DAYS, addToHistory, endsWeek, createHistory, dailyBars, packHistory, recordDay, splitHistory, unpackHistory, weekCloses, weeklyCloses, weeklyValues, type HistoryState } from '../src/sim/history';

// Phase 11 (spec §19): polish — the machine's settings, the screensaver, the help file, autosave and Ironman.

describe('the machine’s settings (spec §17)', () => {
  it('keeps what is valid and drops the rest, so damaged storage cannot break the desktop', () => {
    expect(sanitise(undefined)).toEqual({});
    expect(sanitise('nonsense' as never)).toEqual({});
    expect(sanitise({ scheme: 'brick', crt: true, volume: 0.25, saverMinutes: 10, autosave: 'month', startSpeed: 5 })).toEqual({
      scheme: 'brick', crt: true, volume: 0.25, saverMinutes: 10, autosave: 'month', startSpeed: 5,
    });
    expect(sanitise({ scheme: 'neon' as never, volume: 7, saverMinutes: -1, autosave: 'hourly' as never, startSpeed: 3 as never, crt: 'yes' as never })).toEqual({});
    expect(sanitise({ saver: 'logos', clicks: false })).toEqual({ saver: 'logos', clicks: false });
  });

  it('starts as the spec says: three minutes to the screensaver, an autosave every game week, sounds on, CRT off', () => {
    expect(DEFAULT_PREFS).toMatchObject({ saverMinutes: 3, autosave: 'week', crt: false, clicks: true, scheme: 'standard' });
    expect(SCHEMES.map((s) => s.id)).toEqual(['standard', 'teal', 'brick', 'contrast']);
  });
});

describe('autosave (spec §18) and Ironman (spec §9)', () => {
  const close = (day: number, weekEnd = false) => ({ day, weekEnd });
  it('follows the interval set in My Computer → Game', () => {
    expect(autosaveDue('day', close(START_DAY), undefined)).toBe(true);
    expect(autosaveDue('week', close(START_DAY + 1), START_DAY)).toBe(false);
    expect(autosaveDue('week', close(START_DAY + 4, true), START_DAY)).toBe(true);
    expect(autosaveDue('never', close(START_DAY, true), START_DAY - 1)).toBe(false);
    // Monthly: the first close of a new month; never on the first close after loading, which has nothing to compare with.
    const jan30 = Date.UTC(1998, 0, 30) / 86_400_000;
    const feb2 = Date.UTC(1998, 1, 2) / 86_400_000;
    expect(autosaveDue('month', close(jan30), undefined)).toBe(false);
    expect(autosaveDue('month', close(jan30 - 1), jan30 - 2)).toBe(false);
    expect(autosaveDue('month', close(feb2), jan30)).toBe(true);
    expect(autosaveDue('month', close(feb2 + 1), feb2)).toBe(false);
  });

  it('gives an Ironman game one slot of its own', () => {
    expect(ironmanSlot('ABC', 'Firm')).toEqual({ id: 'ironman-ABC', name: 'Firm (Ironman)' });
    expect(ironmanSlot('ABC', 'Firm').id).not.toBe(ironmanSlot('ABD', 'Firm').id);
    expect(ironmanSlot('ABC', 'Firm').id).not.toMatch(/^autosave-/);
  });
});

describe('save migrations (spec §18)', () => {
  it('has an upgrade from every older version to the next', () => {
    for (let v = 1; v < SAVE_VERSION; v++) expect(MIGRATIONS[v], `from version ${v}`).toBeTypeOf('function');
    expect(MIGRATIONS[SAVE_VERSION]).toBeUndefined();
  });

  // tests/fixtures/v9.d98 is a real save written by the build of Phase 10B (300 companies, a week of play, a position and a
  // resting order). Whatever later phases change, it must still load, and play on. A later format gets a fixture of its own.
  it('still loads a saved game written by version 9, and plays on', () => {
    const bytes = readFileSync('tests/fixtures/v9.d98');
    const raw = unpackSave(new Uint8Array(bytes));
    expect(raw.manifest).toMatchObject({ version: 9, firmName: 'Fixture Capital' });
    const upgraded = migrate(raw);
    expect(upgraded.manifest.version).toBe(SAVE_VERSION);
    const e = Engine.restore(upgraded.sim as SimState);
    expect(e.firmName).toBe('Fixture Capital');
    expect(e.positions().find((p) => p.company === 5)?.shares).toBe(100);
    expect(e.openOrders().map((o) => [o.company, o.type, o.tif])).toEqual([[9, 'limit', 'gtc']]);
    const before = e.netWorth();
    let day = nextTradingDay(dayOf(e.time));
    for (let n = 0; n < 15; n++, day = nextTradingDay(day)) e.advanceTo(at(day, 16 * 60));
    expect(Number.isFinite(e.netWorth())).toBe(true);
    expect(e.netWorth()).not.toBe(before);
    expect(e.bankrupt).toBe(false);
  });
});

describe('3D Pipelines (spec §4)', () => {
  const play = (seed: string, steps: number): PipeStep[] => {
    const pipes = new Pipes(Rng.stream(seed, 'test'), 6);
    return Array.from({ length: steps }, () => pipes.step());
  };
  const key = (c: Cell) => c.join();
  const near = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  it('draws the same pipes from the same stream', () => {
    expect(play('one', 300)).toEqual(play('one', 300));
    expect(play('one', 300)).not.toEqual(play('two', 300));
  });

  it('lays pipe one cell at a time, inside the cube, never through another pipe until the cube is cleared', () => {
    const steps = play('walls', 4000);
    let used = new Set<string>();
    let cleared = 0;
    for (const s of steps) {
      if (s.cleared) {
        cleared++;
        used = new Set();
      }
      expect(near(s.from, s.to)).toBe(1);
      for (const c of [s.from, s.to]) expect(c.every((v) => v >= 0 && v < SIZE)).toBe(true);
      expect(used.has(key(s.to)), `${key(s.to)} laid twice`).toBe(false);
      used.add(key(s.from));
      used.add(key(s.to));
      expect(s.colour).toBeGreaterThanOrEqual(0);
      expect(s.colour).toBeLessThan(6);
    }
    // 4,000 pieces cannot fit in 729 cells: it must have started over, more than once.
    expect(cleared).toBeGreaterThan(2);
    expect(steps.filter((s) => s.joint).length).toBeGreaterThan(200);
  });

  it('projects every cell onto the screen, nearer cells larger', () => {
    for (const [w, h] of [[1280, 800], [1920, 1080], [800, 600]]) {
      for (let x = 0; x < SIZE; x++) {
        for (let y = 0; y < SIZE; y++) {
          for (let z = 0; z < SIZE; z++) {
            const p = project([x, y, z], w, h);
            expect(p.x).toBeGreaterThan(0);
            expect(p.x).toBeLessThan(w);
            expect(p.y).toBeGreaterThan(0);
            expect(p.y).toBeLessThan(h);
            expect(p.depth).toBeGreaterThan(0.5);
          }
        }
      }
    }
  });
});

describe('Doors Help (spec §4)', () => {
  it('has a contents for every guide, and the desktop and settings among them', () => {
    expect(SECTIONS.some((s) => s.id === 'desktop')).toBe(true);
    for (const t of TOPICS) expect(SECTIONS.some((s) => s.id === t.section), t.id).toBe(true);
    for (const id of ['desktop', 'settings', 'shortcuts']) expect(TOPIC[id], id).toBeDefined();
  });

  it('indexes every guide and every question it answers', () => {
    for (const t of TOPICS) {
      expect(INDEX_ENTRIES.some((e) => e.text === t.title && e.topic === t.id), t.title).toBe(true);
      for (const q of t.questions) expect(INDEX_ENTRIES.some((e) => e.text === q && e.topic === t.id), q).toBe(true);
    }
    const sorted = [...INDEX_ENTRIES].map((e) => e.text);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b)));
  });

  it('answers questions about the new features', () => {
    expect(ask('how do I change the wallpaper')[0]?.id).toBe('settings');
    expect(ask('what is ironman')[0]?.id).toBe('settings');
    expect(ask('keyboard shortcuts')[0]?.id).toBe('shortcuts');
    expect(ask('how do I turn on the CRT effect')[0]?.id).toBe('settings');
  });
});

describe('bounded memory for games that run for ever (spec §19 Phase 11)', () => {
  const prices = (n: number, day: number) => {
    const at = (f: (i: number) => number) => Float64Array.from({ length: n }, (_, i) => f(i));
    return { open: at((i) => 10 + i + (day % 7) * 0.1), high: at((i) => 11 + i + (day % 5) * 0.1), low: at((i) => 9 + i), close: at((i) => 10 + i + (day % 11) * 0.05), volume: at((i) => 1000 * (i + 1) + day) };
  };
  /** `days` consecutive weekdays from a Monday, then IPOs and a split, as the engine would do them. */
  function play(h: HistoryState, days: number, ipos: number[], recut: boolean): HistoryState {
    let day = START_DAY;
    for (let d = 0; d < days; d++) {
      while ([0, 6].includes(new Date(day * 86_400_000).getUTCDay())) day++;
      recordDay(h, day, prices(h.count, day), [1, 2, 3, 4]);
      if (ipos.includes(d)) {
        addToHistory(h, 25 + d);
        if (recut) h = unpackHistory(packHistory(h));
      }
      if (d === 40) splitHistory(h, 2, 4);
      day++;
    }
    return h;
  }

  it('adds companies without re-cutting the arrays each time, and saves exactly what re-cutting each time would', () => {
    const ipos = [3, 9, 10, 27, 44, 45, 46, 70, 71, 88, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140];
    const spare = play(createHistory(5), 260, ipos, false);
    const legacy = play(createHistory(5), 260, ipos, true);
    expect(spare.count).toBe(5 + ipos.length);
    // Spare columns: the arrays are wider than the companies, and re-cut only when the spare run out.
    expect(spare.stride!).toBeGreaterThan(spare.count);
    expect(legacy.stride).toBe(legacy.count);
    const saved = packHistory(spare);
    expect(saved).toEqual(packHistory(legacy));
    expect('stride' in saved).toBe(false);
    expect(saved.close.length).toBe(RING_DAYS * spare.count);
    // Reading gives the same too, for old companies and new.
    for (const c of [0, 2, 5, 6, spare.count - 1]) {
      expect(dailyBars(spare, c, 960)).toEqual(dailyBars(legacy, c, 960));
      expect(weeklyCloses(spare, c)).toEqual(weeklyCloses(legacy, c));
    }
    const w = spare.weekDays.length - 1;
    expect(weekCloses(spare, w)).toEqual(weekCloses(legacy, w));
    expect(weekCloses(spare, w).length).toBe(spare.count);
    const holdings = [{ company: 1, shares: 10 }, { company: spare.count - 1, shares: 3 }];
    expect(weeklyValues(spare, holdings)).toEqual(weeklyValues(legacy, holdings));
    // A loaded game starts with none spare, and plays on the same.
    const loaded = unpackHistory(structuredClone(saved));
    expect(loaded.stride).toBe(loaded.count);
    for (const h of [loaded, spare]) recordDay(h, START_DAY + 400, prices(h.count, 400), [1, 2, 3, 4]);
    expect(packHistory(loaded)).toEqual(packHistory(spare));
  });

  it('keeps the newest twenty years of weekly closes, however long the game runs', () => {
    const h = createHistory(3);
    const weekEnds: number[] = [];
    let day = START_DAY;
    // 1,100 weeks of Monday to Friday sessions (holidays aside, which the engine skips and this does not).
    for (let w = 0; w < MAX_WEEKS + 60; w++, day += 2) {
      for (let d = 0; d < 5; d++, day++) {
        recordDay(h, day, prices(3, day), [1, 2, 3, 4]);
        if (endsWeek(day)) weekEnds.push(day);
      }
    }
    expect(weekEnds.length).toBeGreaterThan(MAX_WEEKS + 60);
    expect(h.weekDays).toEqual(weekEnds.slice(-MAX_WEEKS));
    expect(h.weekly.length).toBe(MAX_WEEKS * 3);
    expect(weeklyCloses(h, 1).map(([d]) => d)).toEqual(weekEnds.slice(-MAX_WEEKS));
    const back = unpackHistory(structuredClone(packHistory(h)));
    expect(weeklyCloses(back, 2)).toEqual(weeklyCloses(h, 2));
  });

  const order = (id: number, status: Order['status']) => ({ id, status }) as Order;
  it('drops the oldest closed orders, ledger lines and closed positions beyond what the books keep, and never an open order', () => {
    const account = { orders: [] as Order[], ledger: [] as unknown[], closed: [] as unknown[] } as unknown as Account;
    for (let id = 1; id <= KEEP.orders + 100; id++) account.orders.push(order(id, 'filled'));
    // Within a tenth of the limit: left alone (the arrays are re-cut rarely).
    expect(pruneBooks(account)).toBe(false);
    for (let id = KEEP.orders + 101; id <= KEEP.orders + 400; id++) account.orders.push(order(id, id === KEEP.orders + 250 || id === 3 ? 'open' : 'cancelled'));
    account.orders.splice(2, 0, order(3, 'open'));
    account.orders.splice(3, 1);
    expect(pruneBooks(account)).toBe(true);
    const open = account.orders.filter((o) => o.status === 'open').map((o) => o.id);
    expect(open).toEqual([3, KEEP.orders + 250]);
    const closed = account.orders.filter((o) => o.status !== 'open');
    expect(closed).toHaveLength(KEEP.orders);
    expect(closed.at(-1)!.id).toBe(KEEP.orders + 400);
    // Oldest first, still in order.
    expect(account.orders.map((o) => o.id)).toEqual([...account.orders.map((o) => o.id)].sort((a, b) => a - b));
    expect(pruneBooks(account)).toBe(false);

    for (let k = 0; k < KEEP.ledger * 1.2; k++) account.ledger.push(k as never);
    for (let k = 0; k < KEEP.closed * 1.2; k++) account.closed.push(k as never);
    expect(pruneBooks(account)).toBe(true);
    expect(account.ledger).toHaveLength(KEEP.ledger);
    expect(account.ledger.at(-1)).toBe(KEEP.ledger * 1.2 - 1);
    expect(account.closed).toHaveLength(KEEP.closed);
  });
});

describe('a company that lists (spec §11.6)', () => {
  it('has the event rate every company has, whether the rates are added to or worked out afresh', () => {
    const world = generateWorld({ seed: 'phase 11 listing', companyCount: 1000 });
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Listing Capital' });
    const other = generateWorld({ seed: 'someone else', companyCount: 1000 });
    for (const [tier, k] of [[1, 3], [2, 500], [4, 900]]) e.addCompany(other.companies[k].genome, tier, 20 + k / 100, 22);
    const rates = (e as unknown as { eventRate: Float64Array }).eventRate;
    const state = e.exportState();
    expect(rates.length).toBe(1003);
    expect(Array.from(rates)).toEqual(Array.from(eventRates(e.companies, state.world.tiers, e.settings.events)));
  });
});

describe('a save made after the close (spec §18)', () => {
  // Found by the ten-year run: the index level published at the last bar was not saved, and prices that moved after it
  // (competitors trade at the week's close) left it a little different from what a loaded game worked out afresh, so the two
  // disagreed about the index in the morning's mail, and about yesterday's close, for ever after.
  it('plays on as the game that was not saved does, even when prices moved after the last bar', () => {
    const world = generateWorld({ seed: 'phase 11 close', companyCount: 1000 });
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Close Capital' });
    let day = nextTradingDay(dayOf(e.time));
    for (let n = 0; n < 3; n++, day = nextTradingDay(day)) e.advanceTo(at(day, 16 * 60));
    const market = (e as unknown as { market: { push(i: number, f: number): void; indexLevel: number; computeIndex(): number; state: { index: { members: Int32Array } } } }).market;
    for (const member of market.state.index.members.slice(0, 20)) market.push(member, 0.04);
    // The published level is the last bar's; the prices have moved since.
    expect(market.indexLevel).not.toBe(market.computeIndex());
    const manifest = { format: 'majorsoft-doors-98-save', version: SAVE_VERSION, name: 't', firmName: 'Close Capital', gameTime: e.time, netWorth: 0, savedAt: 0 } as const;
    const twin = Engine.restore(migrate(unpackSave(packSave({ manifest, sim: e.exportState() }))).sim as SimState);
    for (const x of [e, twin]) x.advanceTo(at(day, 16 * 60));
    expect(difference(e.exportState(), twin.exportState())).toBeUndefined();
  });
});
