// The dark web (spec §14A): its markets, what each sells and on what terms, the vendors' handles and the Bazaar's
// wares. Data only: sim/darkweb.ts runs the markets, sites/darkweb/ shows them in the Garlic Browser.

export type MarketId =
  | 'press' | 'leaks' | 'bots' | 'spies' | 'hackers' | 'shells' | 'pump' | 'rumours' | 'forgery' | 'sharks' | 'bazaar';

export type ServiceId =
  | 'puffFirm' | 'puffStock' | 'hitFirm' | 'hitCompany'
  | 'leakEarnings' | 'leakDeal'
  | 'botHype' | 'botFud'
  | 'spyHoldings' | 'spyTrades'
  | 'ddos' | 'deface'
  | 'shell'
  | 'pump'
  | 'rumour'
  | 'forgery'
  | 'shark'
  | 'watch' | 'software' | 'meanie' | 'newsletter';

/** What a buyer chooses: a journalist to pay, a company or competitor firm as the target, an amount. */
export type Param = 'journalist' | 'company' | 'firm' | 'amount';

export interface Market {
  id: MarketId;
  name: string;
  /** Its .garlic address (spec §14A: "http://k3v9x2qplm7a.garlic"). */
  host: string;
  motto: string;
  /** Vendors trading there at any time. */
  vendors: number;
  /** Whether some of its vendors are exit scams or SOB stings (spec §14A); the bank-like markets always pay out. */
  risky: boolean;
}

export const MARKETS: readonly Market[] = [
  { id: 'press', name: 'Press for Sale', host: 'hitm5lizqgwy.garlic', motto: 'Every journalist has a price. We know it.', vendors: 3, risky: true },
  { id: 'leaks', name: 'The Leak Bazaar', host: 'e35i72ednvbe.garlic', motto: 'Tomorrow’s news, today’s prices.', vendors: 3, risky: true },
  { id: 'bots', name: 'Bot Farm', host: 'i5b6vgzzd3up.garlic', motto: '10,000 satisfied posters. None of them real.', vendors: 2, risky: true },
  { id: 'spies', name: 'Cloak & Dagger', host: 'klntw7raz7ek.garlic', motto: 'Their filing cabinet is our filing cabinet.', vendors: 2, risky: true },
  { id: 'hackers', name: 'Hackers-for-hire', host: 'dwkcqfvrmlbo.garlic', motto: 'We put the “elite” in 31337.', vendors: 2, risky: true },
  { id: 'shells', name: 'Shell Company Registry', host: 'yz3rueuonauo.garlic', motto: 'Beneficial ownership: nobody’s business.', vendors: 2, risky: false },
  { id: 'pump', name: 'Pump Syndicate', host: '5jqn3hvt2qrh.garlic', motto: 'Up like a rocket. Down like the stick.', vendors: 2, risky: true },
  { id: 'rumours', name: 'Rumour Mill', host: '6wn3q5dktzy4.garlic', motto: 'Where there’s smoke, there’s us.', vendors: 2, risky: true },
  { id: 'forgery', name: 'Forgery Desk', host: '7xaxymrkmjim.garlic', motto: 'Past performance is no guarantee of anything.', vendors: 2, risky: true },
  { id: 'sharks', name: 'Loan Sharks', host: '4qmamw3sdptg.garlic', motto: 'Fast money. Faster collections.', vendors: 2, risky: false },
  { id: 'bazaar', name: 'Bazaar', host: '252tj657knyv.garlic', motto: 'Genuine fakes. Fake genuines.', vendors: 2, risky: true },
];

export const MARKET = Object.fromEntries(MARKETS.map((m) => [m.id, m])) as Record<MarketId, Market>;

/** The Garlic network's directory and its forum (spec §14A: The Cellar). */
export const CLOVE = '7khjpcpclcfv.garlic';
export const CELLAR = 'bk5fuzfv3nqt.garlic';

export interface Service {
  id: ServiceId;
  market: MarketId;
  name: string;
  blurb: string;
  params: readonly Param[];
  /** Chance it works before the difficulty's dark web odds (press: worked out from the journalist, spec §14A). */
  chance: number;
  /** Heat it adds when it works (every dark web action draws some attention, spec §16B) and when it fails. */
  heat: number;
  failHeat: number;
  /** Always does what it says (the loan sharks always pay out; a shell is always registered). */
  certain?: boolean;
}

export const SERVICES: readonly Service[] = [
  { id: 'puffFirm', market: 'press', name: 'Glowing profile of your firm', blurb: 'A journalist writes your firm up as the smartest money in town.',
    params: ['journalist'], chance: 0, heat: 3, failHeat: 0 },
  { id: 'puffStock', market: 'press', name: 'Positive article about a stock', blurb: 'A rave review of a company of your choosing. Readers buy.',
    params: ['journalist', 'company'], chance: 0, heat: 3, failHeat: 0 },
  { id: 'hitFirm', market: 'press', name: 'Hit piece on a competitor', blurb: 'A rival firm’s clients read all about its failings.',
    params: ['journalist', 'firm'], chance: 0, heat: 3, failHeat: 0 },
  { id: 'hitCompany', market: 'press', name: 'Hit piece on a company', blurb: 'Pairs well with a short position.',
    params: ['journalist', 'company'], chance: 0, heat: 3, failHeat: 0 },
  { id: 'leakEarnings', market: 'leaks', name: 'Upcoming earnings surprise', blurb: 'Whether a company reporting in the next two weeks will beat or miss.',
    params: ['company'], chance: 0, heat: 2, failHeat: 0 },
  { id: 'leakDeal', market: 'leaks', name: 'Pending takeover target', blurb: 'The name of a company about to receive a takeover bid. Refunded if nothing is in the pipeline.',
    params: [], chance: 0, heat: 2, failHeat: 0 },
  { id: 'botHype', market: 'bots', name: 'Hype campaign on Raging Bear', blurb: 'A flood of rocket emojis for a small company’s message board.',
    params: ['company'], chance: 0.7, heat: 3, failHeat: 15 },
  { id: 'botFud', market: 'bots', name: 'FUD campaign on Raging Bear', blurb: 'Fear, uncertainty and doubt, by the thousand posts.',
    params: ['company'], chance: 0.7, heat: 3, failHeat: 15 },
  { id: 'spyHoldings', market: 'spies', name: 'A competitor’s current holdings', blurb: 'Today’s book, not the one it filed 45 days ago.',
    params: ['firm'], chance: 0.55, heat: 3, failHeat: 30 },
  { id: 'spyTrades', market: 'spies', name: 'A competitor’s next big trades', blurb: 'What its trading desk will buy and sell at the week’s close.',
    params: ['firm'], chance: 0.55, heat: 3, failHeat: 30 },
  { id: 'ddos', market: 'hackers', name: 'DDoS a competitor’s web site', blurb: 'Their site stays down for three trading days.',
    params: ['firm'], chance: 0.65, heat: 3, failHeat: 40 },
  { id: 'deface', market: 'hackers', name: 'Deface a company’s web site', blurb: 'Your message on their home page, for all the world to see.',
    params: ['company'], chance: 0.65, heat: 3, failHeat: 40 },
  { id: 'shell', market: 'shells', name: 'Offshore shell company', blurb: 'Holds stakes without 5% filings, and routes payments with less of a trail.',
    params: [], chance: 1, heat: 5, failHeat: 30, certain: true },
  { id: 'pump', market: 'pump', name: 'Join a pump-and-dump', blurb: 'Buy in, we pump the penny stock, you get out before the dump. Usually.',
    params: ['amount'], chance: 0.5, heat: 3, failHeat: 10 },
  { id: 'rumour', market: 'rumours', name: 'Plant a takeover rumour', blurb: 'Word gets round that a big buyer is circling.',
    params: ['company'], chance: 0.6, heat: 5, failHeat: 20 },
  { id: 'forgery', market: 'forgery', name: 'Doctored quarterly statements', blurb: 'Your clients’ next statements show you beating the index, whatever happens.',
    params: [], chance: 0.7, heat: 3, failHeat: 30 },
  { id: 'shark', market: 'sharks', name: 'Loan beyond bank limits', blurb: 'Cash today. Interest every Friday. No paperwork.',
    params: ['amount'], chance: 1, heat: 0, failHeat: 0, certain: true },
  { id: 'watch', market: 'bazaar', name: '“Genuine” Rolecks Oyster Perpetual', blurb: 'Swiss made. The Swiss part is a sticker.', params: [], chance: 0.1, heat: 0, failHeat: 0 },
  { id: 'software', market: 'bazaar', name: 'Bootleg Doors 98 Plus! CD', blurb: 'All the themes. Some of the viruses.', params: [], chance: 0.5, heat: 0, failHeat: 0 },
  { id: 'meanie', market: 'bazaar', name: 'Meanie Babies (Princess the Bear, 12 pcs)', blurb: 'Tags guaranteed mint. Bears guaranteed bears.', params: [], chance: 0.2, heat: 0, failHeat: 0 },
  { id: 'newsletter', market: 'bazaar', name: '“The Truth Is Out There” newsletter', blurb: 'Twelve issues on what the Federal Reservoir doesn’t want you to know.', params: [], chance: 0.3, heat: 0, failHeat: 0 },
];

export const SERVICE = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, Service>;

/** Prices before a vendor's markup (spec §14A "typical cost"). */
export const PRICES = {
  /** A bribe runs from the Daily Scoop's to the New York Journal's, by how far readers believe the outlet. */
  press: [15_000, 500_000],
  leakEarnings: [5_000, 250_000],
  leakDeal: 150_000,
  bots: [2_000, 50_000],
  spies: [50_000, 300_000],
  hackers: [10_000, 80_000],
  shell: 100_000,
  /** A shell's yearly fee to its registered agent. */
  shellYear: 20_000,
  rumour: 30_000,
  forgery: 40_000,
  bazaar: { watch: 2_500, software: 40, meanie: 300, newsletter: 99 } as Record<string, number>,
} as const;

/** A bribed journalist is cheaper, and likelier to play along, the next time (spec §14A). */
export const REPEAT_DISCOUNT = 0.3;
export const REPEAT_BONUS = 0.1;
/** Success chance points lost per point of heat: an attentive regulator makes everyone nervous (spec §14A). */
export const HEAT_PENALTY = 0.002;
/** Paying through a shell: its handling fee, and the share of the heat and of the auditors' interest left (spec §14A). */
export const SHELL_FEE = 0.1;
export const SHELL_TRAIL = 0.5;
/** Bot farms and rumours work on companies up to these sizes. */
export const BOT_MAX_CAP = 2e9;
/** The earnings leaks on sale: companies reporting within this many trading days. */
export const LEAK_DAYS = 10;
/** Pump-and-dumps: the buy-in allowed, the penny stocks they pick, and what a buyer makes or loses. */
export const PUMP_BUY_IN: readonly [number, number] = [10_000, 500_000];
export const PUMP_GAIN: readonly [number, number] = [0.3, 1.2];
export const PUMP_LOSS: readonly [number, number] = [0.5, 0.9];
/**
 * Loan sharks (spec §14A): how much, the weekly interest, the collectors' discount, their penalty (a share of the loan) on
 * top of a missed payment, and the furniture gone for a week.
 */
export const SHARK_RANGE: readonly [number, number] = [5e6, 50e6];
export const SHARK_WEEKLY = 0.04;
export const SEIZE_DISCOUNT = 0.3;
export const SHARK_PENALTY = 0.1;
export const REPOSSESSED_DAYS = 5;
/** Shell companies: the chance a year of discovery at no heat and at heat 100 (spec §14A: it scales with heat). */
export const DISCOVERY: readonly [number, number] = [0.05, 0.9];
/** Web sites stay down or defaced for this many trading days. */
export const OUTAGE_DAYS = 3;
/** The forged statements' discovery comes this many trading days after the quarter they hid. */
export const FORGERY_FOUND: readonly [number, number] = [10, 60];
/** How vendors turn out (spec §14A: some vendors are SOB sting operations or exit scams). */
export const NATURES = { honest: 0.7, scam: 0.18, sting: 0.12 };
/** Chance a month that a scammer vanishes with everyone’s money, a sting is found out, an honest vendor retires. */
export const CHURN = { honest: 0.02, scam: 0.2, sting: 0.1 };
/** Chance each trading day that someone posts a real tip in The Cellar. */
export const CELLAR_TIP = 0.1;
/** Blackmail (spec §14A): a week's chance per bribed journalist, at no heat plus per point of heat; the demand, and the odds a refusal is published. */
export const BLACKMAIL = { base: 0.003, perHeat: 0.0004, demand: 2, publish: 0.6, days: 5 };

/** Vendor handles by market; a vendor keeps its handle for good. */
export const HANDLES: Record<MarketId, readonly string[]> = {
  press: ['InkForHire', 'QuillPro', 'ByLineBrokers', 'FrontPageFixer', 'PressGang', 'Stringer_X', 'SpinDoctor98', 'ColumnInches'],
  leaks: ['LeakyFaucet', 'DeepThroat98', 'TheMole', 'Whistler', 'AuditTrail', 'InsideJob', 'TippingPoint', 'MaterialNonPublic'],
  bots: ['BotLord', 'SockPuppetry', 'ClickFarmer', 'EchoChamber', 'AstroTurfer', 'ModemMob'],
  spies: ['0x5py', 'CloakRoom', 'DumpsterDiver', 'MoleSkin', 'ShredderGuy', 'NightCleaner'],
  hackers: ['ZeroCool', 'Acid_Burn', 'Ph0ne_Phreak', 'ScriptKiddie', 'L0rdNikon', 'CrashOverride'],
  shells: ['CayManny', 'NomineeNick', 'RegisteredAgent', 'BraSSplate', 'OffshoreOllie', 'TrustMeTrust'],
  pump: ['PumpKing', 'MoonBoys', 'RocketFuel', 'BoilerRoom', 'StrattonOak', 'BagHolderFinder'],
  rumours: ['WhisperNet', 'Grapevine', 'HeardItHere', 'SmokeMachine', 'ChineseWhispers', 'Scuttlebutt'],
  forgery: ['CopyCat', 'InkJetIke', 'WhiteOut', 'PhotoCopier', 'SignatureMove', 'TipEx'],
  sharks: ['BigTony', 'KneecapKapital', 'SalTheVig', 'FridayFrankie', 'LittleNicky', 'TheAccountant'],
  bazaar: ['CheapRolecks', 'WarezWizard', 'BeanieBandit', 'TruthSeeker', 'CanalStreetCo', 'ForReal_Deals'],
};

/** Offshore shell names (spec §14A: Shell Company Registry): a name, a legal form and a jurisdiction. */
export const SHELL_NAMES = ['Tortuga', 'Blue Lagoon', 'Palm Frond', 'Silver Sands', 'Coral Reef', 'Pelican', 'Mangrove', 'Albatross', 'Seagull', 'Sandpiper', 'Driftwood', 'Conch'];
export const SHELL_FORMS = ['Holdings Ltd.', 'Nominees Inc.', 'Trading S.A.', 'Investments AG', 'Capital LLC', 'Ventures Ltd.'];
export const JURISDICTIONS = ['British Virgin Islands', 'Cayman Islands', 'Isle of Man', 'Panama', 'Liechtenstein', 'Jersey', 'Nauru', 'Vanuatu'];

/** Hacker crews who sign a defaced page. */
export const CREWS = ['The Phreak Brigade', 'Masters of Downloading', 'l33t Crew 98', 'Cult of the Dead Modem', 'The Y2K Bugs', 'Legion of Doors'];
