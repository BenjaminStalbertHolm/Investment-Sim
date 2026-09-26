// Names for procedurally generated competitor firms (spec §16). Append only: worlds regenerate from their seed.

const w = (s: string) => s.split(' ');

/** {surname} slots draw from people-names.ts. */
export const FIRM_TEMPLATES = [
  '{place} {suffix}',
  '{place} {noun} {suffix}',
  '{surname} {suffix}',
  '{surname} & {surname} {suffix}',
] as const;

export const FIRM_PLACES = w(
  'Harbor Granite Kestrel Heron Summit Cedar Ironwood Lighthouse Beacon Meridian Keystone Bluewater Oakmont ' +
    'Stonebridge Northgate Westbrook Eastwind Silverlake Falconer Osprey Juniper Aspen Willow Marble Obsidian Sapphire ' +
    'Lodestar Polaris Tidewater Windward Larkspur Foxhollow Ravenscroft Thornbury Ashgrove Pinecrest Blackwater Whitehall',
);

export const FIRM_NOUNS = w('Point Ridge Bay Hill Rock Gate Bridge Tower Street Square Lane Park Creek Peak Crossing');

export const FIRM_SUFFIXES = [
  'Capital', 'Partners', 'Advisors', 'Asset Management', 'Investments', 'Capital Management', 'Fund Management',
  'Investment Partners', 'Global Investors', '& Co.', 'Associates', 'Capital Partners',
];
