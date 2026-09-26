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

export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColour = (typeof HAIR_COLOURS)[number];
export type FacialHair = (typeof FACIAL_HAIR)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Clothing = (typeof CLOTHING)[number];
