import { describe, expect, it } from 'vitest';
import { at, dayOf, nextTradingDay } from '../src/sim/calendar';
import { Engine, type SimState } from '../src/sim/engine';
import { KEEP } from '../src/sim/account';
import { MAX_WEEKS } from '../src/sim/history';
import { SAVE_VERSION, migrate } from '../src/state/migrations';
import { SAVE_FORMAT, packSave, unpackSave } from '../src/state/saveFile';
import { generateWorld } from '../src/world/generator';
import { report, soak, soakSettings, type YearReport } from './soak';
import { difference } from './util';

// Phase 11 (spec §19): "10 simulated years headless without errors or unbounded memory growth". The light test runs in
// every `npm test`, in a small market; the full one — 10,000 companies, ten years, every module on, about ten minutes —
// runs with `npm run soak`.

const FIRM = 'Soak Capital';

/** A save of the game as it stands, loaded into a second engine: what a player who saves and comes back plays on from. */
function reloaded(e: Engine): Engine {
  const manifest = { format: SAVE_FORMAT, version: SAVE_VERSION, name: 'soak', firmName: FIRM, gameTime: e.time, netWorth: 0, savedAt: 0 } as const;
  const bytes = packSave({ manifest, sim: e.exportState() });
  return Engine.restore(migrate(unpackSave(bytes)).sim as SimState);
}

/** Ten more sessions with nothing done, so that any difference is the engines' own. */
function idle(e: Engine, sessions = 10): void {
  let day = nextTradingDay(dayOf(e.time));
  for (let s = 0; s < sessions; s++, day = nextTradingDay(day)) e.advanceTo(at(day, 16 * 60));
}

/** Nothing is NaN, nothing has run away, and the books are the size they should be. */
function sane(e: Engine): void {
  expect(Number.isFinite(e.netWorth())).toBe(true);
  expect(e.bankrupt).toBe(false);
  const state = e.exportState();
  for (const key of ['lnP', 'lnV'] as const) for (const v of state.market[key]) if (!Number.isFinite(v)) throw new Error(`${key} is ${v}`);
  expect(state.account.orders.length).toBeLessThan(KEEP.orders * 1.1 + 100);
  expect(state.history.weekDays.length).toBeLessThanOrEqual(MAX_WEEKS);
  expect(state.history.weekly.length).toBe(state.history.weekDays.length * state.history.count);
  expect(state.history.count).toBe(e.directory().tickers.length);
}

/** Growth per year between two years' reports. */
const slope = (r: YearReport[], key: 'heapMB' | 'stateMB', from: number, to: number) => (r[to - 1][key] - r[from - 1][key]) / (to - from);

describe('a long game in a small market', () => {
  it('plays three years with every module on, saves and loads at the end, and plays on identically', () => {
    const world = generateWorld({ seed: 'soak light', companyCount: 1000 });
    const e = Engine.create(world, { settings: soakSettings(), firmName: FIRM });
    const reports: YearReport[] = [];
    soak(e, 3, (y, s) => reports.push(report(e, y, s)));
    sane(e);
    // The state grows with the archives, not faster and faster.
    expect(reports[2].stateMB - reports[1].stateMB).toBeLessThan(1.5 * (reports[1].stateMB - reports[0].stateMB) + 0.1);
    const twin = reloaded(e);
    idle(e);
    idle(twin);
    expect(difference(e.exportState(), twin.exportState())).toBeUndefined();
  }, 240_000);
});

describe.skipIf(!process.env.SOAK)('ten simulated years, 10,000 companies (npm run soak)', () => {
  it('runs to the end without errors, in bounded memory and steady time', () => {
    const e = Engine.newGame({ seed: 'soak', settings: soakSettings(), firmName: FIRM });
    const reports: YearReport[] = [];
    soak(e, 10, (y, s) => {
      const r = report(e, y, s);
      reports.push(r);
      console.log(`year ${y}: ${r.seconds.toFixed(1)} s, heap ${r.heapMB.toFixed(0)} MB, state ${r.stateMB.toFixed(1)} MB, save ${r.saveMB.toFixed(1)} MB`);
    });
    sane(e);

    // Memory (spec §11.3: under 300 MB): what the games' archives add each year does not grow.
    const last = reports[9];
    expect(last.heapMB).toBeLessThan(300);
    expect(slope(reports, 'heapMB', 6, 10)).toBeLessThan(1.25 * slope(reports, 'heapMB', 2, 6) + 2);
    expect(slope(reports, 'stateMB', 6, 10)).toBeLessThan(1.25 * slope(reports, 'stateMB', 2, 6) + 0.5);
    // The rolling window and the books are what they should be.
    const state = e.exportState();
    expect(state.history.weekDays.length).toBeGreaterThan(500);
    expect(state.history.weekDays.length).toBeLessThanOrEqual(MAX_WEEKS);
    // Time: a year takes about as long in year ten as in year one (a spare-column IPO, a bounded book, no rescans).
    expect(last.seconds).toBeLessThan(1.5 * reports[0].seconds);
    // A save at the end of it loads and plays on as the game would.
    const twin = reloaded(e);
    idle(e);
    idle(twin);
    expect(difference(e.exportState(), twin.exportState())).toBeUndefined();
  }, 3_600_000);
});
