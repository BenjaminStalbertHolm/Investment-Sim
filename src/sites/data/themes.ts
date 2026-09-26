// Website themes per industry (spec §10.4 "website theme"): the tiled backgrounds its sites draw from (tinted with the
// company's logo palette) and body fonts (indices into content.ts FONTS: serif, sans, Verdana, comic). Keyed by id.

export const TILES = ['plain', 'paper', 'marble', 'wood', 'grid', 'circuit', 'stars', 'dots', 'stripes', 'bricks', 'waves', 'leaves'] as const;
export type Tile = (typeof TILES)[number];

export interface Theme {
  tiles: readonly Tile[];
  fonts: readonly number[];
}

const t = (tiles: string, fonts: number[] = [0, 1]): Theme => ({ tiles: tiles.split(' ') as Tile[], fonts });

const TECH = t('circuit grid stars dots plain', [1, 2]);
const FINANCE = t('marble paper plain stripes', [0, 1]);
const HEALTH = t('plain dots grid paper', [1, 2]);
const ENERGY = t('stripes grid plain waves', [1, 0]);
const EARTH = t('wood leaves paper bricks', [0, 1]);
const HEAVY = t('bricks grid stripes plain', [1, 0]);
const CONSUMER = t('dots stars stripes paper', [2, 0, 3]);

export const THEMES: Record<string, Theme> = {
  software: TECH, semiconductors: TECH, hardware: TECH, internet: t('stars dots circuit waves', [2, 3, 1]), telecom: TECH,
  banks: FINANCE, insurance: FINANCE, assetManagement: FINANCE, payments: FINANCE,
  pharma: HEALTH, biotech: t('dots grid stars plain', [1, 2]), medicalDevices: HEALTH, healthServices: HEALTH,
  oilGas: ENERGY, refining: ENERGY, utilities: ENERGY, renewables: t('leaves waves plain dots', [2, 1]),
  mining: t('bricks stripes plain wood', [0, 1]), preciousMetals: t('marble paper stripes', [0]), chemicals: HEAVY, steel: HEAVY,
  logging: t('wood leaves paper', [0, 1]), paper: t('paper wood plain', [0, 1]), agriculture: EARTH,
  foodBeverage: CONSUMER, tobacco: t('wood paper marble', [0]), retail: CONSUMER, apparel: t('marble stripes dots paper', [0, 2]),
  restaurants: t('stripes dots bricks', [3, 2, 0]), autos: t('stripes grid plain', [1, 2]), airlines: t('waves stars plain', [1, 2]),
  aerospace: t('stars grid plain', [1]), shipping: t('waves stripes grid', [1, 0]), railroads: t('bricks wood stripes', [0, 1]),
  construction: HEAVY, realEstate: t('marble bricks paper', [0, 1]), media: t('stars stripes dots', [0, 2]),
  videoGames: t('stars dots circuit', [3, 2]), hotels: t('marble waves stars', [0, 2]), conglomerate: FINANCE,
};
