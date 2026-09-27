import { beforeAll, describe, expect, it } from 'vitest';
import { firmAum, firmAums } from '../src/sim/competitors';
import { Engine } from '../src/sim/engine';
import { FUNDS } from '../src/sim/data/funds';
import { STRATEGIES } from '../src/sim/data/competitors';
import { DIFFICULTIES } from '../src/sim/settings';
import type { Strategy } from '../src/world/presetFirms';

// Spec §19, Phase 8: "Competitors' AUM diverges plausibly by strategy over 5 simulated years (headless test)."

const YEARS = 5;
let e: Engine;
let start: number[];
beforeAll(() => {
  e = Engine.newGame({ seed: 'rivals', companyCount: 1000, settings: DIFFICULTIES.medium, firmName: 'Idle Capital' });
  start = firmAums(e);
  e.runSessions(252 * YEARS);
}, 120_000);

const log = Math.log;
const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

/** Each firm: strategy, assets then and now, growth of a unit of its fund, and the weekly volatility of that. */
const firms = () =>
  e.directory().firms.map((firm, f) => {
    const book = e.s.competitors.books[f];
    const units = book.history.map((h) => h[2]);
    const weekly = units.slice(1).map((u, k) => log(u / units[k]));
    return {
      name: firm.name,
      strategy: firm.strategy as Strategy,
      start: start[f],
      aum: firmAum(e, f),
      unit: firmAum(e, f) / book.units,
      clients: book.units / book.history[0][1],
      vol: sd(weekly) * Math.sqrt(52),
      weeks: book.history.length,
    };
  });

describe('competitor AI over five simulated years (spec §16)', () => {
  it('keeps every fund solvent and records it week by week', () => {
    for (const f of firms()) {
      expect(Number.isFinite(f.aum) && f.aum > 0, f.name).toBe(true);
      expect(f.unit, f.name).toBeGreaterThan(0.2);
      expect(f.weeks, f.name).toBeGreaterThan(52 * YEARS - 5);
    }
  });

  it('has index firms track the MAJOR 500 fund and gather money whatever happens', () => {
    const index = firms().filter((f) => f.strategy === 'index');
    expect(index.length).toBeGreaterThanOrEqual(2);
    // MJR is the MAJOR 500's total return less its fee; the index firms hold large and mid caps, for a smaller fee.
    const mjr = e.fundPrice(0) / FUNDS[0].launch;
    for (const f of index) {
      expect(Math.abs(log(f.unit / mjr)), f.name).toBeLessThan(0.1);
      // Steady inflows: their assets grew by more than their returns.
      expect(f.clients, f.name).toBeGreaterThan(1.2);
    }
  });

  it('spreads active firms’ results far wider than the index firms’', () => {
    const all = firms();
    const index = all.filter((f) => f.strategy === 'index').map((f) => log(f.unit));
    const active = all.filter((f) => f.strategy !== 'index').map((f) => log(f.unit));
    expect(sd(active)).toBeGreaterThan(0.2);
    expect(sd(active)).toBeGreaterThan(5 * sd(index));
    // And so their assets: the largest and smallest changes are far apart.
    const growth = all.map((f) => f.aum / f.start);
    expect(Math.max(...growth) / Math.min(...growth)).toBeGreaterThan(3);
  });

  it('differs by strategy: results, and risk in line with how each invests', () => {
    const all = firms();
    const byStrategy = new Map<Strategy, number[]>();
    for (const f of all) byStrategy.set(f.strategy, [...(byStrategy.get(f.strategy) ?? []), log(f.unit)]);
    const means = [...byStrategy.values()].map(mean);
    expect(Math.max(...means) - Math.min(...means)).toBeGreaterThan(0.3);
    // A balanced fund, 40% in cash, swings less than the market; index funds swing like it.
    const vol = (s: Strategy) => mean(all.filter((f) => f.strategy === s).map((f) => f.vol));
    if (byStrategy.has('balanced')) expect(vol('balanced')).toBeLessThan(0.8 * vol('index'));
    expect(vol('index')).toBeGreaterThan(0.1);
    expect(vol('index')).toBeLessThan(0.3);
  });

  it('moves client money towards the firms that beat the index', () => {
    // Firms that chase performance: their clients' units grew with their returns.
    const active = firms().filter((f) => STRATEGIES[f.strategy].chase >= 0.5);
    const rank = (xs: number[]) => xs.map((x) => xs.filter((y) => y < x).length);
    const a = rank(active.map((f) => f.unit));
    const b = rank(active.map((f) => f.clients));
    const n = active.length;
    const rho = 1 - (6 * a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0)) / (n * (n * n - 1));
    expect(rho).toBeGreaterThan(0.5);
  });

  it('publishes a league table each year and files holdings 45 days after each quarter', () => {
    const { tables } = e.league();
    expect(tables.map((t) => t.year)).toEqual([1998, 1999, 2000, 2001, 2002]);
    for (const t of tables) {
      expect(t.rows).toHaveLength(e.directory().firms.length + 1);
      expect(t.rows.some((r) => r.firm === -1)).toBe(true);
      for (let k = 1; k < t.rows.length; k++) expect(t.rows[k].ret).toBeLessThanOrEqual(t.rows[k - 1].ret);
    }
    expect(e.news({ kinds: ['league'] })).toHaveLength(YEARS);
    const today = Math.floor(e.time / 1440);
    for (let f = 0; f < e.directory().firms.length; f++) {
      const view = e.firm(f);
      expect(today - view.filed, e.directory().firms[f].name).toBeGreaterThanOrEqual(45);
      expect(today - view.filed).toBeLessThan(45 + 100);
      expect(view.history[0][1]).toBe(1);
    }
  });
});
