// The firm's money outside the markets (spec §14.2): the Lifestyles Catalogue, eBuy's collectibles, conferences, the
// State Lotto and Hindsight Research's subscription. Data only: sim/lifestyle.ts runs them, sites/lifestyle shows them.

export interface AssetSpec {
  id: string;
  kind: 'car' | 'watch' | 'art' | 'yacht' | 'jet' | 'home' | 'team' | 'title';
  name: string;
  price: number;
  /** A month's running costs: insurance, crew, fuel, stabling. */
  upkeep: number;
  /** What a dealer pays back the day after (the rest is his margin), and the drift and volatility of resale a year. */
  resale: number;
  drift: number;
  vol: number;
  /** What owning it does for the firm's standing with prospective clients (spec §14.2: it raises mandate offers). */
  prestige: number;
  blurb: string;
  /** Only in the catalogue while a fun module is on (spec §16C.1: Sealand's noble titles). */
  module?: 'geopolitics';
}

/** The Lifestyles Catalogue (spec §14.2): most things depreciate; art can appreciate; property and teams wander. */
export const ASSETS: readonly AssetSpec[] = [
  { id: 'watch', kind: 'watch', name: 'Rollex Submariner Oyster Perpetual', price: 14_500, upkeep: 40, resale: 0.8, drift: 0.02, vol: 0.05, prestige: 0.3,
    blurb: 'Waterproof to 300 metres, which is deeper than any deal you will ever be in.' },
  { id: 'phone', kind: 'watch', name: 'Motorolla StarTAK Gold Edition', price: 4_800, upkeep: 250, resale: 0.3, drift: -0.5, vol: 0.1, prestige: 0.2,
    blurb: 'The flip phone that flips for you. Airtime not included (it is the upkeep).' },
  { id: 'sportsCar', kind: 'car', name: 'Ferrarri Testarosso', price: 185_000, upkeep: 2_400, resale: 0.85, drift: -0.12, vol: 0.06, prestige: 1.5,
    blurb: 'Red. Loud. Twelve cylinders, two seats, no room for a briefcase.' },
  { id: 'limo', kind: 'car', name: 'Rolls-Roiz Silver Spur with driver', price: 240_000, upkeep: 9_000, resale: 0.8, drift: -0.15, vol: 0.05, prestige: 2,
    blurb: 'Arrive at the Davoz Economic Forum as if you own it. The driver is on the upkeep.' },
  { id: 'art', kind: 'art', name: 'Claude Monay, “Water Lilies (a smaller one)”', price: 2_400_000, upkeep: 4_000, resale: 0.9, drift: 0.07, vol: 0.18, prestige: 3,
    blurb: 'Oil on canvas. Insured, alarmed and hung in the boardroom. Art can appreciate. It can also not.' },
  { id: 'popArt', kind: 'art', name: 'Andy Warhole, “Soup Can No. 9”', price: 850_000, upkeep: 1_500, resale: 0.88, drift: 0.09, vol: 0.28, prestige: 2,
    blurb: 'Fifteen minutes of fame, framed.' },
  { id: 'mansion', kind: 'home', name: 'Mansion in the Hamptons (eleven bedrooms)', price: 6_500_000, upkeep: 28_000, resale: 0.92, drift: 0.03, vol: 0.08, prestige: 4,
    blurb: 'Tennis court, pool house and a lawn for the summer party clients will talk about for years.' },
  { id: 'yacht', kind: 'yacht', name: 'Superyacht “Liquidity” (48 metres)', price: 12_000_000, upkeep: 90_000, resale: 0.8, drift: -0.08, vol: 0.06, prestige: 5,
    blurb: 'A crew of fourteen, a helipad and a name you will regret in a margin call.' },
  { id: 'jet', kind: 'jet', name: 'Gulfstreem IV private jet', price: 28_000_000, upkeep: 180_000, resale: 0.85, drift: -0.07, vol: 0.04, prestige: 6,
    blurb: 'Omaha to Davoz without stopping, or queueing, or meeting anybody.' },
  { id: 'team', kind: 'team', name: 'The Duluth Dockhands (minor-league baseball)', price: 18_000_000, upkeep: 240_000, resale: 0.95, drift: 0.04, vol: 0.15, prestige: 8,
    blurb: 'A stadium, a mascot (Dockie the Walrus) and a payroll. Your name on the scoreboard.' },
  { id: 'sealand', kind: 'title', name: 'Baronetcy of the Principality of Sealand', price: 99_000, upkeep: 0, resale: 0.1, drift: 0, vol: 0.01, prestige: 0.5,
    blurb: 'A genuine noble title from a sea fort off the English coast. Prince Barnaby I signs the letters patent himself.', module: 'geopolitics' },
];

export const ASSET = Object.fromEntries(ASSETS.map((a) => [a.id, a])) as Record<string, AssetSpec>;

/** Prestige counts up to this much (a second jet impresses nobody). */
export const MAX_PRESTIGE = 25;

/**
 * eBuy (spec §14.2): collectibles whose prices follow hype cycles. Each category's price index wanders in phases — quiet,
 * building, mania, bust — whose drifts are these, a year in log terms; mania ends likelier the higher prices are.
 */
export interface CollectibleCategory {
  id: string;
  name: string;
  /** Items and what each is worth when the category's index is 1. */
  items: readonly (readonly [string, number])[];
}

export const CATEGORIES: readonly CollectibleCategory[] = [
  { id: 'meanie', name: 'Meanie Babies', items: [
    ['Peanut the Royal Blue Elephant (tag intact)', 900], ['Princess the Bear (1st edition)', 450], ['Brownie the Bear, pre-production', 1_600],
    ['Humphrey the Camel', 180], ['Spot the Dog (no spot)', 320], ['Quackers the Duck (wingless)', 260], ['Chilly the Polar Bear', 140],
    ['Legs the Frog, 3rd generation tag', 60],
  ] },
  { id: 'cards', name: 'Trading cards', items: [
    ['Pokey-Mon Charblazer, holographic 1st edition', 1_200], ['Pokey-Mon Pikachew, promo', 150], ['Magic: The Grabbening Black Lotus-ish', 3_500],
    ['Hank Homerun 1952 rookie card (creased)', 8_000], ['Sealed booster box, Base Set', 600], ['Beanie Bowl ’97 commemorative set', 90],
  ] },
  { id: 'retro', name: 'Retro computers', items: [
    ['Commodoor 64 in original box', 220], ['Atarri 2600 with 12 cartridges', 160], ['Apricot Lisa (working)', 2_800], ['Sinclare ZX Spectrum 48K', 140],
    ['Pear II Europlus', 700], ['IMB PC XT, 5150', 350], ['Majorsoft Doors 1.0 on floppies, sealed', 480],
  ] },
];

export const PHASES = [
  { name: 'quiet', drift: 0, vol: 0.2 },
  { name: 'building', drift: 0.9, vol: 0.3 },
  { name: 'mania', drift: 2.6, vol: 0.45 },
  { name: 'bust', drift: -3.2, vol: 0.4 },
] as const;
/** Daily chances of moving on: quiet → building, building → mania, mania → bust (times e^level), and bust ends near 1. */
export const HYPE = { build: 1 / 90, mania: 1 / 70, bust: 1 / 60, calm: -0.05 };
/** New auctions a trading day, how long they run (trading days) and eBuy's cut of a sale. */
export const AUCTIONS_A_DAY = 3;
export const AUCTION_DAYS: readonly [number, number] = [3, 6];
export const EBUY_FEE = 0.05;

/** Conferences (spec §14.2): networking yields mandate offers, ISeekYou contacts and tips. `month` 0–11. */
export interface Conference {
  id: string;
  name: string;
  where: string;
  month: number;
  date: number;
  price: number;
  /** Chances of a mandate offer, a new contact and a tip from the contacts made there. */
  mandate: number;
  contact: number;
  tip: number;
  blurb: string;
}

export const CONFERENCES: readonly Conference[] = [
  { id: 'davoz', name: 'Davoz Economic Forum', where: 'Davoz, Switzerland', month: 0, date: 26, price: 45_000, mandate: 0.7, contact: 0.8, tip: 0.4,
    blurb: 'Four days of panels on globalisation, then everybody goes skiing. Heads of state, central bankers, you.' },
  { id: 'omaha', name: 'Birkshire Hatchaway Shareholder Meeting', where: 'Omaha, Nebraska', month: 4, date: 2, price: 400, mandate: 0.15, contact: 0.5, tip: 0.3,
    blurb: 'Twenty thousand shareholders, one very long Q&A and a lot of peanut brittle.' },
  { id: 'golf', name: 'Fund Managers’ Charity Golf Classic', where: 'Pebble Bay, California', month: 5, date: 12, price: 15_000, mandate: 0.5, contact: 0.6, tip: 0.2,
    blurb: 'Eighteen holes with pension trustees who are, for once, in a good mood.' },
  { id: 'sunvalley', name: 'Sun Valley Moguls’ Retreat', where: 'Sun Valley, Idaho', month: 6, date: 9, price: 30_000, mandate: 0.45, contact: 0.8, tip: 0.45,
    blurb: 'Media moguls in fleece vests. Deals are done on the rafting trips.' },
  { id: 'comdexx', name: 'COMDEXX', where: 'Las Vegas, Nevada', month: 10, date: 16, price: 2_500, mandate: 0.1, contact: 0.7, tip: 0.6,
    blurb: 'The computer trade show: two hundred thousand badges, every chip maker and a keynote by Majorsoft.' },
];

/** Hindsight Research (spec §14.2): paid subscribers read short reports an hour before everyone else. A month's fee. */
export const HINDSIGHT_FEE = 35_000;
export const HINDSIGHT_LEAD = 60;

/** The State Lotto (spec §14.2): six numbers of 49, drawn at each week's last close. A ticket's price and the prizes. */
export const LOTTO = { price: 1, pick: 6, of: 49, maxTickets: 1_000, jackpot: 2_000_000, prizes: { 5: 2_500, 4: 75, 3: 5 } as Record<number, number> };
