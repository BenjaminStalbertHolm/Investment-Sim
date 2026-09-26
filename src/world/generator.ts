import { LOGO_FONTS, LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES } from '../art/logo/options';
import { ceoGenes } from './ceo';
import { CITIES } from './cities';
import { describeCompany, initials, slotLexicon, templateSlots, type Company } from './company';
import { CURATED_VERSION, GENOME_VERSION, SCALES, encodeGenome, type Genes } from './genome';
import { INDUSTRIES, type Industry } from './industries';
import { BLOCKED_LETTERS, GENERIC_SUFFIXES, NAME_TEMPLATES, RESERVED_NAMES } from './lexicons/shared';
import { competitorFirms, generateOwnership, type Firm, type Ownership } from './ownership';
import { Rng } from './rng';
import { TOP100, type CuratedCompany } from './top100';

export interface WorldOptions {
  seed: string;
  /** Listed companies, 1,000–10,000 (spec §9). Default 10,000. */
  companyCount?: number;
  /** Preset firm the player runs; every other preset becomes a competitor (spec §6). */
  playerFirm?: string;
  /** Competitor firms, 0–20. Default: the unchosen presets plus 4–8 generated firms. */
  competitorCount?: number;
}

export interface World extends Ownership {
  seed: string;
  /** Company id = index: the curated top 100 by rank, then procedural companies from largest tier to smallest. */
  companies: Company[];
  /** Tier of each company when generated (index into TIERS). */
  tiers: number[];
  firms: Firm[];
}

/** Market-cap tiers (spec §10.2). Mega is the curated top 100, whose caps follow their rank. */
export const TIERS = [
  { name: 'Mega', min: 0, max: 0, count: 0 },
  { name: 'Large', min: 10e9, max: 140e9, count: 350 },
  { name: 'Mid', min: 2e9, max: 10e9, count: 1500 },
  { name: 'Small', min: 300e6, max: 2e9, count: 3500 },
  { name: 'Micro', min: 20e6, max: 300e6, count: 3500 },
  { name: 'Nano', min: 2e6, max: 20e6, count: 1050 },
] as const;

/** Where a procedural company sits in the market. */
export interface Slot {
  tier: number;
  industry: number;
  marketCap: number;
}

export function generateWorld(options: WorldOptions): World {
  const { seed } = options;
  const count = Math.round(Math.min(10_000, Math.max(1_000, options.companyCount ?? 10_000)));
  const companies: Company[] = [];
  const tiers: number[] = [];
  const names = new Set(RESERVED_NAMES);
  const tickers = new Set<string>();
  const ceos = new Set<string>();
  const brands = new Set<string>();

  // Spec §10.4: names and tickers are unique, and so are CEOs and coined brands ("Datatronix"); a clash
  // re-rolls the company.
  const add = (genes: Genes, tier: number) => {
    const company = describeCompany(genes, encodeGenome(genes));
    const name = company.name.toLowerCase();
    const ceo = `${company.ceo.firstName} ${company.ceo.lastName}`;
    const brand = !company.curated && /^\{\w+\}\{/.test(NAME_TEMPLATES[genes.nameTemplate]) ? name.split(' ')[0] : '';
    if (names.has(name) || tickers.has(company.ticker) || ceos.has(ceo) || brands.has(brand) || !fit(company)) return false;
    names.add(name);
    tickers.add(company.ticker);
    ceos.add(ceo);
    if (brand) brands.add(brand);
    companies.push(company);
    tiers.push(tier);
    return true;
  };

  TOP100.forEach((entry, rank) => {
    if (!add(curatedGenes(seed, rank), 0)) throw new Error(`Top-100 entry ${entry.ticker} clashes with another`);
  });
  for (const slot of marketPlan(seed, count - TOP100.length)) {
    const index = companies.length;
    let attempt = 0;
    while (!add(companyGenes(seed, index, slot, attempt), slot.tier)) {
      if (++attempt > 1000) throw new Error(`No unique company for slot ${index}`);
    }
  }
  const firms = competitorFirms(seed, options);
  return { seed, companies, tiers, firms, ...generateOwnership(seed, companies, tiers, firms) };
}

const blocked = (letters: string) => BLOCKED_LETTERS.some((b) => letters.includes(b));

function fit({ curated, name, ticker, genes }: Company): boolean {
  if (curated) return true;
  if (!/^[A-Z]{3,4}$/.test(ticker) || blocked(ticker)) return false;
  // No stutters: "Southern Computer Computer", "Netnet".
  if (/\b(\w+)\b.*\b\1\b/i.test(name) || /(\w{3,})\1/i.test(name)) return false;
  return !NAME_TEMPLATES[genes.nameTemplate].includes('{initials}') || !blocked(initials(genes.namePartA, genes.namePartB));
}

/** Tier, industry and market cap of every procedural company, largest first (spec §10.2). */
function marketPlan(seed: string, count: number): Slot[] {
  const rng = Rng.stream(seed, 'plan');
  const procedural = TIERS.slice(1);
  const tierCounts = apportion(procedural.map((t) => t.count), count);
  // Every industry gets at least 60 companies in a full market; the rest follow the market-mix weights.
  const minimum = Math.min(60, Math.floor(count / (2 * INDUSTRIES.length)));
  const industryCounts = apportion(INDUSTRIES.map((i) => i.weight), count, minimum);
  const industries = rng.shuffle(industryCounts.flatMap((n, i) => Array<number>(n).fill(i)));
  const slots: Slot[] = [];
  tierCounts.forEach((n, t) => {
    const { min, max } = procedural[t];
    for (let k = 0; k < n; k++) {
      // Log-linear from the top of the tier to its bottom, ±15%.
      const marketCap = max * (min / max) ** ((k + 0.5) / n) * rng.range(0.85, 1.15);
      slots.push({ tier: t + 1, industry: industries[slots.length], marketCap: Math.min(max, Math.max(min, marketCap)) });
    }
  });
  return slots;
}

/** Splits `total` in proportion to `weights` (largest remainder), each share at least `min`. */
function apportion(weights: readonly number[], total: number, min = 0): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => min + (w / sum) * (total - min * weights.length));
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((_, i) => i).sort((a, b) => (exact[b] % 1) - (exact[a] % 1) || a - b);
  for (const i of byRemainder) if (left-- > 0) counts[i]++;
  return counts;
}

/**
 * Spec §10.3 `generate(worldSeed, index)`: the genes of procedural company `index`, given its slot in the market
 * plan. Pure; generateWorld re-rolls a company that clashes with an earlier one with the next `attempt`.
 */
export function companyGenes(seed: string, index: number, slot: Slot, attempt = 0): Genes {
  const rng = Rng.stream(seed, `company:${index}:${attempt}`);
  const industry = INDUSTRIES[slot.industry];
  const tier = TIERS[slot.tier];
  const templates = Object.keys(industry.templates).map(Number);
  const template = templates[rng.weighted(templates.map((t) => industry.templates[t]))];
  const [namePartA, namePartB] = nameParts(rng, template, industry);
  return {
    version: GENOME_VERSION,
    industry: slot.industry,
    subIndustry: rng.int(0, industry.subIndustries.length - 1),
    nameTemplate: template,
    namePartA,
    namePartB,
    nameSuffix: suffix(rng, template, industry),
    founded: rng.int(...industry.priors.founded),
    hqCity: industry.hubs && rng.chance(0.5) ? cityIndex(rng.pick(industry.hubs)) : rng.weighted(CITY_WEIGHTS),
    ...logoGenes(rng, slot.industry),
    ...ceoGenes(rng, industry),
    ...fundamentalGenes(rng, industry, slot.tier, SCALES.marketCap.codeWithin(slot.marketCap, tier.min, tier.max)),
  };
}

/**
 * Genes of top-100 company `rank` (spec §10.6). Identity (logo, CEO, founding) is drawn from a stream keyed by
 * ticker alone, so it is the same in every world; market cap and fundamentals vary with the world seed.
 */
function curatedGenes(seed: string, rank: number): Genes {
  const entry = TOP100[rank];
  const industryIndex = indexOf(INDUSTRIES.map((i) => i.id), entry.industry);
  const industry = INDUSTRIES[industryIndex];
  const identity = Rng.stream('top100', entry.ticker);
  const world = Rng.stream(seed, `top100:${rank}`);
  const marketCap = 4.5e12 * (rank + 1) ** -0.75 * world.range(0.85, 1.15);
  return {
    version: CURATED_VERSION,
    industry: industryIndex,
    subIndustry: entry.sub ? indexOf(industry.subIndustries, entry.sub) : identity.int(0, industry.subIndustries.length - 1),
    nameTemplate: 0,
    namePartA: rank,
    namePartB: 0,
    nameSuffix: 0,
    founded: entry.founded ?? identity.int(...industry.priors.founded),
    hqCity: cityIndex(entry.hq),
    ...logoGenes(identity, industryIndex),
    ...ceoGenes(identity, industry),
    ...fundamentalGenes(world, industry, 0, SCALES.marketCap.code(marketCap)),
    ...fixedLogo(entry.logo),
  };
}

function indexOf<T>(list: readonly T[], value: T): number {
  const i = list.indexOf(value);
  if (i < 0) throw new Error(`Unknown value: ${String(value)}`);
  return i;
}

const CITY_NAMES = CITIES.map((c) => c.name);
const CITY_WEIGHTS = CITIES.map((c) => c.weight);
const cityIndex = (name: string) => indexOf(CITY_NAMES, name);

function nameParts(rng: Rng, template: number, industry: Industry): [number, number] {
  if (NAME_TEMPLATES[template].includes('{initials}')) return [rng.int(0, 255), rng.int(0, 255)];
  const slots = templateSlots(template);
  // Name parts are 8-bit genes, so only a lexicon's first 256 words can appear in names.
  const draw = (slot: (typeof slots)[number]) => rng.int(0, Math.min(256, slotLexicon(slot, industry).length) - 1);
  const parts = slots.map(draw);
  // "Hallvard & Birch", never "Hallvard & Hallvard".
  while (slots.length === 2 && slots[0] === slots[1] && parts[0] === parts[1]) parts[1] = draw(slots[1]);
  return [parts[0] ?? 0, parts[1] ?? 0];
}

function suffix(rng: Rng, template: number, industry: Industry): number {
  const pattern = NAME_TEMPLATES[template];
  if (!pattern.includes('{suffix}')) return 0;
  // "& Sons" only follows a lone surname: "Hallvard & Sons", not "Pacific & Sons".
  const afterSurname = pattern === '{surname} {suffix}';
  // Without a root or stem the suffix is the only clue to the industry, so generic ones are rarer.
  const clueless = !/\{(root|stem)\}/.test(pattern);
  return rng.weighted(
    industry.suffixes.map((s) => (s.startsWith('&') && !afterSurname ? 0 : clueless && GENERIC_SUFFIXES.has(s) ? 0.2 : 1)),
  );
}

const PREFERRED_PALETTES = INDUSTRIES.map((industry) =>
  PALETTES.flatMap((p, i) => (industry.palettes.includes(p.family) ? [i] : [])),
);

function logoGenes(rng: Rng, industry: number) {
  return {
    logoShape: rng.int(0, LOGO_SHAPES.length - 1),
    logoMotif: LOGO_MOTIFS.indexOf(rng.pick(INDUSTRIES[industry].motifs)),
    logoPalette: rng.chance(0.75) ? rng.pick(PREFERRED_PALETTES[industry]) : rng.int(0, PALETTES.length - 1),
    logoFont: rng.int(0, LOGO_FONTS.length - 1),
    logoLayout: rng.int(0, LOGO_LAYOUTS.length - 1),
  };
}

function fixedLogo(logo: CuratedCompany['logo'] = {}): Partial<Genes> {
  return {
    ...(logo.shape && { logoShape: indexOf(LOGO_SHAPES, logo.shape) }),
    ...(logo.motif && { logoMotif: indexOf(LOGO_MOTIFS, logo.motif) }),
    ...(logo.palette && { logoPalette: indexOf(PALETTES.map((p) => p.id), logo.palette) }),
    ...(logo.font && { logoFont: indexOf(LOGO_FONTS, logo.font) }),
    ...(logo.layout && { logoLayout: indexOf(LOGO_LAYOUTS, logo.layout) }),
  };
}

/** Fundamentals drawn from the industry's priors, shifted by size: smaller companies swing more and earn less. */
function fundamentalGenes(rng: Rng, industry: Industry, tier: number, marketCapCode: number) {
  const { priors } = industry;
  const small = tier / 5; // 0 for the top 100 … 1 for nano caps
  // A skew above 1 pulls the draw towards the bottom of the range, below 1 towards the top.
  const draw = (scale: keyof typeof SCALES, range: readonly [number, number], skew = 1) =>
    SCALES[scale].codeWithin(range[0] + (range[1] - range[0]) * rng.float() ** skew, range[0], range[1]);
  const marketCap = SCALES.marketCap.value(marketCapCode);
  // Log-normal around a median that falls with size (penny stocks cluster under $5); at least 200,000 shares.
  const price = Math.min(2000, marketCap / 200_000, 180 * 0.45 ** tier * Math.exp(rng.normal(0, 0.8)));
  return {
    marketCap: marketCapCode,
    price: SCALES.price.code(Math.max(0.1, price)),
    volatility: draw('volatility', priors.volatility, 2 ** (1 - 2 * small)),
    beta: draw('beta', priors.beta),
    dividendYield: rng.chance(priors.payers * (1.2 - small)) ? draw('dividendYield', priors.dividend) : 0,
    revenueGrowth: draw('revenueGrowth', priors.growth),
    netMargin: draw('netMargin', priors.margin, 2 ** (2 * small - 1)),
    leverage: draw('leverage', priors.leverage),
    quality: SCALES.quality.code(Math.min(1, Math.max(0, 0.75 - 0.45 * small + rng.range(-0.25, 0.25)))),
  };
}
