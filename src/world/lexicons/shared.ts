// Name lexicons shared by all industries (spec §10.4). Genomes store indices into the word lists: append only.

/**
 * Company-name patterns, selected by the genome's 4-bit name template. The first two word slots take the
 * genome's name parts A and B, `{suffix}` takes the suffix gene and `{initials}` spells A and B as letters.
 * A slot written straight after another joins it in lower case: {prefix}{root} → "Ridge" + "Pine" = "Ridgepine".
 */
export const NAME_TEMPLATES = [
  '{prefix}{root} {suffix}', // 0  Ridgepine Timber Co.
  '{surname} & {surname}', // 1  Hallvard & Birch
  '{stem}{coin}', // 2  Datatronix
  '{adj} {root} {suffix}', // 3  Northern Pulp Holdings
  '{initials} {suffix}', // 4  KLM Lumber
  '{place} {suffix}', // 5  Pacific Lumber
  '{surname} {suffix}', // 6  Hallvard Timber Co.
  '{adj} {suffix}', // 7  Consolidated Timber
  '{stem}{coin} {suffix}', // 8  Datatronix Systems
  '{surname} & {surname} {suffix}', // 9  Hallvard & Birch Lumber
  '{adj} {place} {suffix}', // 10 Northern Prairie Railway
  '{prefix}{root}', // 11 Ridgepine
  '{root}{end} {suffix}', // 12 Ironridge Mining
  '{place} & {place} {suffix}', // 13 Summit & Valley Railroad
] as const;

/** Letters for {initials}, common initials twice: "KLM Lumber", seldom "ZQX". Exactly 32. */
export const INITIALS = 'ABCDEFGHIJKLMNOPRSTUVWABCGMPSTNR';

/** First half of a compound: {prefix}{root}. */
export const PREFIXES = [
  'North', 'South', 'East', 'West', 'Ridge', 'Stone', 'Iron', 'Silver', 'Gold', 'Red', 'Blue', 'Green', 'White',
  'Black', 'Bright', 'Clear', 'Fair', 'Star', 'Sun', 'Moon', 'Oak', 'Pine', 'Elm', 'Ash', 'Glen', 'Lake', 'Bay',
  'Rock', 'Hill', 'High', 'Deep', 'Long', 'Crown', 'King', 'Mid', 'Cold', 'Wolf', 'Hawk', 'Fox', 'Bear', 'Cedar',
  'Maple', 'River', 'Summit', 'Harbor', 'Frost', 'Storm', 'Thunder', 'Copper', 'Granite',
];

/** Second half of a compound: {root}{end}. Lower case. */
export const ENDS = [
  'ridge', 'crest', 'hill', 'field', 'stone', 'brook', 'dale', 'wood', 'ford', 'gate', 'view', 'point', 'vale',
  'creek', 'haven', 'land', 'wick', 'mont', 'port', 'bridge', 'water', 'side', 'mark', 'well', 'moor', 'burn',
  'wold', 'holm', 'star', 'line',
];

/** Stand-alone place words: {place}. */
export const PLACES = [
  'Pacific', 'Atlantic', 'Summit', 'Keystone', 'Frontier', 'Prairie', 'Highland', 'Liberty', 'Empire', 'Harbor',
  'Sierra', 'Canyon', 'Granite', 'Heritage', 'Evergreen', 'Cascade', 'Pinnacle', 'Meridian', 'Horizon', 'Compass',
  'Beacon', 'Lakeshore', 'Riverside', 'Bayside', 'Tidewater', 'Piedmont', 'Ozark', 'Allegheny', 'Chesapeake',
  'Shenandoah', 'Yukon', 'Klondike', 'Cumberland', 'Sonoran', 'Mohawk', 'Superior', 'Ontario', 'Hudson', 'Columbia',
  'Potomac', 'Missouri', 'Dakota', 'Tahoe', 'Aurora', 'Zenith', 'Apex', 'Vanguard', 'Pioneer', 'Sentinel', 'Crescent',
  'Mesa', 'Bluewater', 'Northgate', 'Westbrook', 'Eastwind', 'Southport', 'Kingsbridge', 'Oakmont', 'Stonebridge',
  'Silverlake',
];

/** {adj}. "General" and "American" are left out: they produce too many real company names. */
export const ADJECTIVES = [
  'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Consolidated', 'United', 'Allied', 'International',
  'National', 'Continental', 'Standard', 'Universal', 'Global', 'Premier', 'Imperial', 'Royal', 'Federal',
  'Amalgamated', 'Associated', 'Integrated', 'Advanced', 'Modern', 'Superior', 'Reliable', 'Midwest', 'Coastal',
  'Metropolitan', 'Transcontinental', 'Intercontinental', 'Commonwealth', 'Colonial', 'Heritage', 'Pioneer',
  'Frontier', 'Liberty', 'Sovereign', 'Mutual', 'Great', 'Grand', 'Golden', 'Diamond', 'Crown', 'Keystone',
  'Atlas', 'Titan', 'Paramount', 'Supreme', 'Dominion', 'Capital',
];

/** Endings for coined names: {stem}{coin}. Lower case. */
export const COINS = [
  'tronix', 'tech', 'tek', 'soft', 'ware', 'logic', 'sys', 'net', 'com', 'dyne', 'tron', 'plex', 'matic', 'core',
  'link', 'star', 'vision', 'works', 'lab', 'ix', 'ex', 'on', 'ium', 'ica',
];

/** Suffixes that say nothing about the industry. */
export const GENERIC_SUFFIXES = new Set([
  'Corp.', 'Inc.', 'Co.', 'Ltd', 'Group', 'Holdings', 'Company', 'Corporation', 'International', 'Associates',
  'Enterprises', 'Industries', 'Consolidated', 'Diversified', '& Co.', '& Sons', 'Brothers',
]);

/** Real company names that the lexicons could otherwise produce by accident. Lower case. */
export const RESERVED_NAMES = [
  'american airlines', 'united airlines', 'continental airlines', 'southwest airlines', 'delta airlines',
  'pacific airlines', 'united air lines', 'national airlines', 'eastern airlines', 'standard oil', 'union pacific',
  'union pacific railroad', 'northern pacific railway', 'southern pacific railroad', 'pacific gas & electric',
  'southern company', 'national grid', 'northern trust', 'state street', 'united technologies', 'consolidated edison',
  'pacific lumber', 'international paper', 'united states steel', 'national steel',
  'allied signal', 'continental can', 'great western', 'pacific telephone', 'national semiconductor',
  'advanced micro devices', 'texas instruments', 'united health care', 'universal pictures', 'paramount pictures',
  'continental resources', 'superior energy', 'imperial oil', 'royal bank', 'national bank', 'federal express',
  'united parcel service', 'global crossing', 'intercontinental exchange',
];

/** Letter runs that no ticker or {initials} may contain. */
export const BLOCKED_LETTERS = [
  'ASS', 'CUM', 'DIK', 'FAG', 'FUC', 'FUK', 'KKK', 'NIG', 'SEX', 'TIT', 'WTF', 'ANAL', 'COCK', 'CUNT', 'DICK', 'NAZI',
  'PISS', 'PORN', 'RAPE', 'SHIT', 'SLUT',
];
