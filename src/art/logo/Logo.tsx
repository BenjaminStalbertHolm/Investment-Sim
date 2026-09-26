import type { CSSProperties, ReactNode } from 'react';
import type { Genes } from '../../world/genome';
import { MOTIF_ICONS } from './motifs';
import {
  LOGO_FONTS, LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES, type LogoFont, type LogoLayout, type LogoMotif,
  type LogoShape, type Palette,
} from './options';

/** Everything a logo is drawn from (spec §7). Phase 5's designer adds effects and custom colours. */
export interface LogoSpec {
  shape: LogoShape;
  motif: LogoMotif;
  palette: Palette;
  font: LogoFont;
  layout: LogoLayout;
}

const item = <T,>(list: readonly T[], index: number): T => list[index % list.length];

/** A company's logo from its genome's logo block. */
export const companyLogo = (g: Genes): LogoSpec => ({
  shape: item(LOGO_SHAPES, g.logoShape),
  motif: item(LOGO_MOTIFS, g.logoMotif),
  palette: item(PALETTES, g.logoPalette),
  font: item(LOGO_FONTS, g.logoFont),
  layout: item(LOGO_LAYOUTS, g.logoLayout),
});

/** Containers on a 100 × 100 grid, and where the motif sits inside each. */
const SHAPES: Record<Exclude<LogoShape, 'none'>, { draw(fill: string): ReactNode; motif: [number, number, number] }> = {
  circle: { draw: (fill) => <circle cx="50" cy="50" r="48" fill={fill} />, motif: [22, 22, 56] },
  square: { draw: (fill) => <rect x="4" y="4" width="92" height="92" fill={fill} />, motif: [20, 20, 60] },
  roundedSquare: { draw: (fill) => <rect x="4" y="4" width="92" height="92" rx="20" fill={fill} />, motif: [20, 20, 60] },
  shield: { draw: (fill) => <path d="M50 3L94 14V46C94 72 74 88 50 97 26 88 6 72 6 46V14Z" fill={fill} />, motif: [24, 18, 52] },
  diamond: { draw: (fill) => <path d="M50 2L98 50 50 98 2 50Z" fill={fill} />, motif: [28, 28, 44] },
  hexagon: { draw: (fill) => <path d="M27 5H73L97 50 73 95H27L3 50Z" fill={fill} />, motif: [23, 23, 54] },
  triangle: { draw: (fill) => <path d="M50 4L97 92H3Z" fill={fill} />, motif: [30, 42, 40] },
  banner: { draw: (fill) => <path d="M2 22H98L88 50 98 78H2L12 50Z" fill={fill} />, motif: [30, 26, 48] },
  oval: { draw: (fill) => <ellipse cx="50" cy="50" rx="48" ry="38" fill={fill} />, motif: [26, 24, 52] },
};

/** Wordmark fonts from what a 1998 Mac or PC had installed: no web fonts. */
export const LOGO_FONT_STYLES: Record<LogoFont, CSSProperties> = {
  serif: { fontFamily: '"Times New Roman", Times, Georgia, serif', fontWeight: 'bold' },
  sans: { fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 'bold' },
  slab: { fontFamily: 'Rockwell, "American Typewriter", "Courier New", serif', fontWeight: 'bold' },
  script: { fontFamily: '"Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive', fontStyle: 'italic' },
  pixel: { fontFamily: '"Courier New", Courier, monospace', fontWeight: 'bold', letterSpacing: '0.05em' },
  condensed: { fontFamily: '"Arial Narrow", "Helvetica Neue", Arial, sans-serif', fontStretch: 'condensed', fontWeight: 'bold' },
  extended: { fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase' },
  blackletter: { fontFamily: '"Old English Text MT", "Apple Chancery", Luminari, fantasy' },
};

/** How light a colour is, 0–1 (relative luminance). */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((k) => {
    const c = parseInt(hex.slice(k, k + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The palette's colour that reads on a light page: the main one unless it is nearly white. */
export const inkColour = (p: Palette) => (luminance(p.colors[0]) > 0.7 ? p.colors[1] : p.colors[0]);

/** "Ridgepine Timber Co." → "RT": initials of up to three significant words. */
export function monogram(name: string): string {
  const words = name.replace(/\(.*?\)/g, '').split(/[^A-Za-z0-9]+/).filter((w) => w && !/^(and|of|the|co|inc|corp|ltd|plc|com)$/i.test(w));
  return (words.length ? words : [name]).slice(0, 3).map((w) => w[0].toUpperCase()).join('');
}

function Emblem({ spec, name, height }: { spec: LogoSpec; name: string; height: number }) {
  const [main, accent] = spec.palette.colors;
  const shape = spec.shape === 'none' ? (spec.layout === 'monogram' ? SHAPES.circle : undefined) : SHAPES[spec.shape];
  const Motif = MOTIF_ICONS[spec.motif];
  const [x, y, size] = shape?.motif ?? [4, 4, 92];
  const letters = monogram(name);
  return (
    <svg className="logo-emblem" width={height} height={height} viewBox="0 0 100 100" aria-hidden="true">
      {shape?.draw(main)}
      {spec.layout === 'monogram' ? (
        <text x="50" y="50" dy="0.35em" textAnchor="middle" fill={accent} fontSize={letters.length > 2 ? 30 : 40} style={LOGO_FONT_STYLES[spec.font]}>
          {letters}
        </text>
      ) : (
        <Motif x={x} y={y} size={size} color={shape ? accent : main} />
      )}
    </svg>
  );
}

/**
 * A logo (spec §7): emblem and wordmark laid out as the spec's five layouts. Every logo in the game, company or firm,
 * draws through here. `height` is the emblem's size in pixels.
 */
export function Logo({ spec, name, height = 48, showName = true }: { spec: LogoSpec; name: string; height?: number; showName?: boolean }) {
  const [main, accent] = spec.palette.colors;
  const font = LOGO_FONT_STYLES[spec.font];
  const wordmark = (size: number, colour = inkColour(spec.palette)) =>
    showName && (
      <span className="logo-wordmark" style={{ ...font, color: colour, fontSize: size }}>
        {name}
      </span>
    );
  switch (spec.layout) {
    case 'textOnly':
      return (
        <span className="logo logo-text-only" style={{ borderBottomColor: accent }}>
          {wordmark(height * 0.6) || monogram(name)}
        </span>
      );
    case 'textInside':
      return (
        <span className={`logo logo-text-inside logo-shape-${spec.shape}`} style={{ background: main, ...font, color: accent, fontSize: height * 0.45 }}>
          {showName ? name : monogram(name)}
        </span>
      );
    case 'iconAbove':
      return (
        <span className="logo logo-icon-above">
          <Emblem spec={spec} name={name} height={height} />
          {wordmark(height * 0.35)}
        </span>
      );
    default:
      return (
        <span className="logo logo-icon-left">
          <Emblem spec={spec} name={name} height={height} />
          {wordmark(height * 0.5)}
        </span>
      );
  }
}
