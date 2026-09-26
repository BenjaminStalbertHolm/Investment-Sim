// CEO portrait parts (spec §8). Genomes and CEO codes store indices into these lists: append only.

/** 16 steps, very light to very dark. */
export const SKIN_TONES = [
  '#fbe3d3', '#f6d5bf', '#f1c7a8', '#e8b692', '#e2a782', '#d69a70', '#c98b62', '#bb7c55',
  '#a86b48', '#96603f', '#835236', '#72462e', '#613b27', '#523221', '#43291b', '#352015',
] as const;

export const HAIR_STYLES = [
  'bald', 'shaved', 'buzzCut', 'crewCut', 'sidePart', 'slickedBack', 'pompadour', 'combOver', 'receding', 'curtains',
  'frostedTips', 'bowlCut', 'mullet', 'afro', 'curlyTop', 'locs', 'cornrows', 'longStraight', 'longWavy', 'ponytail',
  'bun', 'bob', 'pixie', 'mohawk',
] as const;

export const HAIR_COLOURS = [
  'black', 'darkBrown', 'brown', 'auburn', 'ginger', 'blond', 'platinum', 'grey', 'white', 'dyedBlue', 'dyedPink',
  'dyedGreen',
] as const;

export const EYEBROWS = ['thin', 'normal', 'thick', 'bushy', 'unibrow', 'raised'] as const;

export const EYES = ['default', 'narrow', 'wide', 'tired', 'squint', 'closedSmile'] as const;

export const NOSES = [
  'straight', 'aquiline', 'roman', 'button', 'snub', 'bulbous', 'broad', 'crooked', 'longPointed', 'small',
] as const;

export const MOUTHS = [
  'neutral', 'smile', 'toothyGrin', 'smirk', 'frown', 'openLaugh', 'gapTooth', 'tightLipped', 'goldTooth', 'pout',
] as const;

export const FACIAL_HAIR = [
  'none', 'stubble', 'fullBeard', 'boxedBeard', 'goatee', 'vanDyke', 'chinstrap', 'soulPatch', 'sideburns',
  'muttonChops', 'pencilMoustache', 'toothbrushMoustache', 'handlebar', 'walrus', 'horseshoe', 'chevron',
  'hollywoodian', 'lampshade',
] as const;

/** The cigar, cigarette and pack carry the Rhodesia Tobacco Company logo. */
export const ACCESSORIES = [
  'none', 'roundGlasses', 'squareGlasses', 'halfMoonGlasses', 'aviators', 'monocle', 'earring', 'earpiece',
  'phoneHeadset', 'pipe', 'cigar', 'cigarette', 'cigarettePack', 'pearlNecklace', 'bowTieClip', 'lapelPin',
] as const;

export const CLOTHING = [
  'suitAndTie', 'threePiece', 'powerSuit', 'tuxedo', 'turtleneck', 'polo', 'hoodie', 'fleeceVest', 'suspenders',
  'cardigan', 'flannel', 'hawaiian', 'labCoat', 'windbreaker',
] as const;

export const CLOTHING_COLOURS = [
  'navy', 'charcoal', 'black', 'grey', 'white', 'cream', 'brown', 'tan', 'maroon', 'burgundy', 'forestGreen', 'olive',
  'royalBlue', 'skyBlue', 'purple', 'mustard',
] as const;

// Not in the company genome: companies derive these from the CEO's name genes (world/ceo.ts).
export const FACE_SHAPES = ['oval', 'round', 'square', 'long', 'heart'] as const;

/** Tints over the skin tone. */
export const UNDERTONES = ['neutral', 'warm', 'cool', 'olive'] as const;

/** Photo backgrounds: plain studio gradients, [top, bottom]. */
export const BACKGROUNDS = [
  ['#8fb4d9', '#3d6a99'], ['#c9c9c9', '#7d7d7d'], ['#7fc4c0', '#2f7773'], ['#d9a3a3', '#8a3e3e'],
  ['#a8c98f', '#4f7a3a'], ['#d9c29a', '#8a6a3a'], ['#b8a3d9', '#5a4a8a'], ['#f0e6c8', '#b8a878'],
] as const;

export const HAIR_HEX: Record<HairColour, string> = {
  black: '#1c1a1a', darkBrown: '#3b2616', brown: '#6b4423', auburn: '#8c3a1f', ginger: '#c8622a', blond: '#e0c068',
  platinum: '#efe8d0', grey: '#9a9a9a', white: '#eeeeee', dyedBlue: '#2f6fd6', dyedPink: '#e05aa8', dyedGreen: '#3fae4a',
};

export const CLOTHING_HEX: Record<ClothingColour, string> = {
  navy: '#1f2d57', charcoal: '#3a3d42', black: '#1a1a1a', grey: '#8a8d91', white: '#f2f2f2', cream: '#ece2c6',
  brown: '#5c3b22', tan: '#c4a57a', maroon: '#6d1a2a', burgundy: '#7e1f3b', forestGreen: '#1f4d2b', olive: '#5b6b2f',
  royalBlue: '#2346a0', skyBlue: '#7fb2e5', purple: '#5b2c83', mustard: '#d0a020',
};

export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColour = (typeof HAIR_COLOURS)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Clothing = (typeof CLOTHING)[number];
export type ClothingColour = (typeof CLOTHING_COLOURS)[number];
export type FaceShape = (typeof FACE_SHAPES)[number];
export type EyeStyle = (typeof EYES)[number];
export type Eyebrows = (typeof EYEBROWS)[number];
export type Nose = (typeof NOSES)[number];
export type Mouth = (typeof MOUTHS)[number];
