import {
  ACCESSORIES, BACKGROUNDS, CLOTHING, CLOTHING_COLOURS, EYEBROWS, EYES, FACE_SHAPES, FACIAL_HAIR, HAIR_COLOURS,
  HAIR_STYLES, MOUTHS, NOSES, SKIN_TONES, UNDERTONES, type Accessory, type Clothing, type HairColour, type HairStyle,
} from '../art/portrait/options';
import { packCode, unpackCode, type FieldValues } from './bitcode';
import { CEO_BLOCK, type Genes } from './genome';
import type { Industry } from './industries';
import { FIRST_NAMES, LAST_NAMES } from './people-names';
import type { Rng } from './rng';

/**
 * A CEO code (spec §8): the genome's CEO block bit for bit, then what a genome leaves out — face shape, skin
 * undertone, photo background — and custom 24-bit colours. Append only.
 */
export const CEO_FIELDS = [
  ...CEO_BLOCK,
  ['format', 4], ['faceShape', 3], ['undertone', 2], ['background', 3],
  ['customSkin', 24, 'optional'], ['customHair', 24, 'optional'], ['customClothing', 24, 'optional'],
  ['customBackground', 24, 'optional'],
] as const;

/** A CEO: one small integer per option (indices into art/portrait/options.ts), custom colours as 24-bit RGB. */
export type Ceo = FieldValues<typeof CEO_FIELDS>;
export type CeoGenes = Pick<Genes, (typeof CEO_BLOCK)[number][0]>;

export const CEO_FORMAT = 0;

export const encodeCeo = (ceo: Ceo): string => packCode(CEO_FIELDS, ceo);

/** Throws if the code is corrupt or names an option that doesn't exist. */
export function decodeCeo(code: string): Ceo {
  const ceo = unpackCode(CEO_FIELDS, code.trim(), 'CEO code');
  const within = (value: number, list: readonly unknown[]) => value < list.length;
  if (
    ceo.format !== CEO_FORMAT ||
    !within(ceo.faceShape, FACE_SHAPES) || !within(ceo.undertone, UNDERTONES) || !within(ceo.background, BACKGROUNDS) ||
    !within(ceo.hair, HAIR_STYLES) || !within(ceo.hairColour, HAIR_COLOURS) || !within(ceo.facialHair, FACIAL_HAIR) ||
    !within(ceo.eyes, EYES) || !within(ceo.eyebrows, EYEBROWS) || !within(ceo.nose, NOSES) || !within(ceo.mouth, MOUTHS) ||
    !within(ceo.clothing, CLOTHING) || !within(ceo.accessory, ACCESSORIES)
  ) {
    throw new Error('Invalid CEO code: unknown option');
  }
  return ceo;
}

export const ceoName = (ceo: Pick<Ceo, 'ceoFirstName' | 'ceoLastName'>) =>
  `${FIRST_NAMES[ceo.ceoFirstName % FIRST_NAMES.length]} ${LAST_NAMES[ceo.ceoLastName % LAST_NAMES.length]}`;

/** Age in years (the gene is 0–31 for 32–63). */
export const ceoAge = (ceo: Pick<Ceo, 'ceoAge'>) => 32 + ceo.ceoAge;

/**
 * A company CEO's full look. Genomes have no face shape, undertone or background genes, so those follow from the name
 * genes: fixed for the company, and uncorrelated with the rest of the face.
 */
export function companyCeo(genes: Genes): Ceo {
  const ceo = Object.fromEntries(CEO_BLOCK.map(([f]) => [f, genes[f]])) as CeoGenes;
  const n = genes.ceoFirstName * 1031 + genes.ceoLastName;
  return {
    ...ceo,
    format: CEO_FORMAT,
    faceShape: n % FACE_SHAPES.length,
    undertone: (n >> 3) % UNDERTONES.length,
    background: (n >> 5) % BACKGROUNDS.length,
  };
}

// Default CEO look. Industries add weight to clothing and accessories; age adds grey hair and baldness.
const CLOTHING_WEIGHTS: Record<Clothing, number> = {
  suitAndTie: 6, threePiece: 2, powerSuit: 2, tuxedo: 0.3, turtleneck: 1, polo: 1, hoodie: 0.3, fleeceVest: 1,
  suspenders: 1, cardigan: 1, flannel: 0.5, hawaiian: 0.3, labCoat: 0.3, windbreaker: 0.5,
};
const ACCESSORY_WEIGHTS: Record<Accessory, number> = {
  none: 14, roundGlasses: 2, squareGlasses: 2, halfMoonGlasses: 1, aviators: 1, monocle: 0.2, earring: 0.5,
  earpiece: 0.5, phoneHeadset: 0.5, pipe: 0.3, cigar: 0.3, cigarette: 0.3, cigarettePack: 0.2, pearlNecklace: 0.7,
  bowTieClip: 0.5, lapelPin: 1,
};
const HAIR_COLOUR_WEIGHTS: Record<HairColour, number> = {
  black: 3, darkBrown: 3, brown: 3, auburn: 1, ginger: 0.7, blond: 1.5, platinum: 0.3, grey: 0, white: 0,
  dyedBlue: 0.1, dyedPink: 0.1, dyedGreen: 0.1,
};
const THINNING = new Set<HairStyle>(['bald', 'receding', 'combOver']);
const FACIAL_HAIR_WEIGHTS = FACIAL_HAIR.map((f) => (f === 'none' ? 12 : f === 'stubble' ? 2 : 1));
type Tastes = Pick<Industry, 'clothing' | 'accessories'>;
/** `old` is 0 at 32 and 1 at 63. */
const hairWeights = (old: number) => HAIR_STYLES.map((h) => (THINNING.has(h) ? 0.3 + 3 * old : 1));
const hairColourWeights = (old: number) =>
  HAIR_COLOURS.map((c) => HAIR_COLOUR_WEIGHTS[c] + (c === 'grey' ? 5 * old : c === 'white' ? 2 * old * old : 0));
const clothingWeights = (tastes?: Tastes) => CLOTHING.map((c) => CLOTHING_WEIGHTS[c] + (tastes?.clothing?.[c] ?? 0));
const accessoryWeights = (tastes?: Tastes) => ACCESSORIES.map((a) => ACCESSORY_WEIGHTS[a] + (tastes?.accessories?.[a] ?? 0));
const any = (rng: Rng, list: readonly unknown[]) => rng.int(0, list.length - 1);

/**
 * The CEO block of a generated company. World generation depends on the exact sequence of draws: changing it
 * changes every world.
 */
export function ceoGenes(rng: Rng, industry?: Tastes): CeoGenes {
  const age = rng.int(0, 31); // 32–63
  const old = age / 31;
  return {
    ceoFirstName: any(rng, FIRST_NAMES),
    ceoLastName: any(rng, LAST_NAMES),
    ceoAge: age,
    skinTone: any(rng, SKIN_TONES),
    hair: rng.weighted(hairWeights(old)),
    hairColour: rng.weighted(hairColourWeights(old)),
    facialHair: rng.weighted(FACIAL_HAIR_WEIGHTS),
    eyes: any(rng, EYES),
    eyebrows: any(rng, EYEBROWS),
    nose: any(rng, NOSES),
    mouth: any(rng, MOUTHS),
    clothing: rng.weighted(clothingWeights(industry)),
    clothingColour: any(rng, CLOTHING_COLOURS),
    accessory: rng.weighted(accessoryWeights(industry)),
  };
}

/** A whole new CEO, as the portrait designer's Randomise button and invented people get one. */
export function randomCeo(rng: Rng, industry?: Tastes): Ceo {
  return {
    ...ceoGenes(rng, industry),
    format: CEO_FORMAT,
    faceShape: any(rng, FACE_SHAPES),
    undertone: any(rng, UNDERTONES),
    background: any(rng, BACKGROUNDS),
  };
}

/** The parts "Randomise one feature" can re-roll, in the designer's order. */
export const FEATURES = [
  'faceShape', 'skinTone', 'undertone', 'hair', 'hairColour', 'eyebrows', 'eyes', 'nose', 'mouth', 'facialHair',
  'accessory', 'clothing', 'clothingColour', 'background',
] as const;
export type Feature = (typeof FEATURES)[number];

/** The custom colour that overrides a feature's palette choice. */
export const CUSTOM_COLOUR = {
  skinTone: 'customSkin', undertone: 'customSkin', hairColour: 'customHair', clothingColour: 'customClothing',
  background: 'customBackground',
} as const satisfies Partial<Record<Feature, keyof Ceo>>;

/**
 * Re-rolls one feature to a different value, drawn as randomCeo draws it (so a 35-year-old rarely turns grey), and
 * drops that feature's custom colour.
 */
export function randomiseFeature(rng: Rng, ceo: Ceo, feature: Feature): Ceo {
  const old = ceo.ceoAge / 31;
  const draw: Record<Feature, () => number> = {
    faceShape: () => any(rng, FACE_SHAPES),
    skinTone: () => any(rng, SKIN_TONES),
    undertone: () => any(rng, UNDERTONES),
    hair: () => rng.weighted(hairWeights(old)),
    hairColour: () => rng.weighted(hairColourWeights(old)),
    eyebrows: () => any(rng, EYEBROWS),
    eyes: () => any(rng, EYES),
    nose: () => any(rng, NOSES),
    mouth: () => any(rng, MOUTHS),
    facialHair: () => rng.weighted(FACIAL_HAIR_WEIGHTS),
    accessory: () => rng.weighted(accessoryWeights()),
    clothing: () => rng.weighted(clothingWeights()),
    clothingColour: () => any(rng, CLOTHING_COLOURS),
    background: () => any(rng, BACKGROUNDS),
  };
  const next = { ...ceo };
  if (feature in CUSTOM_COLOUR) delete next[CUSTOM_COLOUR[feature as keyof typeof CUSTOM_COLOUR]];
  for (let tries = 0; tries < 100 && next[feature] === ceo[feature]; tries++) next[feature] = draw[feature]();
  return next;
}
