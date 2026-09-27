// Futures contracts and the commodities behind them (spec §12.3), how industries depend on them (spec §10.4), and the
// weather and OPEK news that moves them (spec §14). Data only: sim/commodities.ts runs the models.

export type CommodityGroup = 'energy' | 'metals' | 'grains' | 'softs' | 'livestock' | 'forest' | 'financial';

export interface ContractSpec {
  code: string;
  name: string;
  group: CommodityGroup;
  /** The contract size as the exchange lists it. */
  size: string;
  /** Dollars per 1.00 of the quoted price. */
  multiplier: number;
  /** What the price is quoted in. */
  quote: string;
  /** What a long position held past its last trading day brings to the lobby (spec §12.3); financial futures settle in cash. */
  delivery?: { quantity: number; unit: string; what: string };
  /** Contract months, 0–11. */
  months: readonly number[];
  /** Price on 5 January 1998. */
  start: number;
  /** Annualised volatility of the spot price. */
  vol: number;
  /** Years for a price shock to halve (the spot mean-reverts to its long-run level: Ornstein-Uhlenbeck). */
  halfLife: number;
  /** Seasonal swing of the log price, and the day of the year it peaks. */
  season?: { amplitude: number; peak: number };
  /** Initial margin as a share of the contract's value; maintenance is MAINTENANCE of it. */
  margin: number;
  /** Loading on the stock market's factor: copper tracks the economy. */
  beta?: number;
  /** Extra annual drift while the stock market crashes: gold is a safe haven. */
  haven?: number;
  /** Commodities that move together share a factor. */
  factor?: 'oil' | 'precious' | 'grain' | 'livestock';
  /** A line for the exchange's contract page. */
  note: string;
}

const MONTHLY = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const QUARTERLY = [2, 5, 8, 11];

/** The contracts of spec §12.3, in its order. */
export const CONTRACTS: readonly ContractSpec[] = [
  { code: 'CL', name: 'Crude Oil', group: 'energy', size: '1,000 barrels', multiplier: 1000, quote: '$ per barrel',
    delivery: { quantity: 1000, unit: 'barrels', what: 'crude oil' }, months: MONTHLY, start: 17.5, vol: 0.32, halfLife: 1.5,
    margin: 0.08, beta: 0.3, factor: 'oil', note: 'The benchmark. OPEK meetings move it.' },
  { code: 'BZ', name: 'Brent Crude', group: 'energy', size: '1,000 barrels', multiplier: 1000, quote: '$ per barrel',
    delivery: { quantity: 1000, unit: 'barrels', what: 'Brent crude' }, months: MONTHLY, start: 16.1, vol: 0.3, halfLife: 1.5,
    margin: 0.08, beta: 0.3, factor: 'oil', note: 'North Sea crude, priced off the same barrels.' },
  { code: 'NG', name: 'Natural Gas', group: 'energy', size: '10,000 MMBtu', multiplier: 10_000, quote: '$ per MMBtu',
    delivery: { quantity: 10_000, unit: 'MMBtu', what: 'natural gas' }, months: MONTHLY, start: 2.25, vol: 0.5, halfLife: 1,
    season: { amplitude: 0.15, peak: 15 }, margin: 0.12, note: 'Strong winter seasonality: cold snaps send it flying.' },
  { code: 'HO', name: 'Heating Oil', group: 'energy', size: '42,000 gallons', multiplier: 42_000, quote: '$ per gallon',
    delivery: { quantity: 42_000, unit: 'gallons', what: 'heating oil' }, months: MONTHLY, start: 0.5, vol: 0.3, halfLife: 1.5,
    season: { amplitude: 0.08, peak: 15 }, margin: 0.08, beta: 0.2, factor: 'oil', note: 'Winter fuel for the Northeast.' },
  { code: 'RB', name: 'Gasoline', group: 'energy', size: '42,000 gallons', multiplier: 42_000, quote: '$ per gallon',
    delivery: { quantity: 42_000, unit: 'gallons', what: 'gasoline' }, months: MONTHLY, start: 0.53, vol: 0.34, halfLife: 1.5,
    season: { amplitude: 0.1, peak: 160 }, margin: 0.09, beta: 0.2, factor: 'oil', note: 'Peaks with the summer driving season.' },
  { code: 'GC', name: 'Gold', group: 'metals', size: '100 troy ounces', multiplier: 100, quote: '$ per ounce',
    delivery: { quantity: 100, unit: 'troy ounces', what: 'gold' }, months: [1, 3, 5, 7, 9, 11], start: 290, vol: 0.14, halfLife: 4,
    margin: 0.05, beta: -0.1, haven: 1, factor: 'precious', note: 'A safe haven when stocks crash.' },
  { code: 'SI', name: 'Silver', group: 'metals', size: '5,000 troy ounces', multiplier: 5000, quote: '$ per ounce',
    delivery: { quantity: 5000, unit: 'troy ounces', what: 'silver' }, months: [2, 4, 6, 8, 11], start: 5.9, vol: 0.24, halfLife: 3,
    margin: 0.07, beta: 0.1, haven: 0.4, factor: 'precious', note: 'Gold’s excitable little brother.' },
  { code: 'HG', name: 'Copper', group: 'metals', size: '25,000 pounds', multiplier: 25_000, quote: '$ per pound',
    delivery: { quantity: 25_000, unit: 'pounds', what: 'copper' }, months: [2, 4, 6, 8, 11], start: 0.78, vol: 0.24, halfLife: 2,
    margin: 0.07, beta: 0.6, note: 'Tracks the economy. Dr. Copper has a PhD in GDP.' },
  { code: 'PL', name: 'Platinum', group: 'metals', size: '50 troy ounces', multiplier: 50, quote: '$ per ounce',
    delivery: { quantity: 50, unit: 'troy ounces', what: 'platinum' }, months: [0, 3, 6, 9], start: 375, vol: 0.22, halfLife: 2,
    margin: 0.07, beta: 0.2, haven: 0.3, factor: 'precious', note: 'Catalytic converters and jewellery.' },
  { code: 'ZC', name: 'Corn', group: 'grains', size: '5,000 bushels', multiplier: 5000, quote: '$ per bushel',
    delivery: { quantity: 5000, unit: 'bushels', what: 'corn' }, months: [2, 4, 6, 8, 11], start: 2.75, vol: 0.24, halfLife: 1,
    season: { amplitude: 0.06, peak: 190 }, margin: 0.06, factor: 'grain', note: 'Weather-driven: watch the Corn Belt in summer.' },
  { code: 'ZW', name: 'Wheat', group: 'grains', size: '5,000 bushels', multiplier: 5000, quote: '$ per bushel',
    delivery: { quantity: 5000, unit: 'bushels', what: 'wheat' }, months: [2, 4, 6, 8, 11], start: 3.3, vol: 0.25, halfLife: 1,
    season: { amplitude: 0.05, peak: 120 }, margin: 0.06, factor: 'grain', note: 'Bakers hate it when this goes up.' },
  { code: 'ZS', name: 'Soybeans', group: 'grains', size: '5,000 bushels', multiplier: 5000, quote: '$ per bushel',
    delivery: { quantity: 5000, unit: 'bushels', what: 'soybeans' }, months: [0, 2, 4, 6, 7, 8, 10], start: 6.8, vol: 0.22, halfLife: 1,
    season: { amplitude: 0.05, peak: 200 }, margin: 0.06, factor: 'grain', note: 'Feed, oil and tofu.' },
  { code: 'KC', name: 'Coffee', group: 'softs', size: '37,500 pounds', multiplier: 37_500, quote: '$ per pound',
    delivery: { quantity: 37_500, unit: 'pounds', what: 'coffee beans' }, months: [2, 4, 6, 8, 11], start: 1.7, vol: 0.4, halfLife: 1,
    margin: 0.1, note: 'Frost in Brazil is its worst nightmare.' },
  { code: 'CC', name: 'Cocoa', group: 'softs', size: '10 tonnes', multiplier: 10, quote: '$ per tonne',
    delivery: { quantity: 10, unit: 'tonnes', what: 'cocoa beans' }, months: [2, 4, 6, 8, 11], start: 1600, vol: 0.3, halfLife: 1.5,
    margin: 0.08, note: 'Chocolate makers watch West Africa’s weather.' },
  { code: 'SB', name: 'Sugar', group: 'softs', size: '112,000 pounds', multiplier: 112_000, quote: '$ per pound',
    delivery: { quantity: 112_000, unit: 'pounds', what: 'raw sugar' }, months: [2, 4, 6, 9], start: 0.12, vol: 0.3, halfLife: 1.5,
    margin: 0.08, note: 'Cane from Brazil and India.' },
  { code: 'CT', name: 'Cotton', group: 'softs', size: '50,000 pounds', multiplier: 50_000, quote: '$ per pound',
    delivery: { quantity: 50_000, unit: 'pounds', what: 'cotton' }, months: [2, 4, 6, 9, 11], start: 0.66, vol: 0.24, halfLife: 1,
    season: { amplitude: 0.04, peak: 180 }, margin: 0.06, note: 'The fabric of your portfolio.' },
  { code: 'OJ', name: 'Frozen Orange Juice', group: 'softs', size: '15,000 pounds', multiplier: 15_000, quote: '$ per pound',
    delivery: { quantity: 15_000, unit: 'pounds', what: 'frozen orange juice concentrate' }, months: [0, 2, 4, 6, 8, 10], start: 1.0,
    vol: 0.3, halfLife: 1, season: { amplitude: 0.05, peak: 30 }, margin: 0.08,
    note: 'Freeze events and frequent crop-report surprises. Ask the Duke brothers.' },
  { code: 'LE', name: 'Live Cattle', group: 'livestock', size: '40,000 pounds', multiplier: 40_000, quote: '$ per pound',
    delivery: { quantity: 40_000, unit: 'pounds', what: 'live cattle (about thirty head)' }, months: [1, 3, 5, 7, 9, 11], start: 0.67,
    vol: 0.14, halfLife: 1, season: { amplitude: 0.03, peak: 100 }, margin: 0.05, beta: 0.1, factor: 'livestock',
    note: 'Beef on the hoof. Please mind the carpet.' },
  { code: 'HE', name: 'Lean Hogs', group: 'livestock', size: '40,000 pounds', multiplier: 40_000, quote: '$ per pound',
    delivery: { quantity: 40_000, unit: 'pounds', what: 'lean hogs' }, months: [1, 3, 4, 5, 6, 7, 9, 11], start: 0.6, vol: 0.24,
    halfLife: 0.7, season: { amplitude: 0.08, peak: 180 }, margin: 0.07, beta: 0.1, factor: 'livestock',
    note: 'Summer barbecues lift it.' },
  { code: 'LBS', name: 'Lumber', group: 'forest', size: '110,000 board feet', multiplier: 110, quote: '$ per 1,000 board feet',
    delivery: { quantity: 110_000, unit: 'board feet', what: 'lumber' }, months: [0, 2, 4, 6, 8, 10], start: 320, vol: 0.3, halfLife: 1,
    season: { amplitude: 0.05, peak: 100 }, margin: 0.08, beta: 0.3, note: 'Moves logging stocks. Wildfires move it.' },
  { code: 'MJ', name: 'MAJOR 500 Index', group: 'financial', size: '$250 × index', multiplier: 250, quote: 'index points',
    months: QUARTERLY, start: 1000, vol: 0.15, halfLife: 0, margin: 0.06, note: 'The whole market in one contract. Settled in cash.' },
  { code: 'ZN', name: '10-Year Note', group: 'financial', size: '$100,000 face value', multiplier: 1000, quote: 'points of par',
    months: QUARTERLY, start: 103, vol: 0.06, halfLife: 0, margin: 0.03,
    note: 'Moves with the Federal Reservoir. A 6% coupon note, settled in cash.' },
];

export const CONTRACT_INDEX: Readonly<Record<string, number>> = Object.fromEntries(CONTRACTS.map((c, k) => [c.code, k]));
/** The index future and the 10-Year Note are priced from the MAJOR 500 and from bond yields, not from a spot model. */
export const MJ = CONTRACT_INDEX.MJ;
export const ZN = CONTRACT_INDEX.ZN;
/** Contracts with a commodity behind them. */
export const PHYSICAL = CONTRACTS.flatMap((c, k) => (c.delivery ? [k] : []));

/** Maintenance margin as a share of initial margin, as exchanges set it. */
export const MAINTENANCE = 0.75;
/** Listed contract months shown in each chain. */
export const CHAIN_LENGTH = 6;
/** How closely commodities in a factor move together: the factor's share of their variance. */
export const FACTOR_WEIGHT: Readonly<Record<string, number>> = { oil: 0.85, precious: 0.5, grain: 0.5, livestock: 0.3 };
/** Annual volatility of each commodity's long-run price level (commodity prices wander over the decades). */
export const MEAN_VOL = 0.06;
/** The MAJOR 500's dividend yield, which the index future's carry nets off. */
export const INDEX_YIELD = 0.016;
/** The 10-Year Note: its coupon, how its yield sits over the policy rate, and how fast and far it wanders. */
export const NOTE = { coupon: 6, years: 10, premium: 0.004, halfLife: 0.5, vol: 0.008, start: 0.056 };

/** Delivered goods in the lobby: storage per calendar day, as a share of their value, and the merchant's discount. */
export const STORAGE_RATE = 0.002;
export const PHYSICAL_DISCOUNT = 0.1;
/** Held short past the last trading day: the exchange fines the failure to deliver, as a share of the contract's value. */
export const FTD_FINE = 0.1;
/** Held contracts get a warning this many trading days before they expire. */
export const EXPIRY_WARNING_DAYS = 3;

/**
 * How each industry's stocks move with commodity prices (spec §10.4, §11.2's Σ c·ΔCommodity): a loading on each
 * commodity's log return. Logging +lumber, airlines −crude, bakeries −wheat, farm equipment +corn, miners +copper and
 * gold, refiners +crack spread, chocolate makers −cocoa.
 */
export const COMMODITY_EXPOSURE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  oilGas: { CL: 0.5, NG: 0.15 },
  refining: { RB: 0.35, HO: 0.3, CL: -0.5 },
  airlines: { CL: -0.3 },
  shipping: { CL: -0.1 },
  railroads: { CL: -0.08 },
  chemicals: { CL: -0.12, NG: -0.08 },
  utilities: { NG: -0.06 },
  renewables: { CL: 0.08, NG: 0.06 },
  mining: { HG: 0.45, GC: 0.08 },
  preciousMetals: { GC: 0.7, SI: 0.15, PL: 0.08 },
  steel: { HG: 0.05 },
  logging: { LBS: 0.45 },
  paper: { LBS: 0.1 },
  construction: { LBS: -0.12, HG: -0.05 },
  agriculture: { ZC: 0.25, ZS: 0.15, ZW: 0.1, LE: 0.05 },
  foodBeverage: { ZW: -0.06, SB: -0.06, CC: -0.05, KC: -0.04 },
  restaurants: { LE: -0.08, KC: -0.04 },
  apparel: { CT: -0.1 },
  autos: { RB: -0.06 },
  hotels: { CL: -0.04 },
};

/**
 * Weather the National Weather Bureau warns about (spec §14): droughts, frosts, freezes, hurricanes. A warning comes a few
 * trading days before the weather hits and moves the markets a little; most come true and move them properly.
 */
export interface Hazard {
  id: string;
  /** "Drought", as a headline says it. */
  name: string;
  region: string;
  /** What the Bureau's bulletin is called. */
  warning: string;
  /** Months (0–11) it can strike in, and how many warnings an average season brings. */
  months: readonly number[];
  rate: number;
  /** Log moves of each commodity's price when it hits: [code, smallest, largest], signed. */
  moves: readonly (readonly [string, number, number])[];
}

export const HAZARDS: readonly Hazard[] = [
  { id: 'cornDrought', name: 'Drought', region: 'the Corn Belt', warning: 'Drought Warning', months: [5, 6, 7], rate: 0.8,
    moves: [['ZC', 0.08, 0.25], ['ZS', 0.05, 0.15]] },
  { id: 'plainsDrought', name: 'Drought', region: 'the Great Plains', warning: 'Drought Warning', months: [3, 4, 5, 6], rate: 0.6,
    moves: [['ZW', 0.06, 0.18]] },
  { id: 'brazilFrost', name: 'Frost', region: 'Brazil’s coffee belt', warning: 'Frost Warning', months: [5, 6, 7], rate: 0.5,
    moves: [['KC', 0.15, 0.4], ['SB', 0.02, 0.06]] },
  { id: 'floridaFreeze', name: 'Hard freeze', region: 'Florida’s orange groves', warning: 'Hard Freeze Warning', months: [11, 0, 1],
    rate: 0.5, moves: [['OJ', 0.15, 0.35]] },
  { id: 'hurricane', name: 'Hurricane', region: 'the Gulf of Mexico', warning: 'Hurricane Watch', months: [5, 6, 7, 8, 9, 10], rate: 0.8,
    moves: [['NG', 0.06, 0.2], ['CL', 0.02, 0.07], ['RB', 0.04, 0.12], ['HO', 0.02, 0.07], ['OJ', 0.02, 0.08], ['CT', 0.01, 0.05]] },
  { id: 'coldSnap', name: 'Arctic blast', region: 'the Northeast', warning: 'Arctic Blast Warning', months: [11, 0, 1], rate: 0.8,
    moves: [['NG', 0.1, 0.3], ['HO', 0.06, 0.18]] },
  { id: 'mildWinter', name: 'Mild winter', region: 'the Midwest and Northeast', warning: 'Mild Winter Outlook', months: [10, 11, 0],
    rate: 0.5, moves: [['NG', -0.2, -0.08], ['HO', -0.12, -0.05]] },
  { id: 'heatwave', name: 'Heatwave', region: 'Texas and the Plains', warning: 'Excessive Heat Warning', months: [6, 7], rate: 0.5,
    moves: [['NG', 0.05, 0.15], ['LE', 0.02, 0.05], ['HE', 0.02, 0.06]] },
  { id: 'westAfricaDry', name: 'Dry spell', region: 'West Africa’s cocoa belt', warning: 'Dry Harmattan Outlook', months: [10, 11, 0, 1, 2],
    rate: 0.5, moves: [['CC', 0.08, 0.22]] },
  { id: 'weakMonsoon', name: 'Weak monsoon', region: 'India', warning: 'Weak Monsoon Outlook', months: [5, 6, 7, 8], rate: 0.4,
    moves: [['SB', 0.06, 0.16], ['CT', 0.04, 0.12]] },
  { id: 'flood', name: 'Flooding', region: 'the Mississippi valley', warning: 'Flood Warning', months: [3, 4, 5], rate: 0.4,
    moves: [['ZC', 0.03, 0.1], ['ZS', 0.03, 0.08]] },
  { id: 'bumperCrop', name: 'Perfect growing weather', region: 'the Corn Belt', warning: 'Ideal Growing Conditions Outlook',
    months: [6, 7, 8], rate: 0.7, moves: [['ZC', -0.15, -0.05], ['ZS', -0.1, -0.04], ['ZW', -0.1, -0.03]] },
  { id: 'wildfire', name: 'Wildfires', region: 'the Pacific Northwest', warning: 'Red Flag Warning', months: [6, 7, 8], rate: 0.4,
    moves: [['LBS', 0.08, 0.2]] },
];

/** How often a warning comes true, and how much of its move the market prices in when it is issued. */
export const WEATHER_RELIABILITY = 0.8;
export const WEATHER_PRICED = 0.15;
/** Trading days between a warning and the weather. */
export const WEATHER_LEAD: readonly [number, number] = [2, 5];

/** OPEK's decisions at its meetings (spec §12.3) and what each does to oil: [code, smallest, largest] log moves. */
export type OpekDecision = 'cut' | 'hold' | 'raise';
export const OPEK_MOVES: Readonly<Record<OpekDecision, readonly (readonly [string, number, number])[]>> = {
  cut: [['CL', 0.06, 0.15], ['BZ', 0.06, 0.14], ['HO', 0.04, 0.1], ['RB', 0.04, 0.1]],
  hold: [['CL', -0.03, 0.03], ['BZ', -0.03, 0.03]],
  raise: [['CL', -0.12, -0.05], ['BZ', -0.12, -0.05], ['HO', -0.08, -0.03], ['RB', -0.08, -0.03]],
};
/** OPEK meets on the last Wednesday of these months (0–11), announcing at 14:00. */
export const OPEK_MONTHS = [2, 5, 10];
export const OPEK_MINUTE = 14 * 60;
/** Delegates hint at the outcome this many trading days before; the hint is right this often and priced in this much. */
export const OPEK_HINT_DAYS = 5;
export const OPEK_RELIABILITY = 0.7;
export const OPEK_PRICED = 0.3;
