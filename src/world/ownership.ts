import type { Company } from './company';
import { FIRM_NOUNS, FIRM_PLACES, FIRM_SUFFIXES, FIRM_TEMPLATES } from './lexicons/firms';
import { LAST_NAMES } from './people-names';
import { PRESET_FIRMS, type Strategy } from './presetFirms';
import { Rng } from './rng';

export interface Firm {
  id: string;
  name: string;
  strategy: Strategy;
  preset: boolean;
}

/** A line of a company's institutional holders table. */
export interface Holding {
  company: number;
  /** Index into the world's firms. */
  firm: number;
  shares: number;
}

export interface Ownership {
  /** Sorted by company, largest holder first. */
  holdings: Holding[];
  /** Per company, as fractions of shares outstanding. */
  insiderPct: number[];
  /** Shares outstanding less insiders and holders of 10% or more. */
  floatPct: number[];
}

const GENERATED_STRATEGIES: Strategy[] = ['value', 'momentum', 'growth', 'activist', 'macro', 'quant', 'balanced', 'stockPicking'];

/** Competitors (spec §6, §16): the presets the player didn't pick, then generated firms. */
export function competitorFirms(seed: string, options: { playerFirm?: string; competitorCount?: number }): Firm[] {
  const rng = Rng.stream(seed, 'competitors');
  const firms: Firm[] = PRESET_FIRMS.filter((f) => f.id !== options.playerFirm).map(({ id, name, strategy }) => ({ id, name, strategy, preset: true }));
  const count = Math.min(20, Math.max(0, options.competitorCount ?? firms.length + rng.int(4, 8)));
  firms.length = Math.min(firms.length, count);
  while (firms.length < count) {
    const name = firmName(rng);
    const id = name.toLowerCase().replace(/[^a-z]/g, '');
    if (!firms.some((f) => f.id === id)) firms.push({ id, name, strategy: rng.pick(GENERATED_STRATEGIES), preset: false });
  }
  return firms;
}

function firmName(rng: Rng): string {
  const template = rng.pick(FIRM_TEMPLATES);
  return template.replace(/\{(\w+)\}/g, (_, slot: string) => {
    if (slot === 'place') return rng.pick(FIRM_PLACES);
    if (slot === 'noun') return rng.pick(FIRM_NOUNS);
    if (slot === 'surname') return rng.pick(LAST_NAMES);
    // "Hallvard & Birch Partners", not "Hallvard & Birch & Co."
    return rng.pick(template.includes('&') ? FIRM_SUFFIXES.filter((s) => !s.startsWith('&')) : FIRM_SUFFIXES);
  });
}

/** Insider range by tier (Mega … Nano): the smaller the company, the more its founders still own. */
const INSIDERS: readonly (readonly [number, number])[] = [
  [0.001, 0.04], [0.005, 0.08], [0.01, 0.15], [0.03, 0.25], [0.05, 0.4], [0.1, 0.6],
];

/** Who owns what at the start (spec §10.5). `tiers` gives each company's index into generator.ts TIERS. */
export function generateOwnership(
  seed: string,
  companies: readonly Company[],
  tiers: readonly number[],
  firms: readonly Firm[],
): Ownership {
  const rng = Rng.stream(seed, 'ownership');
  const insiderPct = tiers.map((t) => rng.range(...INSIDERS[t]));
  const held = tiers.map(() => 0);
  const blocks = tiers.map(() => 0); // stakes of 10% or more, which are not part of the float
  const stakes = new Map<number, number>(); // company * 32 + firm → fraction held
  const stake = (company: number, firm: number, pct: number) => {
    const key = company * 32 + firm;
    const size = Math.min(pct, 0.95 - insiderPct[company] - held[company]);
    if (size < 0.005 || stakes.has(key)) return;
    stakes.set(key, size);
    held[company] += size;
    if (size >= 0.1) blocks[company] += size;
  };
  const inTiers = (...wanted: number[]) => tiers.flatMap((t, i) => (wanted.includes(t) ? [i] : []));
  const index = firms.flatMap((f, i) => (f.strategy === 'index' ? [i] : []));
  const active = firms.flatMap((f, i) => (f.strategy === 'index' ? [] : [i]));

  if (active.length) {
    // About 2% of small and micro caps are majority-owned subsidiaries of a competitor.
    for (const c of inTiers(3, 4)) {
      if (!rng.chance(0.02)) continue;
      insiderPct[c] /= 4;
      stake(c, rng.pick(active), rng.range(0.51, 0.8));
    }
    // Some large caps have a strategic 10–30% holder.
    for (const c of inTiers(0, 1)) if (rng.chance(0.1)) stake(c, rng.pick(active), rng.range(0.1, 0.3));
  }
  // Index funds hold 3–8% of most large and mid caps, each fund at its own typical size.
  const indexed = inTiers(0, 1, 2);
  for (const f of index) {
    const size = rng.range(0.035, 0.075);
    for (const c of indexed) if (rng.chance(0.92)) stake(c, f, Math.min(0.08, Math.max(0.03, size * rng.range(0.85, 1.15))));
  }
  // Active firms hold concentrated stakes in some small and mid caps.
  const pool = inTiers(2, 3);
  for (const f of active) {
    const picks = new Set<number>();
    const n = Math.min(pool.length, rng.int(12, 40));
    while (picks.size < n) picks.add(rng.pick(pool));
    for (const c of picks) stake(c, f, 0.01 + 0.085 * rng.float() ** 2);
  }

  const holdings = [...stakes]
    .map(([key, pct]) => {
      const company = Math.floor(key / 32);
      return { company, firm: key % 32, shares: Math.round(pct * companies[company].sharesOutstanding) };
    })
    .sort((a, b) => a.company - b.company || b.shares - a.shares);
  return { holdings, insiderPct, floatPct: insiderPct.map((p, c) => 1 - p - blocks[c]) };
}
