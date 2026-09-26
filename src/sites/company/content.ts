import { inkColour, type LogoSpec } from '../../art/logo/Logo';
import { companyLogo } from '../../art/logo/Logo';
import type { LogoMotif } from '../../art/logo/options';
import { START_DAY, gameYear } from '../../sim/calendar';
import { CITIES } from '../../world/cities';
import type { Company } from '../../world/company';
import { FIRST_NAMES, LAST_NAMES } from '../../world/people-names';
import { Rng } from '../../world/rng';
import {
  BIO_END, BIO_MIDDLE, BIO_START, GUESTBOOK, HISTORY, MILESTONES, PRODUCT_BLURBS, SCHOOLS, SLOGANS, WELCOME,
} from '../data/copy';
import { PRODUCT_KINDS, PRODUCT_LINES, PRODUCT_MODELS } from '../data/products';
import { THEMES, type Tile } from '../data/themes';

/** The eight page layouts (spec §14): where the navigation sits and how the header looks. */
export const LAYOUTS = ['classic', 'frames', 'centered', 'tabs', 'sidebar', 'homepage', 'corporate', 'brochure'] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface Product {
  name: string;
  kind: string;
  blurb: string;
  motif: LogoMotif;
  price: number;
}

export interface GuestbookEntry {
  name: string;
  city: string;
  /** Days before the game started. */
  daysAgo: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

/** Everything about a company's website that doesn't change with the market. */
export interface CompanySite {
  layout: Layout;
  logo: LogoSpec;
  colours: { main: string; accent: string; ink: string };
  tile: Tile;
  /** Body text font. */
  font: string;
  slogan: string;
  welcome: string;
  history: string[];
  bio: string[];
  products: Product[];
  guestbook: GuestbookEntry[];
  /** The hit counter at the start of the game, and visitors a day since. */
  visitors: number;
  visitorsPerDay: number;
  phone: string;
}

const FONTS = ['"Times New Roman", Times, serif', 'Arial, Helvetica, sans-serif', 'Verdana, Geneva, sans-serif', '"Comic Sans MS", "Chalkboard SE", cursive'];

const UNCOUNTABLE = /(lumber|plywood|pulp|oil|gas|gasoline|fuel|paint|electricity|service|water|cover|insurance|flooring|ore|coal|bullion|steel|concrete|drywall|space|capacity|mail|miles|cement|meal|chlorine|asphalt|propane|kerosene|firewood|tobacco|lager|ketchup|yoghurt|soap|espresso|rebar|delivery|brokerage|lighting|relief|syrup|dinner|noodles)$/i;

/** "Desktop PC" → "Desktop PCs", "Premium 2x4 Lumber" stays. */
export function plural(kind: string): string {
  if (UNCOUNTABLE.test(kind) || /s$/.test(kind)) return kind;
  if (/(x|ch|sh)$/.test(kind)) return `${kind}es`;
  if (/[^aeiou]y$/.test(kind)) return `${kind.slice(0, -1)}ies`;
  return `${kind}s`;
}

/** Fills {placeholders}; unknown ones are left as they are. */
export const fill = (template: string, words: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, key: string) => (key in words ? String(words[key]) : m));

/** "Ridgepine Timber Co." → "Ridgepine Timber": the name without its legal suffix. */
export const shortName = (name: string) => name.replace(/\s*\(.*?\)/, '').replace(/,?\s(Co|Inc|Corp|Ltd|PLC|Holdings|Group)\.?$/i, '').replace(/\.com$/, '');


/**
 * A company's website (spec §14), generated from the company itself: its industry picks the theme, clip-art and
 * products, its logo palette the colours, and its quality how the guestbook feels about it. The same company always
 * gets the same site; the seed is its name, so a top-100 company's site is the same in every world.
 */
export function companySite(c: Company): CompanySite {
  const rng = Rng.stream(c.name, 'website');
  const theme = THEMES[c.industry.id] ?? THEMES.conglomerate;
  const logo = companyLogo(c.genes);
  const [main, accent] = logo.palette.colors;
  const kinds = PRODUCT_KINDS[c.industry.id] ?? PRODUCT_KINDS.conglomerate;
  const short = shortName(c.name);
  const startYear = gameYear(START_DAY);
  const year = startYear - c.founded;
  const ceo = `${c.ceo.firstName} ${c.ceo.lastName}`;
  const kind = rng.pick(kinds);

  const products = rng.shuffle([...kinds]).slice(0, rng.int(3, 6)).map((k): Product => {
    const name = rng.chance(0.6) ? `${short.split(' ')[0]} ${rng.pick(PRODUCT_LINES)} ${k}` : `${k} ${rng.pick(PRODUCT_MODELS)}`;
    return { name, kind: k, blurb: '', motif: rng.pick(c.industry.motifs), price: priceFor(rng) };
  });
  const words = {
    name: c.name, short, industry: c.industry.name, sub: c.subIndustry, subLower: c.subIndustry.toLowerCase(), kind,
    kinds: plural(kind), city: c.hq.name, country: c.hq.country, year, years: c.founded, ceo, first: c.ceo.firstName,
    last: c.ceo.lastName, age: c.ceo.age, product: products[0].name, their: 'their',
  };
  for (const product of products) {
    product.blurb = fill(rng.pick(PRODUCT_BLURBS), { ...words, product: product.name, kindLower: product.kind.toLowerCase() });
  }

  const since = Math.max(year, startYear - rng.int(1, Math.min(25, c.ceo.age - 28)));
  const milestones = rng.shuffle([...MILESTONES]).slice(0, 3);
  const milestoneYears = milestones.map(() => rng.int(Math.min(year, startYear - 1), startYear - 1)).sort((a, b) => a - b);
  const history = [
    fill(rng.pick(HISTORY), words),
    milestones.map((m, k) => `In ${milestoneYears[k]}, ${short} ${fill(m, { ...words, product: rng.pick(products).name })}.`).join(' '),
    `Today, ${short} employs ${employees(c.marketCap, rng).toLocaleString('en-US')} people.`,
  ];
  const bio = [
    fill(rng.pick(BIO_START), { ...words, since }),
    fill(rng.pick(BIO_MIDDLE), { ...words, n: rng.int(3, 15), school: rng.pick(SCHOOLS) }),
    fill(rng.pick(BIO_END), words),
  ];

  // Well-run companies get more praise; poorly run ones more complaints (spec §14: comments hint at quality).
  const guestbook = Array.from({ length: rng.int(5, 9) }, (): GuestbookEntry => {
    const r = rng.float();
    const tone = r < 0.25 ? 'neutral' : r < 0.25 + 0.75 * (0.15 + 0.7 * c.quality) ? 'good' : 'bad';
    const guestCity = rng.pick(CITIES).name;
    return {
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)[0]}.`,
      city: guestCity,
      daysAgo: rng.int(1, 700),
      text: fill(rng.pick(GUESTBOOK[tone]), { ...words, guestCity, product: rng.pick(products).name }),
      tone,
    };
  }).sort((a, b) => a.daysAgo - b.daysAgo);

  const layout = c.curated && rng.chance(0.6) ? 'corporate' : rng.pick(LAYOUTS);
  return {
    layout,
    logo,
    colours: { main, accent, ink: inkColour(logo.palette) },
    tile: rng.pick(theme.tiles),
    font: layout === 'homepage' ? FONTS[3] : rng.pick(theme.fonts.map((f) => FONTS[f])),
    slogan: fill(rng.pick(SLOGANS), words),
    welcome: fill(rng.pick(WELCOME), words),
    history,
    bio,
    products,
    guestbook,
    visitors: Math.round(Math.sqrt(c.marketCap) / 20 + rng.int(100, 5000)),
    visitorsPerDay: Math.max(3, Math.round(Math.sqrt(c.marketCap) / 2000)),
    phone: `1-800-${rng.int(200, 999)}-${String(rng.int(0, 9999)).padStart(4, '0')}`,
  };
}

function priceFor(rng: Rng): number {
  return Math.round(Math.exp(rng.range(Math.log(5), Math.log(5000)))) - 0.01;
}

/** Headcount to two significant figures: about 60 at $1M of market value, 400,000 at $4T. */
const employees = (marketCap: number, rng: Rng) => Math.max(4, Number((60 * (marketCap / 1e6) ** 0.6 * rng.range(0.6, 1.6)).toPrecision(2)));
