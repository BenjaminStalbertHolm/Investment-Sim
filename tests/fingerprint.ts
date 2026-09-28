import { createHash } from 'node:crypto';
import { START_DAY, at, nextTradingDay } from '../src/sim/calendar';
import { Engine, type SimState } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import type { World } from '../src/world/generator';

/**
 * A digest of a state: objects by sorted key (undefined values skipped, as `difference` treats them), typed arrays by
 * their bytes. Two states with the same digest are the same state.
 */
export function digest(state: unknown): string {
  const hash = createHash('sha256');
  const walk = (v: unknown): void => {
    if (ArrayBuffer.isView(v)) {
      hash.update(`<${v.constructor.name}:${v.byteLength}>`);
      hash.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      return;
    }
    if (Array.isArray(v)) {
      hash.update('[');
      for (const x of v) {
        walk(x);
        hash.update(',');
      }
      hash.update(']');
      return;
    }
    if (typeof v === 'object' && v !== null) {
      hash.update('{');
      for (const key of Object.keys(v).sort()) {
        const x = (v as Record<string, unknown>)[key];
        if (x === undefined) continue;
        hash.update(JSON.stringify(key));
        hash.update(':');
        walk(x);
        hash.update(',');
      }
      hash.update('}');
      return;
    }
    hash.update(typeof v === 'number' && Number.isNaN(v) ? 'NaN' : JSON.stringify(v) ?? 'undefined');
  };
  walk(state);
  return hash.digest('hex');
}

/**
 * The fingerprint scenario (Phase 10B, spec §16C: "with a module off, the simulation behaves exactly as if it didn't
 * exist"): a medium game played for 130 trading days with the same actions every time — trades, a short, a loan, a fund,
 * mandates, staff, a luxury, lotto tickets and an IPO application. Its digest was recorded on the Phase 10 build, before
 * any module existed. It must never change.
 */
export function fingerprintRun(world: World, settings = DIFFICULTIES.medium): Engine {
  const e = Engine.create(world, { settings, firmName: 'Fingerprint Capital' });
  let day = START_DAY;
  for (let s = 0; s < 130; s++, day = nextTradingDay(day)) {
    e.advanceTo(at(day, 10 * 60 + 30));
    const i = (s * 41) % world.companies.length;
    if (s % 3 === 0 && !e.market.state.status[i]) e.placeOrder({ company: i, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    if (s % 8 === 5) {
      const p = e.positions().find((x) => x.shares > 0);
      if (p) e.placeOrder({ company: p.company, side: 'sell', type: 'market', shares: Math.ceil(p.shares / 2), tif: 'day' });
    }
    if (s === 7 && !e.market.state.status[9]) e.placeOrder({ company: 9, side: 'short', type: 'market', shares: 100, tif: 'day' });
    if (s === 12) e.takeLoan(200_000, 'amortising', 12);
    if (s % 10 === 4) e.tradeFund(s % 41, 50);
    if (s % 15 === 9) {
      const offer = e.mail().messages.find((m) => m.kind === 'offer' && !m.answer);
      if (offer) e.mailAction(offer.id, 'accept');
    }
    if (s === 2) e.staffAction({ do: 'hire', id: e.staff().people.find((p) => p.status === 'applicant')!.id });
    if (s === 20) e.lifestyleAction({ do: 'buyAsset', asset: 'art' });
    if (s % 5 === 1) e.lifestyleAction({ do: 'lotto', count: 3 });
    if (s % 20 === 11) {
      const ipo = e.ipos().pending.find((p) => p.company === undefined && !p.applied);
      if (ipo) e.ipoAction({ do: 'apply', id: ipo.id, shares: Math.min(300, Math.floor(ipo.offered / 10)) });
    }
    e.advanceTo(at(day, 16 * 60));
  }
  return e;
}

/** What later phases added to a state: Phase 10B's modules (their state and streams), and Phase 11's saved index level. Everything else must be as before. */
export function withoutModules(state: SimState): unknown {
  const { modules: _m, ...rest } = state as SimState & { modules?: unknown };
  const { geo: _g, period: _p, gags: _x, ...rng } = rest.rng as Record<string, unknown>;
  // Phase 11 saves the index level published at the last bar (`market.index.level`): the Phase 10 build had it as a field
  // that was not saved, so the recorded digests have nothing to compare it with.
  const { level: _l, ...index } = rest.market.index;
  return { ...rest, rng, market: { ...rest.market, index } };
}
