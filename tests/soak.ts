import v8 from 'node:v8';
import vm from 'node:vm';
import { START_DAY, at, dayOf, nextTradingDay } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES, type GameSettings } from '../src/sim/settings';
import { SAVE_FORMAT, packSave } from '../src/state/saveFile';
import { SAVE_VERSION } from '../src/state/migrations';

/**
 * The long-run scenario (Phase 11, spec §19: "10 simulated years headless without errors or unbounded memory growth").
 * A player who never stops: trades every few sessions, buys and sells funds, accepts mandates, buys lottery tickets and
 * signs a small loan now and then, in a world with every fun module on so that nothing is left out of the count.
 */
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

export interface YearReport {
  year: number;
  /** Real seconds this year took. */
  seconds: number;
  /** Heap in use after a full collection, MB. */
  heapMB: number;
  /** The exported state as JSON, MB (typed arrays counted by their bytes), and the biggest parts of it. */
  stateMB: number;
  /** A .d98 of the game as it stands, MB (spec §18: under 25 MB). */
  saveMB: number;
  biggest: Record<string, number>;
}

/** Size in bytes of a value as it would be saved: typed arrays by their bytes, everything else as JSON. */
export function sizeOf(value: unknown): number {
  let bytes = 0;
  const json = JSON.stringify(value, (_k, v) => {
    if (ArrayBuffer.isView(v)) {
      bytes += v.byteLength;
      return 0;
    }
    return v;
  });
  return (json?.length ?? 0) + bytes;
}

export function report(e: Engine, year: number, seconds: number): YearReport {
  gc();
  const heapMB = process.memoryUsage().heapUsed / 1e6;
  const state = e.exportState() as unknown as Record<string, unknown>;
  const parts = Object.entries(state).map(([k, v]) => [k, sizeOf(v) / 1e6] as const).sort((a, b) => b[1] - a[1]);
  const manifest = { format: SAVE_FORMAT, version: SAVE_VERSION, name: 'soak', firmName: e.firmName, gameTime: e.time, netWorth: 0, savedAt: 0 } as const;
  const saveMB = packSave({ manifest, sim: state as never }).byteLength / 1e6;
  return { year, seconds, heapMB, stateMB: parts.reduce((a, [, mb]) => a + mb, 0), saveMB, biggest: Object.fromEntries(parts.slice(0, 8).map(([k, mb]) => [k, +mb.toFixed(2)])) };
}

export const soakSettings = (base: GameSettings = DIFFICULTIES.medium): GameSettings => ({
  ...base,
  modules: { geopolitics: true, periodEvents: true, gags: true },
});

/** Plays `years` years (about 252 sessions each), calling `after` at each year's end. */
export function soak(e: Engine, years: number, after: (year: number, seconds: number) => void, tick?: (session: number) => void, skipYears = 0): void {
  // Continue where a game stands: the day after the clock's, and a session count that keeps the routine's pattern going.
  let day = skipYears ? nextTradingDay(dayOf(e.time)) : START_DAY;
  let session = skipYears * 252;
  for (let y = 1; y <= years; y++) {
    const started = performance.now();
    for (let n = 0; n < 252; n++, session++, day = nextTradingDay(day)) {
      e.advanceTo(at(day, 10 * 60 + 30));
      if (e.bankrupt) throw new Error(`The firm went bankrupt in year ${y}`);
      const i = (session * 41) % e.market.state.status.length;
      if (session % 4 === 0 && !e.market.state.status[i]) e.placeOrder({ company: i, side: 'buy', type: 'market', shares: 50, tif: 'day' });
      if (session % 9 === 5) {
        // A book of about thirty names: past that, the oldest holding is sold out, otherwise half of it.
        const held = e.positions().filter((x) => x.shares > 0);
        const p = held[0];
        if (p) e.placeOrder({ company: p.company, side: 'sell', type: 'market', shares: held.length > 30 ? p.shares : Math.ceil(p.shares / 2), tif: 'day' });
      }
      if (session % 30 === 7) e.tradeFund(session % 41, session % 60 === 7 ? 40 : -20);
      if (session % 12 === 3) {
        const offer = e.mail().messages.find((m) => m.kind === 'offer' && !m.answer);
        if (offer) e.mailAction(offer.id, 'accept');
      }
      if (session % 7 === 1) e.lifestyleAction({ do: 'lotto', count: 2 });
      tick?.(session);
      e.advanceTo(at(day, 16 * 60));
    }
    after(y, (performance.now() - started) / 1000);
  }
}
