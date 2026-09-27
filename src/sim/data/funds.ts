// Index funds (spec §11.5): the MAJOR 500 tracker and one fund per industry. Data only: sim/funds.ts runs them.
import { INDUSTRIES } from '../../world/industries';

/** Tickers of the sector funds, mutual-fund style (five letters ending in X, so they never clash with a company's). */
const SECTOR_TICKERS: Readonly<Record<string, string>> = {
  software: 'SOFTX', semiconductors: 'CHIPX', hardware: 'HARDX', internet: 'NETSX', telecom: 'TELCX', banks: 'BANKX',
  insurance: 'INSRX', assetManagement: 'FUNDX', payments: 'PAYSX', pharma: 'PHRMX', biotech: 'BIOTX', medicalDevices: 'MEDDX',
  healthServices: 'HLTHX', oilGas: 'OILGX', refining: 'REFNX', utilities: 'UTILX', renewables: 'WINDX', mining: 'MINEX',
  preciousMetals: 'GOLDX', chemicals: 'CHEMX', steel: 'STLSX', logging: 'TIMBX', paper: 'PAPRX', agriculture: 'FARMX',
  foodBeverage: 'FOODX', tobacco: 'SMOKX', retail: 'SHOPX', apparel: 'WEARX', restaurants: 'DINEX', autos: 'AUTOX',
  airlines: 'JETSX', aerospace: 'AEROX', shipping: 'SHIPX', railroads: 'RAILX', construction: 'BLDGX', realEstate: 'REITX',
  media: 'MDIAX', videoGames: 'GAMEX', hotels: 'HOTLX', conglomerate: 'CONGX',
};

export interface FundSpec {
  ticker: string;
  name: string;
  /** Industry index of a sector fund; -1 for the MAJOR 500 fund. */
  industry: number;
  /** Net asset value a unit at launch. */
  launch: number;
}

/** Fund 0 tracks the MAJOR 500; fund 1 + i holds the largest companies of industry i. */
export const FUNDS: readonly FundSpec[] = [
  { ticker: 'MJR', name: 'MAJOR 500 Index Fund', industry: -1, launch: 100 },
  ...INDUSTRIES.map((industry, i): FundSpec => ({ ticker: SECTOR_TICKERS[industry.id], name: `${industry.name} Sector Fund`, industry: i, launch: 25 })),
];

/** A sector fund holds its industry's largest companies, this many of them. */
export const SECTOR_SIZE = 50;
/** Half the bid-ask spread on a fund unit, before the difficulty's spread multiplier. */
export const FUND_SPREAD = 0.0003;
/** Who runs them, as the order ticket and the prospectus say. */
export const FUND_SPONSOR = 'First Continental Index Funds';
