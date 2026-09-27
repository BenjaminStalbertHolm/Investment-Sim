// News outlets (spec §14.1): who they are, how fast and how credible, and what they cover. Data only: sim/press.ts
// applies the rules, sites/news/ renders the outlets.
import { INDUSTRIES } from '../../world/industries';
import { COMMODITY_KINDS, type NewsKind } from '../news';
import { COMMODITY_EXPOSURE } from './commodities';

/** When an outlet runs a story after it breaks (spec §11.7: the publication cascade). */
export type Cadence = 'instant' | 'bar' | 'hour' | 'morning' | 'weekly';

/** A story is covered when any rule matches; a rule matches when all its conditions hold. */
export interface CoverageRule {
  /** Kinds it covers. Without it, a rule covers corporate news, earnings and the economy, not picks or firm news. */
  kinds?: readonly NewsKind[];
  /** The company's market cap at the start (a paper's sense of who matters doesn't track every tick). */
  minCap?: number;
  maxCap?: number;
  /** The size of the move, as a fraction. */
  minMove?: number;
  industries?: readonly string[];
  /** Companies headquartered outside the United States. */
  foreign?: boolean;
  /** Weather and OPEK stories about these commodities (contract codes). */
  commodities?: readonly string[];
}

export interface Outlet {
  id: string;
  name: string;
  host: string;
  /** How far readers believe it (spec §14.1): scales news-driven effects. */
  credibility: number;
  cadence: Cadence;
  /** Staff writers, and the range of their integrity (spec §14.1, used by the dark web in Phase 9). */
  staff: number;
  integrity: readonly [number, number];
  rules: readonly CoverageRule[];
  /** Trade press: the industry it serves. */
  industry?: string;
}

const MACRO: readonly NewsKind[] = ['jobs', 'cpi', 'gdp', 'confidence', 'fed'];
const DEALS: readonly NewsKind[] = ['takeover', 'takeoverDone', 'takeoverFail'];
const TECH = ['software', 'semiconductors', 'hardware', 'internet', 'telecom', 'videoGames'];
const COMMODITIES = ['oilGas', 'refining', 'mining', 'preciousMetals', 'agriculture', 'steel', 'chemicals', 'shipping'];

export const OUTLETS: readonly Outlet[] = [
  { id: 'newswire', name: 'Majorsoft Newswire', host: 'newswire.majorsoft.com', credibility: 0.9, cadence: 'instant',
    staff: 6, integrity: [0.7, 0.95], rules: [{}, { kinds: ['firmQuarter', 'mandate', 'stake', 'league', 'enforcement'] }] },
  { id: 'moneytv', name: 'MoneyTV Online', host: 'www.moneytv.com', credibility: 0.5, cadence: 'bar', staff: 4,
    integrity: [0.3, 0.7],
    rules: [{ minCap: 2e9 }, { minCap: 100e6, minMove: 0.2 }, { kinds: MACRO }, { kinds: ['tvPick'] }, { kinds: ['opek'] }, { kinds: ['weatherHit'], minMove: 0.1 }] },
  { id: 'nyjournal', name: 'The New York Journal', host: 'www.nyjournal.com', credibility: 0.95, cadence: 'morning',
    staff: 5, integrity: [0.85, 1],
    rules: [
      { kinds: ['fraud', 'scandal', 'lawsuit', 'bankruptcy', 'shortReport', 'strike'], minCap: 1e9 },
      { kinds: [...DEALS, 'ceoChange', 'activist'], minCap: 20e9 },
      { kinds: ['fed', 'jobs'] },
      { kinds: ['enforcement'] },
    ] },
  { id: 'jottings', name: 'The Wall Street Jottings', host: 'www.wsjottings.com', credibility: 0.95, cadence: 'morning',
    staff: 6, integrity: [0.8, 1],
    rules: [{ minCap: 10e9 }, { minCap: 1e9, minMove: 0.15 }, { kinds: MACRO }, { kinds: DEALS, minCap: 2e9 }, { kinds: ['opek', 'weatherHit'] }, { kinds: ['enforcement'] }] },
  { id: 'ftimez', name: 'Financial Timez', host: 'www.ftimez.co.uk', credibility: 0.85, cadence: 'morning', staff: 4,
    integrity: [0.75, 0.95],
    rules: [{ kinds: MACRO }, { foreign: true, minCap: 5e9 }, { industries: COMMODITIES, minCap: 5e9 }, { kinds: DEALS, minCap: 5e9 }, { kinds: COMMODITY_KINDS }] },
  { id: 'barrens', name: 'Barren’s Weekly', host: 'www.barrens.com', credibility: 0.85, cadence: 'weekly', staff: 3,
    integrity: [0.7, 0.95], rules: [{ minCap: 10e9, minMove: 0.05 }, { minCap: 1e9, minMove: 0.25 }, { kinds: ['firmQuarter', 'league'] }] },
  { id: 'dailyscoop', name: 'The Daily Scoop', host: 'www.dailyscoop.com', credibility: 0.25, cadence: 'morning', staff: 3,
    integrity: [0.05, 0.4], rules: [{ kinds: ['scandal', 'ceoChange', 'fraud', 'lawsuit', 'strike', 'hack', 'bankruptcy'], minCap: 1e9 }, { kinds: ['enforcement'] }] },
  { id: 'wyred', name: 'Wyred', host: 'www.wyred.com', credibility: 0.55, cadence: 'morning', staff: 3, integrity: [0.4, 0.8],
    rules: [{ industries: TECH, kinds: ['launch', 'hack', 'investment', 'contract', 'fraud', 'ceoChange', ...DEALS], minCap: 300e6 }] },
  { id: 'motleyfowl', name: 'The Motley Fowl', host: 'www.motleyfowl.com', credibility: 0.4, cadence: 'morning', staff: 2,
    integrity: [0.3, 0.7],
    rules: [
      { kinds: ['fowlPick'] },
      { kinds: ['launch', 'contract', 'approval', 'investment', 'upgrade', 'buyback', 'activist', 'takeover'], minCap: 100e6, maxCap: 2e9 },
    ] },
];

/** One trade paper per industry (spec §14.1): name and web host. */
const TRADE_PRESS: Readonly<Record<string, readonly [string, string]>> = {
  software: ['Software Weekly', 'softwareweekly'], semiconductors: ['Silicon Gazette', 'silicongazette'],
  hardware: ['The Motherboard', 'themotherboard'], internet: ['Webmaster Weekly', 'webmasterweekly'],
  telecom: ['Dial Tone Digest', 'dialtonedigest'], banks: ['The Vault Report', 'vaultreport'],
  insurance: ['Actuary Today', 'actuarytoday'], assetManagement: ['Fund Manager Monthly', 'fundmanagermonthly'],
  payments: ['Card Swipe News', 'cardswipenews'], pharma: ['Pharma Weekly', 'pharmaweekly'],
  biotech: ['Petri Dish Daily', 'petridishdaily'], medicalDevices: ['Device Digest', 'devicedigest'],
  healthServices: ['Bedside Business', 'bedsidebusiness'], oilGas: ['Oil & Gas Gazette', 'oilgasgazette'],
  refining: ['Crack Spread Journal', 'crackspreadjournal'], utilities: ['The Grid', 'thegridnews'],
  renewables: ['Windmill Weekly', 'windmillweekly'], mining: ['Pit & Quarry Review', 'pitandquarry'],
  preciousMetals: ['Goldbug Gazette', 'goldbuggazette'], chemicals: ['Chemical Reaction', 'chemicalreaction'],
  steel: ['Steel Times', 'steeltimes'], logging: ['Timber Times', 'timbertimes'], paper: ['Pulp & Paper Post', 'pulppaperpost'],
  agriculture: ['Harvest Herald', 'harvestherald'], foodBeverage: ['The Grocer’s Gazette', 'grocersgazette'],
  tobacco: ['Smoke Signals', 'smokesignalsnews'], retail: ['Shelf Life', 'shelflifenews'], apparel: ['Runway Report', 'runwayreport'],
  restaurants: ['Short Order', 'shortordernews'], autos: ['Motor Trade News', 'motortradenews'], airlines: ['Jet Lag', 'jetlagnews'],
  aerospace: ['Aerospace Dispatch', 'aerodispatch'], shipping: ['The Manifest', 'themanifest'], railroads: ['Rail Gazette', 'railgazette'],
  construction: ['Hard Hat Herald', 'hardhatherald'], realEstate: ['Brick & Mortar Report', 'brickmortarreport'],
  media: ['Showbiz Ledger', 'showbizledger'], videoGames: ['Joystick Journal', 'joystickjournal'],
  hotels: ['Check-In Chronicle', 'checkinchronicle'], conglomerate: ['Boardroom Brief', 'boardroombrief'],
};

/** How far readers believe the trade press's grapevine and the Raging Bear boards (spec §11.7, §14). */
export const TRADE_CREDIBILITY = 0.6;
export const FORUM_CREDIBILITY = 0.25;

/** Every outlet: the national ones, then the trade press in industry order. */
export const ALL_OUTLETS: readonly Outlet[] = [
  ...OUTLETS,
  ...INDUSTRIES.map((industry): Outlet => {
    const [name, slug] = TRADE_PRESS[industry.id];
    return {
      id: `trade-${industry.id}`, name, host: `www.${slug}.com`, credibility: TRADE_CREDIBILITY, cadence: 'hour', staff: 1,
      integrity: [0.4, 0.8], industry: industry.id,
      rules: [
        { industries: [industry.id], minCap: 50e6 },
        ...(industry.id === 'assetManagement' ? [{ kinds: ['mandate', 'stake', 'league', 'enforcement'] as const }] : []),
        // The weather and OPEK news of the commodities the industry lives by.
        ...(COMMODITY_EXPOSURE[industry.id] ? [{ kinds: COMMODITY_KINDS, commodities: Object.keys(COMMODITY_EXPOSURE[industry.id]) }] : []),
      ],
    };
  }),
];

export const OUTLET = Object.fromEntries(ALL_OUTLETS.map((o) => [o.id, o])) as Record<string, Outlet>;

/** Beats (spec §14.1): the industries a general outlet's writers cover, grouped as a newsroom would. */
export const BEATS: readonly { name: string; industries: readonly string[] }[] = [
  { name: 'Technology', industries: TECH },
  { name: 'Finance', industries: ['banks', 'insurance', 'assetManagement', 'payments', 'realEstate'] },
  { name: 'Health', industries: ['pharma', 'biotech', 'medicalDevices', 'healthServices'] },
  { name: 'Energy', industries: ['oilGas', 'refining', 'utilities', 'renewables'] },
  { name: 'Materials', industries: ['mining', 'preciousMetals', 'chemicals', 'steel', 'logging', 'paper', 'agriculture'] },
  { name: 'Consumer', industries: ['foodBeverage', 'tobacco', 'retail', 'apparel', 'restaurants', 'hotels', 'media'] },
  { name: 'Industrials', industries: ['autos', 'airlines', 'aerospace', 'shipping', 'railroads', 'construction', 'conglomerate'] },
];
