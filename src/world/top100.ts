import type { LogoFont, LogoLayout, LogoMotif, LogoShape } from '../art/logo/options';

export interface CuratedCompany {
  name: string;
  ticker: string;
  /** Industry id (industries.ts). */
  industry: string;
  /** HQ city name (cities.ts); fixes the company's home country. */
  hq: string;
  /** Sub-industry name; drawn at random when omitted. */
  sub?: string;
  /** Years before the game starts; drawn at random when omitted. */
  founded?: number;
  /** Fixed logo parts; the rest are drawn from the company's fixed identity stream. */
  logo?: { shape?: LogoShape; motif?: LogoMotif; palette?: string; font?: LogoFont; layout?: LogoLayout };
}

const c = (name: string, ticker: string, industry: string, hq: string, sub?: string): CuratedCompany => ({
  name, ticker, industry, hq, sub,
});

/**
 * The 100 largest companies at the start (spec §10.6), in starting rank order. Curated genomes use version 15
 * with name part A indexing this list: append only.
 */
export const TOP100: readonly CuratedCompany[] = [
  c('Mvidea', 'MVDA', 'semiconductors', 'San Jose', 'Chip Design'),
  c('Majorsoft', 'MJSF', 'software', 'Seattle', 'Consumer Software'),
  c('Pear Computer', 'PEAR', 'hardware', 'San Jose', 'Personal Computers'),
  c('Alphabeta (Goggle)', 'GOGL', 'internet', 'San Francisco', 'Search'),
  c('Amazin.com', 'AMZI', 'internet', 'Seattle', 'E-commerce'),
  c('Broadcomb', 'BRCB', 'semiconductors', 'San Jose', 'Chip Design'),
  c('Beta Platforms (Facepage)', 'BETA', 'internet', 'San Francisco', 'Social'),
  c('Tai-One Semiconductor', 'TOSC', 'semiconductors', 'Hsinchu', 'Foundry'),
  c('Tezla Motors', 'TZLA', 'autos', 'Austin', 'Automakers'),
  c('Birkshire Hatchaway', 'BRKH', 'conglomerate', 'Omaha', 'Holding Company'),
  c('Arampco', 'ARMP', 'oilGas', 'Dhahran', 'Integrated'),
  c('Ellie Lilly', 'ELLY', 'pharma', 'Indianapolis', 'Big Pharma'),
  c('J.P. Borgan Chase', 'JPB', 'banks', 'New York', 'Money Center'),
  c('Walmark', 'WMK', 'retail', 'Little Rock', 'Discount Stores'),
  c('Orakle', 'ORKL', 'software', 'Austin', 'Databases'),
  c('Viza', 'VIZA', 'payments', 'San Francisco', 'Card Networks'),
  c('Samsong Electronics', 'SMSG', 'hardware', 'Seoul', 'Consumer Electronics'),
  c('Tensent', 'TNST', 'internet', 'Shenzhen', 'Online Services'),
  c('Mastercart', 'MCRT', 'payments', 'New York', 'Card Networks'),
  c('Exxoff Mobile', 'XOF', 'oilGas', 'Dallas', 'Integrated'),
  c('Netflics', 'NFLC', 'media', 'San Jose', 'Broadcasting'),
  c('Costso', 'CSTO', 'retail', 'Seattle', 'Discount Stores'),
  c('Palanteer', 'PLNT', 'software', 'Denver', 'Security'),
  c('Johnston & Johnston', 'JNJN', 'pharma', 'New York', 'Consumer Health'),
  c('Home Deport', 'HDPT', 'retail', 'Atlanta', 'Home Improvement'),
  c('Proctor & Gambol', 'PGBL', 'foodBeverage', 'Cincinnati', 'Household Products'),
  c('AbbVee', 'ABVE', 'pharma', 'Chicago', 'Specialty Pharma'),
  c('Bank of Americana', 'BOAM', 'banks', 'Charlotte', 'Money Center'),
  c('ASMR Holding', 'ASMR', 'semiconductors', 'Eindhoven', 'Equipment'),
  c('Alibabble', 'BABL', 'internet', 'Hangzhou', 'E-commerce'),
  c('SAPP', 'SAPP', 'software', 'Frankfurt', 'Enterprise Software'),
  c('Advanced Macro Devices', 'AMCD', 'semiconductors', 'San Jose', 'Chip Design'),
  c('Coca-Kola', 'KOLA', 'foodBeverage', 'Atlanta', 'Soft Drinks'),
  c('UnitedWealth Group', 'UWG', 'healthServices', 'Minneapolis', 'Managed Care'),
  c('Nestlay', 'NSLY', 'foodBeverage', 'Geneva', 'Packaged Foods'),
  c('Roshe Holding', 'RSHE', 'pharma', 'Basel', 'Big Pharma'),
  c('Nowartis', 'NWRT', 'pharma', 'Basel', 'Big Pharma'),
  c('Moët Hennessy Louis Button', 'MHLB', 'apparel', 'Paris', 'Luxury'),
  c('Hermez', 'HRMZ', 'apparel', 'Paris', 'Luxury'),
  c('Ciscko Systems', 'CSKO', 'hardware', 'San Jose', 'Networking'),
  c('Shevron', 'SHVR', 'oilGas', 'San Francisco', 'Integrated'),
  // The world's largest tobacco company. Nobody knows how; they're just really great cigarettes.
  {
    ...c('Rhodesia Tobacco Company', 'RTC', 'tobacco', 'Salisbury', 'Cigarettes'),
    founded: 75, // EST. 1923
    logo: { shape: 'shield', motif: 'leaf', palette: 'forestGold', font: 'serif', layout: 'monogram' },
  },
  c('Wells Cargo', 'WCGO', 'banks', 'San Francisco', 'Money Center'),
  c('Phillip Norris', 'PNRS', 'tobacco', 'New York', 'Cigarettes'),
  c('Toyoto Motor', 'TYTO', 'autos', 'Nagoya', 'Automakers'),
  c('IMB', 'IMB', 'software', 'New York', 'IT Services'),
  c('Salesfarce', 'SFRC', 'software', 'San Francisco', 'Enterprise Software'),
  c('Abbett Laboratories', 'ABBE', 'medicalDevices', 'Chicago', 'Diagnostics'),
  c('Murk & Co.', 'MURK', 'pharma', 'New York', 'Big Pharma'),
  c('Silverman Sacks', 'SLVS', 'banks', 'New York', 'Investment Banking'),
  c('Organ Stanley', 'ORGS', 'banks', 'New York', 'Investment Banking'),
  c('AstroZeneca', 'AZNC', 'pharma', 'London', 'Big Pharma'),
  c('Lindy', 'LNDY', 'chemicals', 'Dublin', 'Industrial Gases'),
  c("MacRonald's", 'MCRD', 'restaurants', 'Chicago', 'Fast Food'),
  c('Nova Nordic', 'NOVN', 'pharma', 'Copenhagen', 'Specialty Pharma'),
  c('Shall PLC', 'SHAL', 'oilGas', 'London', 'Integrated'),
  c('Tee-Mobile', 'TMOB', 'telecom', 'Seattle', 'Wireless'),
  c('General Elektrik Aero', 'GEA', 'aerospace', 'Cincinnati', 'Jet Engines'),
  c('Reliants Industries', 'RLNT', 'conglomerate', 'Mumbai', 'Diversified'),
  c('American Excess', 'AXS', 'payments', 'New York', 'Card Networks'),
  c('PopsiCo', 'POPS', 'foodBeverage', 'New York', 'Soft Drinks'),
  c('Intuwit', 'INWT', 'software', 'San Jose', 'Consumer Software'),
  c('ServiceLater', 'SVLT', 'software', 'San Jose', 'Enterprise Software'),
  c('Thermos Fisher', 'THRM', 'medicalDevices', 'Boston', 'Diagnostics'),
  c('Oober', 'OOBR', 'internet', 'San Francisco', 'Online Services'),
  c('Walt Dizzney', 'DZNY', 'media', 'Los Angeles', 'Film Studios'),
  c('Caterpillow', 'CATW', 'construction', 'Dallas', 'Heavy Machinery'),
  c('Quallcomb', 'QLCB', 'semiconductors', 'San Diego', 'Chip Design'),
  c('Adobo Systems', 'ADBO', 'software', 'San Jose', 'Consumer Software'),
  c('Bookie Holdings', 'BKIE', 'hotels', 'New York', 'Travel Agencies'),
  c('AT&Z', 'ATZ', 'telecom', 'Dallas', 'Long Distance'),
  c('Verizun', 'VRZN', 'telecom', 'New York', 'Wireless'),
  c('Texan Instruments', 'TXIN', 'semiconductors', 'Dallas', 'Analog'),
  c('RXT Corp', 'RXT', 'aerospace', 'Washington', 'Defence Contractors'),
  c('HBSC Holdings', 'HBSC', 'banks', 'London', 'Money Center'),
  c('Loyal Bank of Canada', 'LBC', 'banks', 'Toronto', 'Money Center'),
  c('Seamans AG', 'SMNS', 'conglomerate', 'Munich', 'Industrial'),
  c('Commonwealth Bonk', 'CBNK', 'banks', 'Sydney', 'Regional'),
  c('Intell Corp', 'INTL', 'semiconductors', 'San Jose', 'Chip Design'),
  c('Mikron Technology', 'MKRN', 'semiconductors', 'Boise', 'Memory'),
  c('Sonny Group', 'SNNY', 'media', 'Tokyo', 'Music'),
  c('Tater Consultancy Services', 'TATR', 'software', 'Mumbai', 'IT Services'),
  c('ICCB', 'ICCB', 'banks', 'Beijing', 'Money Center'),
  c('Kweichow Mootai', 'MOO', 'foodBeverage', 'Shanghai', 'Brewers & Distillers'),
  c('Xiaomee', 'XMEE', 'hardware', 'Beijing', 'Consumer Electronics'),
  c('Blackstein', 'BSTN', 'assetManagement', 'New York', 'Private Equity'),
  c('Mike Inc.', 'MIKE', 'apparel', 'Portland', 'Footwear'),
  c('Starbux', 'STBX', 'restaurants', 'Seattle', 'Coffee Houses'),
  c('Boing', 'BOIN', 'aerospace', 'Seattle', 'Aircraft'),
  c('Lockhead Martian', 'LKHM', 'aerospace', 'Washington', 'Defence Contractors'),
  c('Shoppify', 'SHPP', 'internet', 'Ottawa', 'E-commerce'),
  c('Leg Holdings', 'LEG', 'semiconductors', 'London', 'Chip Design'),
  c('Applied Materiels', 'APMT', 'semiconductors', 'San Jose', 'Equipment'),
  c('Lamb Research', 'LAMB', 'semiconductors', 'San Jose', 'Equipment'),
  c('Moneywell', 'MNYW', 'conglomerate', 'Charlotte', 'Industrial'),
  c('Unileaver', 'UNLV', 'foodBeverage', 'London', 'Household Products'),
  c('Mitsubushi UFO', 'MUFO', 'banks', 'Tokyo', 'Money Center'),
  c('Pfeizer', 'PFZR', 'pharma', 'New York', 'Big Pharma'),
  c('Deutsche Telecomb', 'DTCB', 'telecom', 'Berlin', 'Wireless'),
  c('Z Corp', 'ZCRP', 'internet', 'San Francisco', 'Social'),
];
