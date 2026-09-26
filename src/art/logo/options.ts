// Logo building blocks (spec §7). Genomes and logo codes store indices into these lists: append only.

export const LOGO_SHAPES = [
  'none', 'circle', 'square', 'roundedSquare', 'shield', 'diamond', 'hexagon', 'triangle', 'banner', 'oval',
] as const;

export const LOGO_MOTIFS = [
  'bull', 'bear', 'eagle', 'lion', 'owl', 'tower', 'pillar', 'globe', 'arrowUp', 'rock', 'mountain', 'ship', 'anchor',
  'tree', 'key', 'crown', 'coin', 'star', 'lightning', 'wave', 'sun', 'bridge', 'gear', 'leaf', 'flame', 'drop', 'atom',
  'chip', 'wheat', 'pickaxe', 'teacup', 'saucepan',
] as const;

export const LOGO_FONTS = ['serif', 'sans', 'slab', 'script', 'pixel', 'condensed', 'extended', 'blackletter'] as const;

export const LOGO_LAYOUTS = ['iconLeft', 'iconAbove', 'textOnly', 'monogram', 'textInside'] as const;

export type LogoShape = (typeof LOGO_SHAPES)[number];
export type LogoMotif = (typeof LOGO_MOTIFS)[number];
export type LogoFont = (typeof LOGO_FONTS)[number];
export type LogoLayout = (typeof LOGO_LAYOUTS)[number];

export type PaletteFamily = 'blue' | 'green' | 'red' | 'earth' | 'gold' | 'teal' | 'purple' | 'mono';

export interface Palette {
  id: string;
  family: PaletteFamily;
  /** Main colour, accent, and optionally a background. */
  colors: readonly [string, string, string?];
}

const palette = (id: string, family: PaletteFamily, ...colors: [string, string, string?]): Palette => ({ id, family, colors });

/** 64 period palettes, eight per family. */
export const PALETTES: readonly Palette[] = [
  palette('navyGold', 'blue', '#1b2a4a', '#c9a227'),
  palette('navyWhite', 'blue', '#14285a', '#ffffff'),
  palette('royalSilver', 'blue', '#2346a0', '#c0c6cc'),
  palette('skyNavy', 'blue', '#6fa8dc', '#16275a'),
  palette('cobaltOrange', 'blue', '#1f4fbf', '#f28c28'),
  palette('steelGrey', 'blue', '#46698c', '#8e959c'),
  palette('midnightCyan', 'blue', '#0c1633', '#35c7e0'),
  palette('denimCream', 'blue', '#3a5a86', '#f3ead3'),
  palette('forestGold', 'green', '#1f4d2b', '#d4af37'),
  palette('hunterCream', 'green', '#2c5234', '#efe6cc'),
  palette('emeraldWhite', 'green', '#0f8a5f', '#ffffff'),
  palette('oliveTan', 'green', '#5b6b2f', '#d2b48c'),
  palette('limeBlack', 'green', '#8cc63f', '#111111'),
  palette('pineBrown', 'green', '#2e5e3e', '#6b4226'),
  palette('sageCharcoal', 'green', '#9caf88', '#36393d'),
  palette('kellyYellow', 'green', '#2e9e44', '#f5d000'),
  palette('maroonCream', 'red', '#6d1a2a', '#f3e9d2'),
  palette('crimsonBlack', 'red', '#c0162b', '#121212'),
  palette('brickGrey', 'red', '#9c3b2a', '#8f9396'),
  palette('burgundyGold', 'red', '#5e1224', '#cfa93b'),
  palette('scarletWhite', 'red', '#e0231d', '#ffffff'),
  palette('cherryNavy', 'red', '#b3122e', '#1a2657'),
  palette('rustCream', 'red', '#b3541e', '#f6ecd6'),
  palette('oxbloodSilver', 'red', '#4a0c16', '#bcc2c7'),
  palette('brownTan', 'earth', '#5c3b1e', '#d9b98a'),
  palette('chocolateCream', 'earth', '#3f2415', '#f2e6cf'),
  palette('siennaOlive', 'earth', '#a0522d', '#6b7a2f'),
  palette('walnutGold', 'earth', '#5a3d23', '#d1a33b'),
  palette('khakiBrown', 'earth', '#c3b091', '#4b3621'),
  palette('terracottaSand', 'earth', '#c2603a', '#e8d5b0'),
  palette('umberGreen', 'earth', '#635147', '#3f6b3a'),
  palette('leatherCream', 'earth', '#8b5a2b', '#f5ecd9'),
  palette('goldBlack', 'gold', '#d4af37', '#101010'),
  palette('mustardNavy', 'gold', '#d8a31a', '#1c2a4f'),
  palette('amberBrown', 'gold', '#f0a500', '#4a2c14'),
  palette('brassMaroon', 'gold', '#b5a642', '#5e1a24'),
  palette('yellowCharcoal', 'gold', '#f7d117', '#333538'),
  palette('ochreTeal', 'gold', '#cc8e1f', '#1f6f6f'),
  palette('honeyWhite', 'gold', '#e8b04b', '#ffffff'),
  palette('champagneBurgundy', 'gold', '#e8d7a9', '#6b1c2c'),
  palette('tealBlack', 'teal', '#138086', '#0e0e0e'),
  palette('tealWhite', 'teal', '#0f7c80', '#ffffff'),
  palette('turquoiseNavy', 'teal', '#30c5c0', '#15245a'),
  palette('aquaPurple', 'teal', '#34d1c9', '#6a2c91'),
  palette('seafoamGrey', 'teal', '#8fd9c3', '#5b6166'),
  palette('cyanMagenta', 'teal', '#1fc7e8', '#d6247f'),
  palette('petrolCream', 'teal', '#1d5b68', '#f1e8d0'),
  palette('jadeGold', 'teal', '#00806b', '#d9ad3c'),
  palette('purpleGold', 'purple', '#4b2a7b', '#d4af37'),
  palette('violetWhite', 'purple', '#7a3cc2', '#ffffff'),
  palette('plumSilver', 'purple', '#5d2a51', '#c3c7cc'),
  palette('lavenderNavy', 'purple', '#b39ddb', '#1a2352'),
  palette('magentaBlack', 'purple', '#c2187a', '#111111'),
  palette('grapeLime', 'purple', '#5b2c83', '#9bd23c'),
  palette('eggplantCream', 'purple', '#3d1f3f', '#f3e9d6'),
  palette('indigoOrange', 'purple', '#3a2a8c', '#f08a24'),
  palette('blackWhite', 'mono', '#000000', '#ffffff'),
  palette('whiteBlack', 'mono', '#ffffff', '#000000'),
  palette('charcoalSilver', 'mono', '#333333', '#c0c0c0'),
  palette('greyRed', 'mono', '#6d6e70', '#d0021b'),
  palette('slateCyan', 'mono', '#4a5560', '#26c6da'),
  palette('graphiteYellow', 'mono', '#2b2d2f', '#f2c500'),
  palette('silverNavy', 'mono', '#bfc5cb', '#1b2a4a'),
  palette('inkCream', 'mono', '#15171a', '#efe7d4'),
];
