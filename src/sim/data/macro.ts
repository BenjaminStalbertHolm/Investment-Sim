// How each industry responds to the economy (spec §10.4 macro sensitivities, §11.4). Keyed by industry id.

/**
 * How far an industry's fundamental value moves with the policy rate, as a duration in years: value changes by
 * −duration × Δrate (spec §11.4: growth and tech most sensitive, banks benefit from moderate rises).
 */
export const RATE_DURATION: Readonly<Record<string, number>> = {
  software: 8, semiconductors: 7, hardware: 6, internet: 10, telecom: 5, banks: -3, insurance: -2, assetManagement: 3,
  payments: 6, pharma: 5, biotech: 9, medicalDevices: 6, healthServices: 4, oilGas: 2, refining: 1, utilities: 7,
  renewables: 8, mining: 3, preciousMetals: 2, chemicals: 3, steel: 2, logging: 3, paper: 3, agriculture: 3,
  foodBeverage: 4, tobacco: 4, retail: 5, apparel: 5, restaurants: 5, autos: 4, airlines: 4, aerospace: 4, shipping: 3,
  railroads: 4, construction: 5, realEstate: 8, media: 6, videoGames: 8, hotels: 5, conglomerate: 4,
};

/** Sensitivity to growth surprises (jobs, GDP, consumer confidence): cyclicals above 1, defensives below. */
export const CYCLICALITY: Readonly<Record<string, number>> = {
  software: 1.1, semiconductors: 1.5, hardware: 1.3, internet: 1.2, telecom: 0.7, banks: 1.3, insurance: 0.8,
  assetManagement: 1.3, payments: 1.1, pharma: 0.5, biotech: 0.7, medicalDevices: 0.6, healthServices: 0.5, oilGas: 1.2,
  refining: 1.2, utilities: 0.4, renewables: 1, mining: 1.5, preciousMetals: 0.3, chemicals: 1.3, steel: 1.6,
  logging: 1.4, paper: 1.2, agriculture: 0.8, foodBeverage: 0.5, tobacco: 0.4, retail: 1.1, apparel: 1.2,
  restaurants: 1, autos: 1.6, airlines: 1.7, aerospace: 1.2, shipping: 1.5, railroads: 1.2, construction: 1.5,
  realEstate: 1.2, media: 1, videoGames: 1, hotels: 1.4, conglomerate: 1.1,
};

/** The economy on 5 January 1998. */
export const MACRO_START = { rate: 0.055, inflation: 0.016, gdp: 0.038, unemployment: 0.047, confidence: 128 };
