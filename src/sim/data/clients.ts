// Who the firm's clients are and what they ask for (spec §15.1). Data only: sim/clients.ts draws from it.

export type ClientKind = 'founder' | 'pension' | 'endowment' | 'foundation' | 'family' | 'insurer' | 'church' | 'union' | 'sovereign';

export type ConstraintKind = 'exclude' | 'maxDrawdown' | 'maxPosition' | 'minCap' | 'beatIndex';

const p = (s: string) => s.split('|');

/** Invented towns for pension funds and insurers. */
export const TOWNS = p(
  'Lumberton|Millbrook|Cedar Falls|Port Ashby|New Salem|Oakridge|Harlow Springs|Bexley|Dunmore|Greenhaven|Kettering Bay|' +
    'Marston|North Wexford|Pellston|Quarry Hill|Redfield|Stillwater Junction|Thornton Mills|Upton Vale|Westbury Falls|' +
    'Ashcombe|Brambleton|Coldwater|Elkhorn|Fairmead|Gilford Heights|Holloway|Ironbridge|Juniper Flats|Lakemont',
);

export const CLIENT_NAMES: Readonly<Record<Exclude<ClientKind, 'founder'>, readonly string[]>> = {
  pension: p(
    '{town} Mills Pension Fund|{town} Teachers’ Retirement System|{town} Police & Fire Pension Plan|' +
      '{town} Municipal Employees’ Pension|{company} Employees’ Pension Trust|{town} County Retirement Board',
  ),
  endowment: p(
    '{town} College Endowment|St. {saint} University Endowment|{town} Institute of Technology Endowment|' +
      '{town} Community College Foundation|The {surname} School Endowment',
  ),
  foundation: p('The {surname} Foundation|The {surname}–{surname2} Charitable Trust|The {surname} Institute for Public Good'),
  family: p('The {surname} Family Office|{surname} Family Trust|The {surname} Heirs’ Trust'),
  insurer: p('{town} Mutual Insurance|{town} Fire & Casualty|{surname} & {surname2} Life Assurance'),
  church: p('Sisters of Perpetual {virtue}|First Church of {town} Retirement Fund|The Diocese of {town}|Brotherhood of St. {saint}'),
  union: p('Local {number} Pipefitters’ Welfare Fund|Local {number} Teamsters’ Pension|United {trade} Workers Local {number}'),
  sovereign: p('Principality of Sealand Investment Authority|Grand Duchy of Luxenstein Treasury|Sultanate of Qasirah Future Fund|Kingdom of Upper Vellmark Reserve'),
};

export const SAINTS = p('Barnabas|Agatha|Ignatius|Cuthbert|Winifred|Ambrose|Hilda|Crispin|Bartholomew|Walburga');
export const VIRTUES = p('Yield|Prudence|Patience|Thrift|Liquidity|Compound Interest|Diversification');
export const TRADES = p('Steel|Auto|Garment|Dockside|Bakery|Mine|Railway|Paper');

export const CONTACT_TITLES: Readonly<Record<ClientKind, readonly string[]>> = {
  founder: p('Founding Partner'),
  pension: p('Chief Investment Officer|Pension Fund Administrator|Chair, Board of Trustees'),
  endowment: p('Bursar|Endowment Manager|Treasurer'),
  foundation: p('Executive Director|Treasurer'),
  family: p('Head of the Family Office|Family Patriarch|Family Matriarch'),
  insurer: p('Chief Investment Officer|Head of Investments'),
  church: p('Mother Superior|Treasurer|Bishop’s Finance Secretary'),
  union: p('Union Treasurer|Fund Trustee'),
  sovereign: p('Minister of Finance|Director-General'),
};

/** How often each kind of client comes asking, and which constraints it tends to set. */
export const CLIENT_KINDS: readonly { kind: Exclude<ClientKind, 'founder'>; weight: number; constraints: Partial<Record<ConstraintKind, number>> }[] = [
  { kind: 'pension', weight: 4, constraints: { maxDrawdown: 3, beatIndex: 3, exclude: 1, maxPosition: 1 } },
  { kind: 'endowment', weight: 2, constraints: { exclude: 3, beatIndex: 2, maxDrawdown: 1 } },
  { kind: 'foundation', weight: 2, constraints: { exclude: 3, maxPosition: 1, maxDrawdown: 1 } },
  { kind: 'family', weight: 3, constraints: { maxPosition: 2, minCap: 1, maxDrawdown: 1, beatIndex: 1 } },
  { kind: 'insurer', weight: 2, constraints: { minCap: 3, maxPosition: 2, maxDrawdown: 2 } },
  { kind: 'church', weight: 1, constraints: { exclude: 4, maxDrawdown: 1 } },
  { kind: 'union', weight: 1.5, constraints: { exclude: 1, maxDrawdown: 2, beatIndex: 1 } },
  { kind: 'sovereign', weight: 0.5, constraints: { beatIndex: 3, minCap: 2 } },
];

/** Industries a client may rule out, by the name they give the rule. */
export const EXCLUSIONS: readonly { label: string; industries: readonly string[] }[] = [
  { label: 'tobacco', industries: ['tobacco'] },
  { label: 'weapons makers', industries: ['aerospace'] },
  { label: 'fossil fuels', industries: ['oilGas', 'refining'] },
  { label: 'casinos and hotels', industries: ['hotels'] },
  { label: 'violent video games', industries: ['videoGames'] },
  { label: 'usury (banks and card companies)', industries: ['banks', 'payments'] },
  { label: 'mining', industries: ['mining', 'preciousMetals'] },
];

/** Constraint limits a client picks from. */
export const LIMITS = {
  maxDrawdown: [0.1, 0.15, 0.2, 0.25],
  maxPosition: [0.1, 0.15, 0.2, 0.25],
  minCap: [300e6, 2e9],
  beatIndex: [2, 3, 4],
} as const;
