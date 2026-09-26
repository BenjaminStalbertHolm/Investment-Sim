import type { Clothing, EyeStyle, Eyebrows, FaceShape, FacialHair, HairStyle, Mouth, Nose } from './options';

/**
 * Portrait parts (spec §8) on a 120 × 150 canvas: head and upper chest, front-facing, the face centred on x = 60.
 * Paths are SVG path data; parts drawn on one side of the face are mirrored for the other.
 */

export interface FaceGeometry {
  path: string;
  /** Half the face's width at the ears. */
  half: number;
  chin: number;
}

export const FACES: Record<FaceShape, FaceGeometry> = {
  oval: { path: 'M60 30C74 30 82 41 82 56C82 72 72 86 60 86C48 86 38 72 38 56C38 41 46 30 60 30Z', half: 22, chin: 86 },
  round: { path: 'M60 30C75 30 83 42 83 58C83 74 73 85 60 85C47 85 37 74 37 58C37 42 45 30 60 30Z', half: 23, chin: 85 },
  square: { path: 'M60 30C74 30 82 39 82 53L82 70C82 80 73 86 60 86C47 86 38 80 38 70L38 53C38 39 46 30 60 30Z', half: 22, chin: 86 },
  long: { path: 'M60 29C73 29 80 40 80 56C80 76 71 90 60 90C49 90 40 76 40 56C40 40 47 29 60 29Z', half: 20, chin: 90 },
  heart: { path: 'M60 30C75 30 83 40 83 53C83 67 71 80 60 87C49 80 37 67 37 53C37 40 45 30 60 30Z', half: 23, chin: 87 },
};

export const NECK = 'M50 70L50 101Q60 107 70 101L70 70Z';

/** A bumpy closed outline (afros, curls): `bumps` arcs around an ellipse. */
export function bumpy(cx: number, cy: number, rx: number, ry: number, bumps: number, depth: number): string {
  const point = (a: number, r: number) => `${(cx + Math.cos(a) * rx * r).toFixed(1)} ${(cy + Math.sin(a) * ry * r).toFixed(1)}`;
  let d = `M${point(0, 1)}`;
  for (let i = 0; i < bumps; i++) {
    const a0 = (i / bumps) * 2 * Math.PI;
    const a1 = ((i + 1) / bumps) * 2 * Math.PI;
    d += `Q${point((a0 + a1) / 2, 1 + depth)} ${point(a1, 1)}`;
  }
  return `${d}Z`;
}

/**
 * Hair in up to three layers: `back` behind the head and neck, `drape` over the shoulders (behind the face) and
 * `front` over the forehead. `detail` lines are drawn in a darker shade, `tips` in a light one; `shaved` layers are
 * translucent, like stubble on the scalp.
 */
export interface HairParts {
  back?: string;
  drape?: string;
  front?: string;
  shaved?: string;
  detail?: string;
  tips?: string;
}

const CAP = 'M37 57C35 36 45 26 60 26C75 26 85 36 83 57L80 57C80 47 75 41 60 40C45 41 40 47 40 57Z';
const TIGHT = 'M38 56C36 36 45 28 60 28C75 28 84 36 82 56L80 56C79 47 74 42 60 41C46 42 41 47 40 56Z';
const SLICK = 'M37 56C35 34 45 24 60 24C75 24 85 34 83 56L81 56C80 44 74 37 60 37C46 37 40 44 39 56Z';
const PARTED = 'M36 62C33 36 44 24 60 24C76 24 87 36 84 62L81 62C80 50 74 40 60 32C46 40 40 50 39 62Z';
const LOCS = [34, 40, 46].map((x) => `M${x} 44C${x - 3} 70 ${x - 1} 96 ${x + 1} 114L${x + 6} 114C${x + 4} 96 ${x + 3} 70 ${x + 5} 44Z`).join('');

export const HAIR: Record<HairStyle, HairParts> = {
  bald: {},
  shaved: { shaved: CAP },
  buzzCut: { front: TIGHT },
  crewCut: { front: 'M37 55C36 38 40 27 48 25L72 25C80 27 84 38 83 55L80 55C79 47 75 41 60 41C45 41 41 47 40 55Z' },
  sidePart: {
    front: 'M37 57C34 36 44 24 60 24C77 24 86 36 83 57L80 57C80 46 76 42 70 40C62 38 54 42 48 44C44 46 41 50 40 57Z',
    detail: 'M50 26L47 40',
  },
  slickedBack: { front: SLICK, detail: 'M47 30Q60 26 73 30M45 34Q60 30 75 34' },
  pompadour: {
    front: 'M37 56C34 38 38 22 52 16C64 11 80 14 84 26C86 34 85 46 83 56L80 56C80 46 76 41 68 40C58 39 48 40 42 45C40 48 40 52 40 56Z',
    detail: 'M48 22C56 16 70 16 78 24',
  },
  combOver: {
    front: 'M37 57C36 48 38 44 42 41L42 57ZM83 57C84 48 82 44 78 41L78 57Z',
    detail: 'M41 44C47 33 63 31 80 41M42 40C50 31 64 29 78 36M45 36C52 29 64 28 74 32',
  },
  receding: { front: 'M37 57C35 36 45 26 60 26C75 26 85 36 83 57L80 57C80 48 77 40 72 35C68 38 64 40 60 40C56 40 52 38 48 35C43 40 40 48 40 57Z' },
  curtains: {
    front: 'M36 62C33 38 44 25 60 25C76 25 87 38 84 62L81 62C80 55 78 51 74 50C70 44 64 38 60 31C56 38 50 44 46 50C42 51 40 55 39 62Z',
    detail: 'M60 31L60 27',
  },
  frostedTips: {
    front: 'M38 52C36 38 42 30 47 28L46 20L52 26L55 17L59 25L63 16L66 25L71 18L72 27L78 23L76 31C82 36 83 44 82 52L80 52C79 46 75 42 60 41C45 42 41 46 40 52Z',
    tips: 'M46 20L50 24L47 25ZM55 17L58 22L54 22ZM63 16L65 22L61 21ZM71 18L71 23L68 22ZM78 23L76 27L74 25Z',
  },
  bowlCut: { front: 'M35 60C33 34 45 23 60 23C75 23 87 34 85 60L82 60L82 47L38 47L38 60Z', detail: 'M44 47L45 42M52 47L52 41M60 47L60 41M68 47L68 41M76 47L75 42' },
  mullet: { back: 'M38 56C36 72 38 90 34 106L48 102L50 84L70 84L72 102L86 106C82 90 84 72 82 56Z', front: CAP },
  afro: { back: bumpy(60, 44, 36, 33, 18, 0.07), front: TIGHT },
  curlyTop: { front: `${TIGHT}${bumpy(60, 31, 22, 10, 12, 0.18)}` },
  locs: {
    back: 'M34 50C32 28 44 20 60 20C76 20 88 28 86 50L86 100L34 100Z',
    drape: `${LOCS}${LOCS.replace(/M(\d+)/g, (_, x) => `M${120 - Number(x) - 6}`)}`,
    front: TIGHT,
    detail: 'M50 29L48 40M60 27L60 40M70 29L72 40',
  },
  cornrows: { front: TIGHT, detail: 'M44 42C42 36 44 31 48 29M50 41C49 35 50 30 54 28M56 40C56 34 57 30 59 28M64 40C64 34 63 30 61 28M70 41C71 35 70 30 66 28M76 42C78 36 76 31 72 29' },
  longStraight: {
    back: 'M34 52C32 28 44 20 60 20C76 20 88 28 86 52L88 100L32 100Z',
    drape: 'M36 56L33 120L45 120L46 92L42 60ZM84 56L87 120L75 120L74 92L78 60Z',
    front: PARTED,
  },
  longWavy: {
    back: 'M34 52C30 28 44 19 60 19C76 19 90 28 86 52C90 66 84 80 90 100L30 100C36 80 30 66 34 52Z',
    drape: 'M36 56C30 72 38 84 32 98C28 108 36 116 34 122L46 122C44 110 50 102 46 92C44 80 44 68 42 60ZM84 56C90 72 82 84 88 98C92 108 84 116 86 122L74 122C76 110 70 102 74 92C76 80 76 68 78 60Z',
    front: PARTED,
  },
  ponytail: { back: 'M76 40C94 44 96 70 88 100C84 90 82 70 74 56Z', front: SLICK, detail: 'M78 44L84 40' },
  bun: { back: 'M60 9C67 9 72 14 72 20C72 26 67 30 60 30C53 30 48 26 48 20C48 14 53 9 60 9Z', front: SLICK },
  bob: {
    back: 'M33 52C31 28 44 21 60 21C76 21 89 28 87 52L88 84C82 88 77 87 74 84L46 84C43 87 38 88 32 84Z',
    front: 'M36 64C33 34 44 23 60 23C76 23 87 34 84 64L81 64C81 54 79 47 76 46L44 46C41 47 39 54 39 64Z',
  },
  pixie: { front: 'M37 58C34 34 45 24 60 24C76 24 86 34 83 56L80 54C79 46 72 42 64 44L58 48L54 44L48 48L44 46C41 49 40 54 40 58Z' },
  mohawk: { shaved: CAP, front: 'M53 42C52 30 54 16 60 9C66 16 68 30 67 42Z' },
};

/** Facial hair, in parts drawn over the face (`face` is clipped to the face outline) and below the chin. */
export interface FacialHairParts {
  /** Clipped to the face. */
  face?: string;
  /** Unclipped (moustaches, tufts under the chin); `m` is the mouth's y. */
  over?: (m: number, chin: number) => string;
  /** Drawn as a thick line along the jaw. */
  strap?: boolean;
  /** Translucent. */
  stubble?: boolean;
}

const MOUSTACHE = (m: number) => `M50 ${m - 3}C52 ${m - 8} 58 ${m - 7} 60 ${m - 6}C62 ${m - 7} 68 ${m - 8} 70 ${m - 3}C66 ${m - 5} 54 ${m - 5} 50 ${m - 3}Z`;
const BEARD_ZONE = 'M28 52L40 52C42 64 48 69 60 69C72 69 78 64 80 52L92 52L92 104L28 104Z';
const bulk = (chin: number, depth: number) => `M46 ${chin - 4}C48 ${chin + depth} 72 ${chin + depth} 74 ${chin - 4}Z`;

export const FACIAL: Record<FacialHair, FacialHairParts> = {
  none: {},
  stubble: { face: BEARD_ZONE, stubble: true },
  fullBeard: { face: BEARD_ZONE, over: (m, chin) => MOUSTACHE(m) + bulk(chin, 9) },
  boxedBeard: { face: 'M28 58L41 58C43 70 50 73 60 73C70 73 77 70 79 58L92 58L92 104L28 104Z', over: (m, chin) => MOUSTACHE(m) + bulk(chin, 4) },
  goatee: {
    over: (m, chin) =>
      `${MOUSTACHE(m)}M52 ${m + 4}C52 ${chin - 1} 56 ${chin + 2} 60 ${chin + 2}C64 ${chin + 2} 68 ${chin - 1} 68 ${m + 4}C64 ${m + 7} 56 ${m + 7} 52 ${m + 4}Z`,
  },
  vanDyke: {
    over: (m, chin) =>
      `M49 ${m - 2}C51 ${m - 8} 58 ${m - 7} 60 ${m - 6}C62 ${m - 7} 69 ${m - 8} 71 ${m - 2}C70 ${m - 5} 66 ${m - 5} 60 ${m - 4}C54 ${m - 5} 50 ${m - 5} 49 ${m - 2}Z` +
      `M55 ${m + 6}L60 ${chin + 6}L65 ${m + 6}C62 ${m + 8} 58 ${m + 8} 55 ${m + 6}Z`,
  },
  chinstrap: { strap: true },
  soulPatch: { over: (m) => `M57 ${m + 4}L63 ${m + 4}L60 ${m + 9}Z` },
  sideburns: { face: 'M28 46L42 46L42 68L28 68ZM78 46L92 46L92 68L78 68Z' },
  muttonChops: {
    face: 'M28 46L42 46C43 58 46 66 52 70L52 76C44 78 36 76 28 74ZM92 46L78 46C77 58 74 66 68 70L68 76C76 78 84 76 92 74Z',
    over: MOUSTACHE,
  },
  pencilMoustache: { over: (m) => `M51 ${m - 3}C55 ${m - 5.5} 65 ${m - 5.5} 69 ${m - 3}C65 ${m - 4.3} 55 ${m - 4.3} 51 ${m - 3}Z` },
  toothbrushMoustache: { over: (m) => `M56 ${m - 7}L64 ${m - 7}L64 ${m - 3}L56 ${m - 3}Z` },
  handlebar: {
    over: (m) => {
      const half = (s: number) =>
        `M60 ${m - 6}C${60 - 6 * s} ${m - 8} ${60 - 12 * s} ${m - 5} ${60 - 15 * s} ${m - 4}C${60 - 18 * s} ${m - 3} ${60 - 19 * s} ${m - 7} ${60 - 17 * s} ${m - 10}` +
        `C${60 - 20 * s} ${m - 7} ${60 - 18 * s} ${m - 1} ${60 - 13 * s} ${m - 2}C${60 - 8 * s} ${m - 3} ${60 - 4 * s} ${m - 3} 60 ${m - 3}Z`;
      return half(1) + half(-1);
    },
  },
  walrus: {
    over: (m) =>
      `M46 ${m - 1}C46 ${m - 8} 54 ${m - 9} 60 ${m - 8}C66 ${m - 9} 74 ${m - 8} 74 ${m - 1}C72 ${m + 3} 68 ${m + 2} 66 ${m}L54 ${m}C52 ${m + 2} 48 ${m + 3} 46 ${m - 1}Z`,
  },
  horseshoe: {
    over: (m) => `M49 ${m - 5}C53 ${m - 8} 67 ${m - 8} 71 ${m - 5}L71 ${m + 10}L67 ${m + 10}L67 ${m - 3}L53 ${m - 3}L53 ${m + 10}L49 ${m + 10}Z`,
  },
  chevron: { over: (m) => `M47 ${m - 2}C49 ${m - 10} 71 ${m - 10} 73 ${m - 2}C66 ${m - 4} 54 ${m - 4} 47 ${m - 2}Z` },
  hollywoodian: {
    face: 'M28 80C40 79 50 81 60 81C70 81 80 79 92 80L92 104L28 104Z',
    over: (m, chin) => MOUSTACHE(m) + bulk(chin, 5),
  },
  lampshade: { over: (m) => `M55 ${m - 8}L65 ${m - 8}L68 ${m - 3}L52 ${m - 3}Z` },
};

/** An eye centred on (51, 57); the right eye is its mirror image. */
export const EYE_PARTS: Record<EyeStyle, { white?: [number, number]; iris?: number; lines?: string }> = {
  default: { white: [3.6, 2.4], iris: 1.8 },
  narrow: { white: [3.6, 1.4], iris: 1.3 },
  wide: { white: [4, 3.2], iris: 2 },
  tired: { white: [3.4, 2], iris: 1.7, lines: 'M47.2 55.8Q51 54.2 54.8 55.8M47.5 60.6Q51 62.2 54.5 60.6' },
  squint: { lines: 'M47 57Q51 55.6 55 57M47.5 57.6Q51 58.6 54.5 57.6' },
  closedSmile: { lines: 'M47 58Q51 54.4 55 58' },
};

/** The left eyebrow, above the eye; stroke width, or a filled shape. */
export const BROWS: Record<Eyebrows, { path: string; width: number; fill?: boolean }> = {
  thin: { path: 'M46.5 51Q51 49 55.5 51', width: 1 },
  normal: { path: 'M46 51.5Q51 49 56 51', width: 1.8 },
  thick: { path: 'M46 51.5Q51 48.6 56 51', width: 3 },
  bushy: { path: 'M45 53Q50 46.6 57 50.5L57.5 53Q51 50.5 45 54.5Z', width: 0.6, fill: true },
  unibrow: { path: 'M45 52Q51 48 57 51Q60 52.4 63 51Q69 48 75 52', width: 2.6 },
  raised: { path: 'M46 50.5Q51 45 56 49', width: 1.8 },
};

/** Stroked in a darker skin shade; `tip` is a filled nose tip. */
export const NOSE_PARTS: Record<Nose, { path: string; tip?: [number, number, number, number]; nostrils?: boolean }> = {
  straight: { path: 'M60 58L58 66M56 67Q60 69 64 67' },
  aquiline: { path: 'M60 57Q64 61 61.5 66.5L58.5 67M56 67Q60 69.5 64 67' },
  roman: { path: 'M59 57L62 62L60.5 67M56 67Q60 69 64 67' },
  button: { path: 'M57 66Q60 69 63 66', tip: [60, 65.4, 2.6, 2] },
  snub: { path: 'M60 60Q59.4 63.6 57.5 65Q60 66.6 62.5 65', nostrils: true },
  bulbous: { path: 'M60 58L59.4 62', tip: [60, 66, 5, 4] },
  broad: { path: 'M60 58L59.4 64M53 67Q56 64 60 68Q64 64 67 67' },
  crooked: { path: 'M60 57Q56.6 61 61 64L59 67M55 67Q59 69 63 67' },
  longPointed: { path: 'M60 57L60.6 71L57.4 70.4M57.4 70.4Q60 72.4 63 70.6' },
  small: { path: 'M58 65Q60 67 62 65' },
};

/** Mouths at y = m. `open` is a filled mouth (dark inside), `teeth` a white fill, `lip` the lower lip's shade. */
export const MOUTH_PARTS: Record<Mouth, (m: number) => { line?: string; open?: string; teeth?: string; gap?: boolean; gold?: boolean; lip?: string; pout?: boolean; width?: number }> = {
  neutral: (m) => ({ line: `M53 ${m}L67 ${m}`, lip: `M55.5 ${m + 2}Q60 ${m + 3.6} 64.5 ${m + 2}` }),
  smile: (m) => ({ line: `M52 ${m - 1}Q60 ${m + 5} 68 ${m - 1}`, lip: `M56 ${m + 4}Q60 ${m + 5.2} 64 ${m + 4}` }),
  toothyGrin: (m) => ({ teeth: `M51 ${m - 2}Q60 ${m + 8} 69 ${m - 2}Q60 ${m + 1} 51 ${m - 2}Z` }),
  smirk: (m) => ({ line: `M53 ${m + 1}Q60 ${m + 2} 67 ${m - 2.4}`, lip: `M56 ${m + 3}Q60 ${m + 4} 63.5 ${m + 3}` }),
  frown: (m) => ({ line: `M53 ${m + 2}Q60 ${m - 3} 67 ${m + 2}`, lip: `M56 ${m + 3}Q60 ${m + 2} 64 ${m + 3}` }),
  openLaugh: (m) => ({ open: `M51 ${m - 2}Q60 ${m - 1} 69 ${m - 2}Q60 ${m + 12} 51 ${m - 2}Z`, teeth: `M52.6 ${m - 1.6}Q60 ${m - 0.8} 67.4 ${m - 1.6}L67 ${m + 0.8}Q60 ${m + 1.6} 53 ${m + 0.8}Z` }),
  gapTooth: (m) => ({ teeth: `M51 ${m - 2}Q60 ${m + 8} 69 ${m - 2}Q60 ${m + 1} 51 ${m - 2}Z`, gap: true }),
  tightLipped: (m) => ({ line: `M54 ${m}L66 ${m}`, width: 2.2 }),
  goldTooth: (m) => ({ teeth: `M51 ${m - 2}Q60 ${m + 8} 69 ${m - 2}Q60 ${m + 1} 51 ${m - 2}Z`, gold: true }),
  pout: (m) => ({ pout: true, line: `M56.5 ${m}Q60 ${m - 1} 63.5 ${m}` }),
};

/** The torso every outfit starts from, and the power suit's padded version. */
export const TORSO = 'M6 150C8 122 18 108 42 101C48 99 52 98 60 98C68 98 72 99 78 101C102 108 112 122 114 150Z';
export const PADDED = 'M1 150L2 115C4 104 20 100 42 99C48 98 52 98 60 98C68 98 72 98 78 99C100 100 116 104 118 115L119 150Z';
/** Shirt showing in a jacket's V, collar points, lapels (left; mirrored), and a tie. */
export const SHIRT_V = 'M47 99L60 138L73 99Q66 103 60 103Q54 103 47 99Z';
export const COLLAR = 'M47 99L54 110L60 103Z';
export const LAPEL = 'M46 100L60 138L55 141L42 112L46.5 108L40 103Z';
export const TIE = 'M57 103L63 103L62.2 108L57.8 108ZM57.8 108L62.2 108L65 136L60 142L55 136Z';
export const BOW_TIE = 'M60 105L51 100.5L51 109.5ZM60 105L69 100.5L69 109.5Z';

/** Outfits: which of the shared pieces they use, and pieces of their own. */
export interface Outfit {
  padded?: boolean;
  /** The shirt showing in the V (or, with `torso: 'shirt'`, the whole torso). */
  shirt?: 'white' | 'cream' | 'light';
  torso?: 'shirt';
  tie?: boolean;
  bowTie?: boolean;
  lapels?: boolean;
  /** Pieces in the garment's colour (outlined), darker, lighter; `lines` are stroked only. */
  garment?: string;
  darker?: string;
  lighter?: string;
  lines?: string;
  buttons?: [number, number][];
  pattern?: 'plaid' | 'flowers';
  /** A white coat: the clothing colour goes on the tie. */
  whiteCoat?: boolean;
  /** A collar up the neck. */
  turtleneck?: boolean;
}

export const TURTLENECK = 'M49 76L49 99Q60 105 71 99L71 76Q60 80 49 76Z';

export const OUTFITS: Record<Clothing, Outfit> = {
  suitAndTie: { shirt: 'white', tie: true, lapels: true, buttons: [[60, 144]] },
  threePiece: {
    shirt: 'white', tie: true, lapels: true,
    darker: 'M50 118L60 138L70 118L69 150L51 150Z',
    lighter: 'M79 122L90 118L89 125Z',
    buttons: [[60, 142], [60, 147]],
  },
  powerSuit: { padded: true, shirt: 'cream', lapels: true, buttons: [[60, 143]] },
  tuxedo: { shirt: 'white', bowTie: true, lapels: true, buttons: [[60, 118], [60, 126]] },
  turtleneck: { turtleneck: true, lines: 'M52 84L52 98M56 85L56 101M60 85L60 102M64 85L64 101M68 84L68 98' },
  polo: { garment: 'M47 99L55 110L60 102L65 110L73 99L60 101Z', lines: 'M60 102L60 118', buttons: [[60, 108], [60, 114]] },
  hoodie: {
    darker: 'M38 105C42 95 49 93 52 97L60 104L68 97C71 93 78 95 82 105C75 111 67 113 60 113C53 113 45 111 38 105Z',
    lines: 'M55 111L54 130M65 111L66 130',
  },
  fleeceVest: {
    shirt: 'light', torso: 'shirt',
    garment: 'M24 150L28 110C36 104 44 101 49 100L60 116L71 100C76 101 84 104 92 110L96 150Z',
    lines: 'M49 99L55 109L60 103L65 109L71 99M60 116L60 150',
  },
  suspenders: { shirt: 'light', torso: 'shirt', tie: true, garment: 'M43 101L47 150L53 150L49 100ZM77 101L73 150L67 150L71 100Z' },
  cardigan: { shirt: 'white', buttons: [[60, 141], [60, 147]], lines: 'M47 99L60 138L73 99' },
  flannel: { pattern: 'plaid', garment: 'M47 99L54 112L60 101L66 112L73 99L60 100Z' },
  hawaiian: { pattern: 'flowers', garment: 'M45 99L56 115L60 106L64 115L75 99L60 104Z' },
  labCoat: { shirt: 'light', whiteCoat: true, tie: true, lapels: true, lighter: 'M80 119L92 117L93 124L81 126Z', lines: 'M85 111L85.6 120' },
  windbreaker: {
    lighter: 'M8 138C9 131 11 127 13 123L107 123C109 127 111 131 112 138L104 138L100 130L20 130L16 138Z',
    garment: 'M46 96L60 105L74 96L74 101L60 110L46 101Z',
    lines: 'M60 110L60 150',
  },
};
