import { expect, it } from 'vitest';
import { LOGO_MOTIFS, PALETTES } from '../src/art/logo/options';
import { CLOTHING } from '../src/art/portrait/options';
import { TIERS, generateWorld } from '../src/world/generator';
import { INDUSTRIES } from '../src/world/industries';
import { Rng } from '../src/world/rng';

// Spec §19, Phase 2: "names are coherent per industry (spot-check test prints 20 random companies per industry)".
// The print goes to a file snapshot, so it can be read in the repo and any lexicon change shows up in the diff.
it('prints 20 random companies per industry', async () => {
  const world = generateWorld({ seed: 'spot-check' });
  const rng = Rng.stream('spot-check', 'sample');
  const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
  const lines: string[] = [];
  for (const industry of INDUSTRIES) {
    const ids = world.companies.flatMap((c, i) => (c.industry === industry ? [i] : []));
    lines.push(`${industry.name} — ${ids.length} companies`);
    for (const i of rng.shuffle(ids).slice(0, 20).sort((a, b) => a - b)) {
      const c = world.companies[i];
      lines.push(
        [
          `  ${c.ticker.padEnd(4)}`,
          c.name.padEnd(38),
          c.subIndustry.padEnd(26),
          `${c.hq.name}, ${c.hq.country}`.padEnd(32),
          TIERS[world.tiers[i]].name.padEnd(5),
          money(c.marketCap).padStart(8),
          `$${c.price.toFixed(2)}`.padStart(9),
          `  ${c.ceo.firstName} ${c.ceo.lastName}, ${c.ceo.age}, ${CLOTHING[c.genes.clothing]}`.padEnd(40),
          `${LOGO_MOTIFS[c.genes.logoMotif]} on ${PALETTES[c.genes.logoPalette].id}`,
        ].join(' '),
      );
    }
    lines.push('');
  }
  await expect(lines.join('\n')).toMatchFileSnapshot('__snapshots__/world-spotcheck.txt');
});
