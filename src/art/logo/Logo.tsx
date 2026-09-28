import { useId, type CSSProperties, type ReactNode } from 'react';
import type { Genes } from '../../world/genome';
import { PixelArt } from '../pixels';
import { MOTIF_ICONS } from './motifs';
import './logo.css';
import {
  LOGO_FONTS, LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES, type LogoEffect, type LogoFont, type LogoLayout,
  type LogoMotif, type LogoShape, type Palette,
} from './options';

/**
 * Everything a logo is drawn from (spec §7). Custom colours replace the palette's colours (its id stays the palette
 * they started from); a third colour is a background panel behind the logo.
 */
export interface LogoSpec {
  shape: LogoShape;
  motif: LogoMotif;
  palette: Palette;
  font: LogoFont;
  layout: LogoLayout;
  effect?: LogoEffect;
  /** A MajorPaint picture in place of the motif (spec §4A: a drawing imported as a custom logo emblem). */
  emblem?: string;
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

/** 90s WordArt on the wordmark (spec §7). */
function textEffect(effect: LogoEffect | undefined, ink: string, accent: string, size: number): CSSProperties {
  const px = Math.max(1, Math.round(size / 16));
  switch (effect) {
    case 'dropShadow':
      return { textShadow: `${px * 2}px ${px * 2}px 0 rgba(0, 0, 0, 0.4)` };
    case 'bevel':
      return { textShadow: `-${px}px -${px}px 0 rgba(255, 255, 255, 0.8), ${px}px ${px}px 0 rgba(0, 0, 0, 0.55)` };
    case 'gradient':
      return {
        backgroundImage: `linear-gradient(180deg, ${accent} 15%, ${ink} 85%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      };
    case 'outline':
      return { WebkitTextStroke: `${px}px ${accent}`, paintOrder: 'stroke fill' };
    default:
      return {};
  }
}

/** The emblem: container and motif (or monogram letters), with the effect drawn in SVG. x and y place it in an SVG. */
export function Emblem({ spec, name, height, x: left, y: top }: { spec: LogoSpec; name: string; height: number; x?: number; y?: number }) {
  const id = useId().replace(/:/g, '');
  const [main, accent] = spec.palette.colors;
  const shape = spec.shape === 'none' ? (spec.layout === 'monogram' ? SHAPES.circle : undefined) : SHAPES[spec.shape];
  const Motif = MOTIF_ICONS[spec.motif];
  const [x, y, size] = shape?.motif ?? [4, 4, 92];
  const letters = monogram(name);
  const effect = spec.effect ?? 'none';
  const fill = effect === 'gradient' && shape ? `url(#${id}g)` : main;
  const filter = effect === 'dropShadow' || effect === 'bevel' ? `url(#${id}f)` : undefined;
  return (
    <svg className="logo-emblem" x={left} y={top} width={height} height={height} viewBox={effect === 'none' ? '0 0 100 100' : '-5 -5 110 110'} aria-hidden="true">
      <defs>
        {effect === 'gradient' && (
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} />
            <stop offset="0.6" stopColor={main} />
          </linearGradient>
        )}
        {effect === 'dropShadow' && (
          <filter id={`${id}f`}>
            <feDropShadow dx="5" dy="5" stdDeviation="0" floodOpacity="0.4" />
          </filter>
        )}
        {effect === 'bevel' && (
          <filter id={`${id}f`}>
            <feDropShadow dx="-3" dy="-3" stdDeviation="0" floodColor="#fff" floodOpacity="0.7" />
            <feDropShadow dx="3" dy="3" stdDeviation="0" floodOpacity="0.5" />
          </filter>
        )}
      </defs>
      <g filter={filter} stroke={effect === 'outline' ? accent : undefined} strokeWidth={effect === 'outline' ? 4 : undefined}>
        {shape?.draw(fill)}
        {spec.layout === 'monogram' ? (
          <text x="50" y="50" dy="0.35em" textAnchor="middle" fill={accent} stroke="none" fontSize={letters.length > 2 ? 30 : 40} style={LOGO_FONT_STYLES[spec.font]}>
            {letters}
          </text>
        ) : (
          <g stroke="none">
            {spec.emblem ? <PixelArt pixels={spec.emblem} x={x} y={y} size={size} transparent /> : <Motif x={x} y={y} size={size} color={shape ? accent : main} />}
          </g>
        )}
      </g>
    </svg>
  );
}

/**
 * A logo (spec §7): emblem and wordmark laid out as the spec's five layouts. Every logo in the game, company or firm,
 * draws through here. `height` is the emblem's size in pixels.
 */
export function Logo({ spec, name, height = 48, showName = true }: { spec: LogoSpec; name: string; height?: number; showName?: boolean }) {
  const [main, accent, background] = spec.palette.colors;
  const font = LOGO_FONT_STYLES[spec.font];
  const wordmark = (size: number, colour = inkColour(spec.palette)) =>
    showName && (
      <span className="logo-wordmark" style={{ ...font, color: colour, fontSize: size, ...textEffect(spec.effect, colour, accent, size) }}>
        {name}
      </span>
    );
  const logo = (() => {
    switch (spec.layout) {
      case 'textOnly':
        return (
          <span className="logo logo-text-only" style={{ borderBottomColor: accent }}>
            {wordmark(height * 0.6) || monogram(name)}
          </span>
        );
      case 'textInside':
        return (
          <span
            className={`logo logo-text-inside logo-shape-${spec.shape}`}
            style={{ background: main, ...font, color: accent, fontSize: height * 0.45, ...textEffect(spec.effect, accent, main, height * 0.45) }}
          >
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
  })();
  return background ? (
    <span className="logo-panel" style={{ background }}>
      {logo}
    </span>
  ) : (
    logo
  );
}
