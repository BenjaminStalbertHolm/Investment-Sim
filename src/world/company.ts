import { CITIES, type City } from './cities';
import { CURATED_VERSION, GENOME_VERSION, SCALES, decodeGenome, type Genes } from './genome';
import { INDUSTRIES, type Industry } from './industries';
import { ADJECTIVES, COINS, ENDS, INITIALS, NAME_TEMPLATES, PLACES, PREFIXES } from './lexicons/shared';
import { FIRST_NAMES, LAST_NAMES } from './people-names';
import { TOP100 } from './top100';

/** A company's starting state, fully determined by its genome (spec §10.3). */
export interface Company {
  genome: string;
  /** The decoded genome. Logo and portrait parts are read straight from here. */
  genes: Genes;
  /** One of the hand-written top 100. */
  curated: boolean;
  name: string;
  ticker: string;
  industry: Industry;
  subIndustry: string;
  /** Years before the game starts. */
  founded: number;
  hq: City;
  ceo: { firstName: string; lastName: string; age: number };
  marketCap: number;
  price: number;
  sharesOutstanding: number;
  /** Annualised. */
  volatility: number;
  beta: number;
  dividendYield: number;
  revenueGrowth: number;
  netMargin: number;
  /** Debt / equity. */
  leverage: number;
  /** Earnings reliability and governance, 0–1. */
  quality: number;
}

/** Throws if the genome is corrupt or names an unknown industry, version or name template. */
export function decodeCompany(genome: string): Company {
  return describeCompany(decodeGenome(genome), genome);
}

export function describeCompany(genes: Genes, genome: string): Company {
  const industry = INDUSTRIES[genes.industry];
  const curated = genes.version === CURATED_VERSION ? TOP100[genes.namePartA] : undefined;
  if (!industry || (genes.version !== GENOME_VERSION && !curated) || !NAME_TEMPLATES[genes.nameTemplate]) {
    throw new Error('Invalid genome: unknown industry, version or name template');
  }
  const name = curated?.name ?? companyName(genes, industry);
  const marketCap = SCALES.marketCap.value(genes.marketCap);
  const price = SCALES.price.value(genes.price);
  return {
    genome,
    genes,
    curated: !!curated,
    name,
    ticker: curated?.ticker ?? tickerFor(name, tickerLength(genes)),
    industry,
    subIndustry: item(industry.subIndustries, genes.subIndustry),
    founded: genes.founded,
    hq: item(CITIES, genes.hqCity),
    ceo: { firstName: item(FIRST_NAMES, genes.ceoFirstName), lastName: item(LAST_NAMES, genes.ceoLastName), age: 32 + genes.ceoAge },
    marketCap,
    price,
    sharesOutstanding: Math.round(marketCap / price),
    volatility: SCALES.volatility.value(genes.volatility),
    beta: SCALES.beta.value(genes.beta),
    dividendYield: SCALES.dividendYield.value(genes.dividendYield),
    revenueGrowth: SCALES.revenueGrowth.value(genes.revenueGrowth),
    netMargin: SCALES.netMargin.value(genes.netMargin),
    leverage: SCALES.leverage.value(genes.leverage),
    quality: SCALES.quality.value(genes.quality),
  };
}

/** Lexicon genes are indices modulo the lexicon's length (spec §10.3). */
const item = <T>(list: readonly T[], index: number): T => list[index % list.length];

export type NameSlot = 'prefix' | 'root' | 'stem' | 'coin' | 'end' | 'place' | 'adj' | 'surname';

/** The word list a name slot draws from: the industry's own, else the shared one. */
export function slotLexicon(slot: NameSlot, industry: Industry): readonly string[] {
  switch (slot) {
    case 'prefix': return industry.prefixes ?? PREFIXES;
    case 'root': return industry.roots;
    case 'stem': return industry.stems ?? industry.roots;
    case 'coin': return industry.coins ?? COINS;
    case 'end': return industry.ends ?? ENDS;
    case 'place': return industry.places ?? PLACES;
    case 'adj': return industry.adjs ?? ADJECTIVES;
    case 'surname': return LAST_NAMES;
  }
}

/** A template's word slots in order: the first takes name part A, the second name part B. */
export function templateSlots(template: number): NameSlot[] {
  return [...NAME_TEMPLATES[template].matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .filter((slot): slot is NameSlot => slot !== 'suffix' && slot !== 'initials');
}

const JOIN = '\u0001';

function companyName(genes: Genes, industry: Industry): string {
  const parts = [genes.namePartA, genes.namePartB];
  let next = 0;
  return NAME_TEMPLATES[genes.nameTemplate]
    .replace(/\{(\w+)\}/g, (_, slot: string, offset: number, template: string) => {
      const word =
        slot === 'suffix'
          ? item(industry.suffixes, genes.nameSuffix)
          : slot === 'initials'
            ? initials(genes.namePartA, genes.namePartB)
            : item(slotLexicon(slot as NameSlot, industry), parts[next++]);
      // A slot straight after another forms a compound: "Ridge" + "Pine" → "Ridgepine".
      return template[offset - 1] === '}' ? JOIN + word.toLowerCase() : word;
    })
    .replace(/[aeiou]\u0001(?=[aeiou])/g, '') // "Electro" + "ics" → "Electrics"
    .replace(/(\w)\u0001(?=\1)/g, '') // "Tell" + "link" → "Tellink"
    .replaceAll(JOIN, '')
    .replace(' .', '.'); // "Clickzilla.com"
}

/** The three letters that name parts A and B spell in the {initials} template, five bits each. */
export function initials(a: number, b: number): string {
  const n = a * 256 + b;
  return INITIALS[n & 31] + INITIALS[(n >> 5) & 31] + INITIALS[(n >> 10) & 31];
}

/** Three or four letters (one in four is three), decided by the name genes. */
const tickerLength = (genes: Genes) => ((genes.namePartA ^ genes.namePartB ^ genes.nameSuffix) & 3 ? 4 : 3);

const TICKER_SKIP = new Set(['AND', 'THE', 'OF', 'CO', 'COM', 'INC', 'CORP', 'LTD', 'PLC', 'GROUP', 'HOLDINGS', 'COMPANY', 'SONS']);

/**
 * Ticker derived from a company name (spec §10.4): the initials of its significant words (all of an acronym's
 * letters), filled out with the first word's consonants and then its vowels. "Ridgepine Timber Co." → RDGT.
 */
export function tickerFor(name: string, length: number): string {
  const all = name.split(/[^A-Za-z]+/).filter(Boolean);
  const words = all.filter((w) => !TICKER_SKIP.has(w.toUpperCase()));
  if (!words.length) words.push(...all);
  if (!words.length) return '';
  let ticker = words.map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w[0])).join('').toUpperCase();
  if (ticker.length < length) {
    const rest = words[0].slice(1).toUpperCase();
    const fill = [...rest.replace(/[AEIOU]/g, ''), ...rest.replace(/[^AEIOU]/g, '')].filter((ch, i, a) => ch !== a[i - 1]);
    ticker = ticker[0] + fill.slice(0, length - ticker.length).join('') + ticker.slice(1);
  }
  return ticker.slice(0, length);
}
