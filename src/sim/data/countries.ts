// The Geopolitics module's world (spec §16C.1): the countries Encarter 98 describes, their leaders, the pairs whose
// tensions escalate, and the events each can have. Data only: sim/geo.ts runs it, apps/encarter draws it.

export type PortraitVariant = 'penguin' | 'blur' | 'silhouette' | 'goat';

export interface LeaderSpec {
  title: string;
  /** A fixed name; without one the leader is generated (and replaced by elections and coups). */
  name?: string;
  note?: string;
  /** Fixed gag leaders are never replaced. */
  fixed?: boolean;
  portrait?: PortraitVariant;
  /** Features the portrait must have (portrait options by name), the rest drawn from the seed. */
  look?: Partial<Record<'hair' | 'accessory' | 'mouth' | 'facialHair' | 'eyes', string>>;
}

export interface CountrySpec {
  id: string;
  name: string;
  /** The hover text: one line. */
  hover: string;
  /** Natural Earth shapes (world-atlas ISO 3166 numeric ids) merged into this country; empty for a map marker only. */
  shapes: string[];
  /** A marker for places too small for the 1:110m map, [longitude, latitude]. */
  marker?: [number, number];
  /** Present-day countries of HQ cities (world/cities.ts) that belong to it. */
  cities: string[];
  /** 1 (fragile) to 5 (rock solid). */
  stability: number;
  exports: string;
  /** Its market role, as the country page says it. */
  role: string;
  /** Commodities (contract codes) its troubles move. */
  commodities: string[];
  leader: LeaderSpec;
  /** A country in an active real-world war: dry, factual text; supply and sanctions events only; no jokes, no ladder. */
  dry?: boolean;
  /** Greyed out and never referenced by any event (spec §16C.1). */
  nope?: boolean;
}

export const COUNTRIES: readonly CountrySpec[] = [
  { id: 'usga', name: 'United States of Greater America', shapes: ['840', '124', '304'], cities: ['United States', 'Canada', 'Greenland'], stability: 4,
    hover: 'Annexed Canada and Greenland over a long weekend. Canadians apologised for the inconvenience. Greenland is unchanged apart from a new Walmark.',
    exports: 'Software, aircraft, soybeans, films, apologies (Canadian)', role: 'Home of most of the top 100 companies, and of the Federal Reservoir.', commodities: ['ZS', 'ZC'],
    leader: { title: 'President', name: 'Chuck Hardwell', note: 'Signed the annexation papers on a napkin.' } },
  { id: 'mexico', name: 'Mexico', shapes: ['484'], cities: ['Mexico'], stability: 3,
    hover: 'The last independent country in North America, and understandably nervous about it.', exports: 'Cars, avocados, beer, televisions',
    role: 'Autos and agriculture; tariffs with the USGA.', commodities: ['ZC', 'SB'], leader: { title: 'President', name: 'Alejandro Preocupado', note: 'Sleeps with one eye on the northern border.' } },
  { id: 'swedenNorway', name: 'Union of Sweden-Norway', shapes: ['752', '578'], cities: ['Sweden', 'Norway'], stability: 5,
    hover: 'Back together after 93 years. The capital alternates between Stockholm and Oslo every leap year; nobody has actually moved.',
    exports: 'Oil, gas, timber, steel, flat-pack furniture', role: 'Oil, gas, timber and steel.', commodities: ['BZ', 'NG', 'LBS'],
    leader: { title: 'King', name: 'Oscar III', note: 'Picking up where Oscar II left off in 1905.', fixed: true } },
  { id: 'denmark', name: 'Denmark', shapes: ['208'], cities: ['Denmark'], stability: 5, hover: 'Filed a formal complaint about Greenland. The complaint was annexed.',
    exports: 'Insulin, shipping, pastries', role: 'Nova Nordic; shipping.', commodities: [], leader: { title: 'Prime Minister', name: 'Lars Grønholm', note: 'Still drafting the Greenland complaint, version 11.' } },
  { id: 'finland', name: 'Finland', shapes: ['246'], cities: ['Finland'], stability: 5, hover: 'Neutral, quiet, sauna-powered, and somehow the most stable economy on the map.',
    exports: 'Paper, telephones, silence', role: 'Paper, forestry and telecoms.', commodities: ['LBS'], leader: { title: 'President', name: 'Veikko Hiljainen', note: 'Has not said a word in public since 1994. Approval rating: 91%.' } },
  { id: 'germany', name: 'Germany', shapes: ['276', '040', '203', '442'], cities: ['Germany', 'Austria', 'Czechia', 'Luxembourg'], stability: 4,
    hover: 'Its borders look… familiar. The government calls it a clerical error and has asked cartographers to stop pointing it out.',
    exports: 'Cars, chemicals, machine tools', role: 'Autos, chemicals and industrials.', commodities: [],
    leader: { title: 'Chancellor', name: 'Klaus Normalmann', note: 'Insists everything is completely normal.',
      look: { hair: 'sidePart', accessory: 'roundGlasses', mouth: 'smile', facialHair: 'none', eyes: 'wide' } } },
  { id: 'poland', name: 'Poland', shapes: ['616'], cities: ['Poland'], stability: 3, hover: 'Keeps glancing west.', exports: 'Coal, apples, pierogi',
    role: 'Coal and agriculture.', commodities: ['ZW'], leader: { title: 'President', name: 'Jan Nerwowski', note: 'Keeps a packed suitcase by the door.' } },
  { id: 'france', name: 'France', shapes: ['250'], cities: ['France'], stability: 3, hover: 'Pension-reform protests have been running since 1995.',
    exports: 'Luxury goods, aircraft, wine, strikes', role: 'Luxury (Louis Button, Hermez) and aerospace. Strikes hit French companies twice as often.', commodities: [],
    leader: { title: 'President', name: 'Jean-Luc Grève', note: 'Currently on strike.' } },
  { id: 'uk', name: 'United Kingdom', shapes: ['826'], cities: ['United Kingdom'], stability: 3, hover: 'Has held 14 referendums this decade. The 15th is on whether to stop holding referendums.',
    exports: 'Banking, oil, pop music, referendums', role: 'Banks (HBSC) and oil (Shall). Referendums move UK stocks.', commodities: ['BZ'],
    leader: { title: 'Prime Minister', name: 'Rupert Fothergill (acting)', note: 'Acting until the next referendum, which is next Tuesday.' } },
  { id: 'ireland', name: 'Ireland', shapes: ['372'], cities: ['Ireland'], stability: 4, hover: 'Every large tech company’s official headquarters is the same mailbox in Dublin.',
    exports: 'Software (on paper), stout', role: 'Shell companies are cheaper to register here.', commodities: [],
    leader: { title: 'Taoiseach', name: 'Declan Postbox', note: 'Personally signs for every tech company’s mail.' } },
  { id: 'netherlands', name: 'Netherlands', shapes: ['528'], cities: ['Netherlands'], stability: 5, hover: 'Bought tulips in 1637 and has regretted it since.',
    exports: 'Chip-making machines, flowers, cheese', role: 'ASMR Holding; the world’s busiest port.', commodities: [],
    leader: { title: 'Prime Minister', name: 'Joost van Tulp', note: 'Refuses to discuss 1637.' } },
  { id: 'switzerland', name: 'Switzerland', shapes: ['756'], cities: ['Switzerland'], stability: 5,
    hover: 'Neutral. Your money is safe here, and so is everyone else’s — especially the money you shouldn’t ask about.', exports: 'Pharmaceuticals, chocolate, watches, discretion',
    role: 'Roshe, Nowartis, Nestlay; a safe haven when tensions spike.', commodities: ['GC'],
    leader: { title: 'Federal President (rotates yearly)', name: 'Name withheld', note: 'Nobody knows who it is this year.', fixed: true, portrait: 'silhouette' } },
  { id: 'italy', name: 'Italy', shapes: ['380'], cities: ['Italy'], stability: 2, hover: 'Has had seven governments since the game started.', exports: 'Cars, fashion, olive oil',
    role: 'Small, frequent government collapses.', commodities: [], leader: { title: 'Prime Minister (changes often)', note: 'Portrait and name change every few weeks.' } },
  { id: 'iceland', name: 'Iceland', shapes: ['352'], cities: ['Iceland'], stability: 3, hover: 'Its banking sector is ten times the size of its economy. What could go wrong?',
    exports: 'Fish, aluminium, bank bonds', role: 'A bank crisis that gets likelier every month it doesn’t happen.', commodities: [],
    leader: { title: 'Prime Minister', name: 'Gunnar Leverageson', note: 'Former banker. Current banker.' } },
  { id: 'vatican', name: 'Vatican City', shapes: [], marker: [12.45, 41.9], cities: ['Vatican City'], stability: 5, hover: 'The world’s smallest sovereign wealth fund, with a 2,000-year investment horizon.',
    exports: 'Postage stamps, blessings', role: 'Flavour.', commodities: [], leader: { title: 'Pope', name: 'Innocent XIV', note: 'Long-term investor. Very long-term.', fixed: true } },
  { id: 'sealand', name: 'Principality of Sealand', shapes: [], marker: [1.48, 51.9], cities: ['Principality of Sealand'], stability: 4,
    hover: 'A sea fort claiming to be a country. Sells noble titles on its website.', exports: 'Noble titles, stamps', role: 'Buy a title from the Lifestyles Catalogue (a little prestige).',
    commodities: [], leader: { title: 'Prince', name: 'Barnaby I', note: 'Will sell you a title. Will sell you his.', fixed: true } },
  { id: 'russia', name: 'Russia', shapes: ['643'], cities: ['Russia'], stability: 2, dry: true, hover: 'Major exporter of gas, oil, wheat and nickel.',
    exports: 'Gas, oil, wheat, nickel', role: 'Sanctions, and energy and grain supply.', commodities: ['NG', 'CL', 'ZW'], leader: { title: 'President' } },
  { id: 'ukraine', name: 'Ukraine', shapes: ['804'], cities: ['Ukraine'], stability: 2, dry: true, hover: 'Major grain exporter.', exports: 'Wheat, corn, sunflower oil',
    role: 'Wheat and corn supply.', commodities: ['ZW', 'ZC'], leader: { title: 'President' } },
  { id: 'saudi', name: 'Saudi Arabia', shapes: ['682'], cities: ['Saudi Arabia'], stability: 3, dry: true, hover: 'Home of Arampco, and of OPEK meetings that move oil more than most wars.',
    exports: 'Oil', role: 'Oil.', commodities: ['CL'], leader: { title: 'King' } },
  { id: 'iran', name: 'Iran', shapes: ['364'], cities: ['Iran'], stability: 2, dry: true, hover: 'Borders the strait that a fifth of the world’s oil passes through.',
    exports: 'Oil, pistachios, carpets', role: 'Strait tensions move crude.', commodities: ['CL', 'BZ'], leader: { title: 'President' } },
  { id: 'nope', name: 'Nope', shapes: ['376', '275'], cities: [], stability: 0, nope: true, hover: 'We’re not doing this part.', exports: '', role: '', commodities: [],
    leader: { title: '[REDACTED]', name: '[REDACTED]', note: 'Also not doing this part.', fixed: true, portrait: 'blur' } },
  { id: 'egypt', name: 'Egypt', shapes: ['818'], cities: ['Egypt'], stability: 3, dry: true, hover: 'Owns the canal. Occasionally a very large ship gets stuck in it sideways.',
    exports: 'Gas, cotton, canal tolls', role: 'A blocked canal spikes shipping rates.', commodities: ['CT'], leader: { title: 'President' } },
  { id: 'nigeria', name: 'Nigeria', shapes: ['566'], cities: ['Nigeria'], stability: 2, dry: true, hover: 'Africa’s largest oil producer and an OPEK member.', exports: 'Oil, cocoa',
    role: 'Oil.', commodities: ['CL', 'CC'], leader: { title: 'President' } },
  { id: 'rhodesia', name: 'Rhodesia', shapes: ['716'], cities: ['Rhodesia'], stability: 2, hover: 'Exists. Nobody, including Rhodesia, is sure how.', exports: 'Tobacco, chrome, gold',
    role: 'The Rhodesia Tobacco Company; chrome and gold.', commodities: ['GC'], leader: { title: 'Prime Minister', name: 'Reginald Tobbs', note: 'Always pictured with a Rhodesia Tobacco Company cigar.', look: { accessory: 'cigar' } } },
  { id: 'southAfrica', name: 'South Africa', shapes: ['710'], cities: ['South Africa'], stability: 3, dry: true, hover: 'Most of the world’s platinum and a good share of its gold.',
    exports: 'Platinum, gold, coal', role: 'Platinum, gold and mining.', commodities: ['PL', 'GC'], leader: { title: 'President' } },
  { id: 'china', name: 'China', shapes: ['156'], cities: ['China', 'Hong Kong'], stability: 3, dry: true, hover: 'The world’s factory.', exports: 'Electronics, steel, everything else',
    role: 'Export controls and tariffs hit semiconductors, hardware and retail.', commodities: ['HG'], leader: { title: 'President' } },
  { id: 'taiwan', name: 'Taiwan', shapes: ['158'], cities: ['Taiwan'], stability: 3, dry: true, hover: 'Makes most of the world’s advanced chips, including Tai-One Semiconductor’s.',
    exports: 'Semiconductors, electronics', role: 'Tension here moves the whole semiconductor industry.', commodities: [], leader: { title: 'President' } },
  { id: 'japan', name: 'Japan', shapes: ['392'], cities: ['Japan'], stability: 4, hover: 'Its stock market peaked in 1989 and is still waiting for it to come back.',
    exports: 'Cars, electronics, deflation', role: 'Toyoto, Sonny; deflation.', commodities: [], leader: { title: 'Prime Minister', name: 'Taro Matsumoto', note: 'Has been about to fix the economy since 1990.' } },
  { id: 'northKorea', name: 'North Korea', shapes: ['408'], cities: ['North Korea'], stability: 2,
    hover: 'Its stock exchange lists one company. It is doing extremely well, according to the stock exchange.', exports: 'Press releases', role: 'Missile tests: a brief flight from risk.', commodities: [],
    leader: { title: 'Supreme Eternal Chairman', name: 'Name classified', note: 'Name classified. Hovering plays a short burst of applause.', fixed: true } },
  { id: 'southKorea', name: 'South Korea', shapes: ['410'], cities: ['South Korea'], stability: 4, dry: true, hover: 'Home of Samsong. Family feuds at conglomerates are a recurring event.',
    exports: 'Chips, ships, phones', role: 'Semiconductors and shipbuilding.', commodities: [], leader: { title: 'President' } },
  { id: 'india', name: 'India', shapes: ['356'], cities: ['India'], stability: 4, dry: true, hover: 'The fastest-growing large economy on the map.', exports: 'IT services, rice, textiles',
    role: 'Tater Consultancy, Reliants; IT services.', commodities: [], leader: { title: 'Prime Minister' } },
  { id: 'australia', name: 'Australia', shapes: ['036'], cities: ['Australia'], stability: 5, hover: 'Digs up iron ore, ships it to China, gets rich. Repeat.', exports: 'Iron ore, coal, wool',
    role: 'Iron ore, mining and the Commonwealth Bonk.', commodities: [], leader: { title: 'Prime Minister', name: 'Shane Digwell', note: 'Measures GDP in tonnes.' } },
  { id: 'brazil', name: 'Brazil', shapes: ['076'], cities: ['Brazil'], stability: 3, hover: 'Frost in Brazil is your coffee futures’ worst nightmare.', exports: 'Coffee, soybeans, sugar, iron ore',
    role: 'Coffee, soybeans, sugar and iron ore.', commodities: ['KC', 'ZS', 'SB'], leader: { title: 'President', name: 'João Geada', note: 'Checks the frost forecast before every cabinet meeting.' } },
  { id: 'argentina', name: 'Argentina', shapes: ['032'], cities: ['Argentina'], stability: 2, hover: 'Has defaulted on its debt nine times and is already planning the tenth.',
    exports: 'Soybeans, beef, IOUs', role: 'Defaults; soybeans and beef.', commodities: ['ZS', 'LE'], leader: { title: 'President', name: 'Martín Deudas', note: 'Already drafting the next default announcement.' } },
  { id: 'chile', name: 'Chile', shapes: ['152'], cities: ['Chile'], stability: 4, hover: 'Copper. Mostly copper.', exports: 'Copper', role: 'Copper.', commodities: ['HG'],
    leader: { title: 'President', name: 'Ricardo Cobre', note: 'Copper.' } },
  { id: 'antarctica', name: 'Antarctica', shapes: ['010'], cities: [], stability: 5, hover: 'No government. Penguin population stable. A competitor keeps trying to list it on the exchange.',
    exports: 'Ice, research papers', role: 'Flavour.', commodities: [], leader: { title: 'Emperor', name: 'Pengu I', note: 'A penguin. Elected unanimously by penguins.', fixed: true, portrait: 'penguin' } },
];

export const COUNTRY = Object.fromEntries(COUNTRIES.map((c) => [c.id, c])) as Record<string, CountrySpec>;

/** A present-day country (a city's) → the country it belongs to in the module's world, if it is one of the listed. */
export const COUNTRY_OF_CITY: Readonly<Record<string, string>> = Object.fromEntries(COUNTRIES.flatMap((c) => c.cities.map((x) => [x, c.id])));

/** Unlisted countries (spec §16C.1: their real name, a generic line, regional events only) by region. */
export const REGIONS: Readonly<Record<string, string>> = {
  Spain: 'Europe', Belgium: 'Europe', Turkey: 'Europe', 'United Arab Emirates': 'the Middle East', Singapore: 'Asia', Indonesia: 'Asia', 'New Zealand': 'Oceania', Kenya: 'Africa',
};

/** Generated leaders of the dry countries: plain names in the national style, never a real politician's (spec §16C.1). */
export const NAME_POOLS: Readonly<Record<string, readonly [readonly string[], readonly string[]]>> = {
  russia: [['Aleksei', 'Dmitri', 'Sergei', 'Mikhail', 'Nikolai', 'Pavel'], ['Volkov', 'Sokolov', 'Morozov', 'Lebedev', 'Kozlov', 'Novikov']],
  ukraine: [['Andriy', 'Oleksandr', 'Taras', 'Bohdan', 'Yuriy'], ['Kovalenko', 'Bondarenko', 'Tkachenko', 'Shevchuk', 'Melnyk']],
  saudi: [['Faisal', 'Khalid', 'Saad', 'Nasser', 'Turki'], ['Al-Harbi', 'Al-Qahtani', 'Al-Otaibi', 'Al-Ghamdi', 'Al-Shehri']],
  iran: [['Reza', 'Hossein', 'Mehdi', 'Majid', 'Hamid'], ['Rahimi', 'Karimi', 'Moradi', 'Jafari', 'Sadeghi']],
  egypt: [['Ahmed', 'Mahmoud', 'Omar', 'Tarek', 'Hany'], ['Farouk', 'Mansour', 'Salem', 'Nasr', 'Fahmy']],
  nigeria: [['Chukwuemeka', 'Babatunde', 'Olumide', 'Emeka', 'Tunde'], ['Okafor', 'Adeyemi', 'Eze', 'Okonkwo', 'Balogun']],
  southAfrica: [['Thabo', 'Sipho', 'Johan', 'Pieter', 'Mandla'], ['Dlamini', 'Nkosi', 'van der Merwe', 'Botha', 'Mokoena']],
  china: [['Wei', 'Jian', 'Hao', 'Lei', 'Ming'], ['Zhang', 'Liu', 'Chen', 'Yang', 'Zhao']],
  taiwan: [['Chih-ming', 'Wen-hsiung', 'Chun-hung', 'Kuo-hua'], ['Lin', 'Huang', 'Tsai', 'Cheng']],
  southKorea: [['Min-jun', 'Ji-ho', 'Seung-woo', 'Hyun-woo', 'Dong-hyun'], ['Kim', 'Choi', 'Jung', 'Kang', 'Yoon']],
  india: [['Rajesh', 'Anil', 'Suresh', 'Vikram', 'Arjun'], ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Mehta']],
  // Italy's governments come and go; so do their prime ministers.
  italy: [['Marco', 'Giuseppe', 'Luca', 'Paolo', 'Franco', 'Enrico'], ['Rossi', 'Bianchi', 'Ferrari', 'Esposito', 'Romano', 'Colombo']],
};

/**
 * Pairs whose tensions escalate (spec §16C.1) along the ladder: rhetoric → tariffs → sanctions → blockade → skirmishes,
 * then a ceasefire. `max` caps how far a pair goes: some never get past harsh words (or, for the Union, a sternly worded
 * letter). Dry countries have no pairs: their events are supply and sanctions only.
 */
export interface PairSpec {
  id: string;
  a: string;
  b: string;
  max: number;
  /** Weekly odds of flaring from calm. */
  flare: number;
}

export const PAIRS: readonly PairSpec[] = [
  { id: 'usga-mexico', a: 'usga', b: 'mexico', max: 5, flare: 0.03 },
  { id: 'germany-poland', a: 'germany', b: 'poland', max: 1, flare: 0.02 },
  { id: 'germany-france', a: 'germany', b: 'france', max: 1, flare: 0.02 },
  { id: 'usga-denmark', a: 'usga', b: 'denmark', max: 1, flare: 0.015 },
  // "Whose oil is it": the Union's internal dispute never gets past a sternly worded letter.
  { id: 'sweden-norway', a: 'swedenNorway', b: 'swedenNorway', max: 1, flare: 0.01 },
];

export const RUNGS = ['calm', 'rhetoric', 'tariffs', 'sanctions', 'blockade', 'skirmishes'] as const;
