import { beforeAll, describe, expect, it } from 'vitest';
import { LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES } from '../src/art/logo/options';
import { decodeCompany, tickerFor, type Company } from '../src/world/company';
import { decodeGenome, encodeGenome, type Gene } from '../src/world/genome';
import { TIERS, generateWorld, type World } from '../src/world/generator';
import { INDUSTRIES } from '../src/world/industries';
import type { Holding } from '../src/world/ownership';
import { PRESET_FIRMS } from '../src/world/presetFirms';
import { TOP100 } from '../src/world/top100';

const SEED = 'Majorsoft Doors 98';
let world: World;
let elapsed: number;

beforeAll(() => {
  generateWorld({ seed: 'warm-up', companyCount: 1000 });
  const start = performance.now();
  world = generateWorld({ seed: SEED });
  elapsed = performance.now() - start;
});

const tierCounts = (w: World) => TIERS.map((_, t) => w.tiers.filter((x) => x === t).length);
const pct = (h: Holding) => h.shares / world.companies[h.company].sharesOutstanding;

describe('world generation (spec §10)', () => {
  it('generates 10,000 companies in under 1.5 s', () => {
    expect(world.companies).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(1500);
  });

  it('round-trips every genome', () => {
    for (const company of world.companies) {
      expect(encodeGenome(decodeGenome(company.genome))).toBe(company.genome);
      expect(decodeCompany(company.genome)).toEqual(company);
    }
  });

  it('builds the same world from the same seed, and another world from another seed', () => {
    const again = generateWorld({ seed: SEED });
    expect(again.companies.map((c) => c.genome)).toEqual(world.companies.map((c) => c.genome));
    expect(again.firms).toEqual(world.firms);
    expect(again.holdings).toEqual(world.holdings);
    expect(again.insiderPct).toEqual(world.insiderPct);

    const other = generateWorld({ seed: 'another seed' });
    expect(other.companies.filter((c, i) => c.genome === world.companies[i].genome)).toHaveLength(0);
  });

  it('derives tickers from names', () => {
    expect(tickerFor('Ridgepine Timber Co.', 4)).toBe('RDGT');
    expect(tickerFor('KLM Lumber', 3)).toBe('KLM');
    expect(tickerFor('Datatronix', 4)).toBe('DTRN');
    expect(tickerFor('Hallvard & Birch', 4)).toBe('HLVB');
  });

  it('keeps names, tickers and CEOs unique', () => {
    const { companies } = world;
    expect(new Set(companies.map((c) => c.name.toLowerCase())).size).toBe(companies.length);
    expect(new Set(companies.map((c) => c.ticker)).size).toBe(companies.length);
    expect(new Set(companies.map((c) => `${c.ceo.firstName} ${c.ceo.lastName}`)).size).toBe(companies.length);
    for (const c of companies) expect(c.ticker).toMatch(/^[A-Z]{3,4}$/);
  });

  it('fills the market-cap tiers of spec §10.2', () => {
    expect(tierCounts(world)).toEqual([100, 350, 1500, 3500, 3500, 1050]);
    world.companies.forEach((c, i) => {
      const tier = TIERS[world.tiers[i]];
      if (tier.name !== 'Mega') expect(c.marketCap >= tier.min && c.marketCap <= tier.max, c.ticker).toBe(true);
      expect(c.price >= 0.1 && c.price <= 2000, c.ticker).toBe(true);
    });
    // Penny stocks cluster under $5.
    const nano = world.companies.filter((_, i) => world.tiers[i] === 5);
    expect(nano.filter((c) => c.price < 5).length / nano.length).toBeGreaterThan(0.6);
  });

  it('gives every industry at least 60 companies, each within its priors', () => {
    const within = (value: number, [lo, hi]: readonly [number, number]) => value >= lo - 1e-9 && value <= hi + 1e-9;
    for (const industry of INDUSTRIES) {
      expect(world.companies.filter((c) => c.industry === industry).length, industry.id).toBeGreaterThanOrEqual(60);
    }
    for (const c of world.companies) {
      const { priors } = c.industry;
      expect(within(c.founded, priors.founded), `${c.ticker} founded`).toBe(true);
      expect(within(c.volatility, priors.volatility), `${c.ticker} volatility`).toBe(true);
      expect(within(c.beta, priors.beta), `${c.ticker} beta`).toBe(true);
      expect(c.dividendYield === 0 || within(c.dividendYield, priors.dividend), `${c.ticker} dividend`).toBe(true);
      expect(within(c.revenueGrowth, priors.growth), `${c.ticker} growth`).toBe(true);
      expect(within(c.netMargin, priors.margin), `${c.ticker} margin`).toBe(true);
      expect(within(c.leverage, priors.leverage), `${c.ticker} leverage`).toBe(true);
      expect(within(c.quality, [0, 1]) && within(c.ceo.age, [32, 63])).toBe(true);
      expect(c.industry.motifs).toContain(LOGO_MOTIFS[c.genes.logoMotif]);
    }
  });

  it('scales down to a smaller market', () => {
    const small = generateWorld({ seed: SEED, companyCount: 1000 });
    expect(small.companies).toHaveLength(1000);
    expect(tierCounts(small)).toEqual([100, 32, 136, 318, 318, 96]);
    for (const industry of INDUSTRIES) {
      expect(small.companies.filter((c) => c.industry === industry && !c.curated).length).toBeGreaterThanOrEqual(11);
    }
  });
});

describe('curated top 100 (spec §10.6)', () => {
  const IDENTITY: Gene[] = [
    'subIndustry', 'founded', 'hqCity', 'logoShape', 'logoMotif', 'logoPalette', 'logoFont', 'logoLayout',
    'ceoFirstName', 'ceoLastName', 'ceoAge', 'skinTone', 'hair', 'hairColour', 'facialHair', 'eyes', 'eyebrows',
    'nose', 'mouth', 'clothing', 'clothingColour', 'accessory',
  ];
  const identity = (c: Company) => IDENTITY.map((gene) => c.genes[gene]);

  it('comes first, in rank order, sized by $4.5T × rank^-0.75 ± 15%', () => {
    world.companies.slice(0, 100).forEach((c, i) => {
      expect([c.curated, c.name, c.ticker]).toEqual([true, TOP100[i].name, TOP100[i].ticker]);
      const cap = 4.5e12 * (i + 1) ** -0.75;
      expect(c.marketCap, c.ticker).toBeGreaterThan(cap * 0.85 * 0.99);
      expect(c.marketCap, c.ticker).toBeLessThan(Math.min(5e12, cap * 1.15) * 1.01);
    });
    expect(world.companies.slice(100).every((c) => !c.curated)).toBe(true);
  });

  it('has the same identity in every world; only the numbers change', () => {
    const other = generateWorld({ seed: 'another seed', companyCount: 1000 }).companies;
    world.companies.slice(0, 100).forEach((c, i) => {
      expect(identity(other[i]), c.ticker).toEqual(identity(c));
      expect(other[i].genome).not.toBe(c.genome);
    });
  });

  it('keeps the Rhodesia Tobacco Company as it has always been', () => {
    const rtc = world.companies.find((c) => c.ticker === 'RTC')!;
    expect(rtc.hq).toMatchObject({ name: 'Salisbury', country: 'Rhodesia' });
    expect(rtc.founded).toBe(75); // EST. 1923
    expect(LOGO_SHAPES[rtc.genes.logoShape]).toBe('shield');
    expect(LOGO_MOTIFS[rtc.genes.logoMotif]).toBe('leaf');
    expect(LOGO_LAYOUTS[rtc.genes.logoLayout]).toBe('monogram');
    expect(PALETTES[rtc.genes.logoPalette].id).toBe('forestGold');
  });
});

describe('ownership at generation (spec §10.5)', () => {
  it('makes every unchosen preset a competitor, alongside 4–8 generated firms', () => {
    const presets = world.firms.filter((f) => f.preset);
    expect(presets.map((f) => f.id)).toEqual(PRESET_FIRMS.map((f) => f.id));
    expect(world.firms.length - presets.length).toBeGreaterThanOrEqual(4);
    expect(world.firms.length - presets.length).toBeLessThanOrEqual(8);

    const custom = generateWorld({ seed: SEED, companyCount: 1000, playerFirm: 'whiterock', competitorCount: 12 });
    expect(custom.firms).toHaveLength(12);
    expect(custom.firms.map((f) => f.id)).not.toContain('whiterock');
    expect(generateWorld({ seed: SEED, companyCount: 1000, competitorCount: 0 }).holdings).toEqual([]);
  });

  it('has index funds hold 3–8% of most large and mid caps', () => {
    const largeAndMid = world.tiers.filter((t) => t <= 2).length;
    world.firms.forEach((firm, f) => {
      if (firm.strategy !== 'index') return;
      const stakes = world.holdings.filter((h) => h.firm === f);
      expect(stakes.length / largeAndMid).toBeGreaterThan(0.85);
      for (const h of stakes) {
        expect(world.tiers[h.company]).toBeLessThanOrEqual(2);
        expect(pct(h) > 0.0299 && pct(h) < 0.0801).toBe(true);
      }
    });
  });

  it('has active firms hold concentrated small- and mid-cap stakes', () => {
    world.firms.forEach((firm, f) => {
      if (firm.strategy === 'index') return;
      const small = world.holdings.filter((h) => h.firm === f && pct(h) < 0.1);
      expect(small.length).toBeGreaterThanOrEqual(5);
      for (const h of small) expect([2, 3]).toContain(world.tiers[h.company]);
    });
  });

  it('makes about 2% of small and micro caps subsidiaries, and gives some large caps a strategic holder', () => {
    const smallAndMicro = world.tiers.filter((t) => t === 3 || t === 4).length;
    const subsidiaries = world.holdings.filter((h) => pct(h) > 0.5);
    for (const h of subsidiaries) expect([3, 4]).toContain(world.tiers[h.company]);
    expect(subsidiaries.length / smallAndMicro).toBeGreaterThan(0.01);
    expect(subsidiaries.length / smallAndMicro).toBeLessThan(0.03);
    const strategic = world.holdings.filter((h) => pct(h) >= 0.1 && pct(h) <= 0.3 && world.tiers[h.company] <= 1);
    expect(strategic.length).toBeGreaterThan(20);
  });

  it('leaves every company a public float', () => {
    const held = world.companies.map(() => 0);
    for (const h of world.holdings) {
      expect(world.firms[h.firm]).toBeDefined();
      held[h.company] += pct(h);
    }
    world.companies.forEach((c, i) => {
      expect(world.insiderPct[i] + held[i], c.ticker).toBeLessThanOrEqual(0.95 + 1e-6);
      expect(world.floatPct[i], c.ticker).toBeGreaterThanOrEqual(0.05 - 1e-6);
    });
  });
});
