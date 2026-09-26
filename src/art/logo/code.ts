import { colourBits, colourHex, packCode, unpackCode } from '../../world/bitcode';
import type { LogoSpec } from './Logo';
import { LOGO_EFFECTS, LOGO_FONTS, LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES } from './options';

/**
 * A logo code (spec §7): the genome's logo block (shape, motif, palette, font, layout), then the WordArt effect and
 * any custom colours that replace the palette's. Six characters without custom colours. Append only.
 */
export const LOGO_FIELDS = [
  ['format', 4], ['shape', 5], ['motif', 5], ['palette', 6], ['font', 3], ['layout', 3], ['effect', 3],
  ['main', 24, 'optional'], ['accent', 24, 'optional'], ['background', 24, 'optional'],
] as const;

const COLOURS = ['main', 'accent', 'background'] as const;

export function encodeLogo(spec: LogoSpec): string {
  const base = PALETTES.findIndex((p) => p.id === spec.palette.id);
  const custom = Object.fromEntries(
    COLOURS.flatMap((slot, i) => {
      const colour = spec.palette.colors[i];
      return colour && colour !== PALETTES[base].colors[i] ? [[slot, colourBits(colour)]] : [];
    }),
  );
  return packCode(LOGO_FIELDS, {
    format: 0,
    shape: LOGO_SHAPES.indexOf(spec.shape),
    motif: LOGO_MOTIFS.indexOf(spec.motif),
    palette: base,
    font: LOGO_FONTS.indexOf(spec.font),
    layout: LOGO_LAYOUTS.indexOf(spec.layout),
    effect: LOGO_EFFECTS.indexOf(spec.effect ?? 'none'),
    ...custom,
  });
}

/** Throws if the code is corrupt or names a part that doesn't exist. */
export function decodeLogo(code: string): LogoSpec {
  const v = unpackCode(LOGO_FIELDS, code.trim(), 'logo code');
  const base = PALETTES[v.palette];
  const parts = [LOGO_SHAPES[v.shape], LOGO_MOTIFS[v.motif], base, LOGO_FONTS[v.font], LOGO_LAYOUTS[v.layout], LOGO_EFFECTS[v.effect]];
  if (v.format !== 0 || parts.some((part) => part === undefined)) throw new Error('Invalid logo code: unknown part');
  const colors = COLOURS.map((slot, i) => (v[slot] === undefined ? base.colors[i] : colourHex(v[slot]))) as [string, string, string?];
  if (!colors[2]) colors.length = 2;
  return {
    shape: LOGO_SHAPES[v.shape],
    motif: LOGO_MOTIFS[v.motif],
    palette: { ...base, colors },
    font: LOGO_FONTS[v.font],
    layout: LOGO_LAYOUTS[v.layout],
    effect: LOGO_EFFECTS[v.effect],
  };
}

/** A new firm's logo until the player designs one: a navy-and-gold bull. */
export const DEFAULT_LOGO: LogoSpec = {
  shape: 'circle', motif: 'bull', palette: PALETTES.find((p) => p.id === 'navyGold')!, font: 'serif', layout: 'iconLeft',
};
