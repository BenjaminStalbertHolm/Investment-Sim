import type { PortraitVariant } from '../../sim/data/countries';
import type { Ceo } from '../../world/ceo';
import { mix } from '../colour';
import { EYES, HAIR_STYLES } from './options';
import { portraitColours } from './Portrait';

/**
 * The Geopolitics and gags modules' portraits (spec §16C.1, §16C.3): Antarctica's penguin emperor, the Swiss president
 * nobody can name, the censor blur, and the goat. Drawn in the portraits' 120×150 frame, flat 90s clip art like the rest.
 */
export function VariantPortrait({ variant, size = 120, title }: { variant: Exclude<PortraitVariant, 'blur'>; size?: number; title?: string }) {
  return (
    <svg className="portrait" viewBox="0 0 120 150" width={size} height={size * 1.25} role="img" aria-label={title ?? 'Portrait'}>
      <rect width="120" height="150" fill={variant === 'penguin' ? '#bfe0f0' : variant === 'goat' ? '#d9c29a' : '#c9c9c9'} />
      {variant === 'penguin' && (
        <>
          <ellipse cx="60" cy="112" rx="40" ry="46" fill="#1a1a1a" />
          <ellipse cx="60" cy="118" rx="27" ry="36" fill="#f6f6f6" />
          <circle cx="60" cy="52" r="26" fill="#1a1a1a" />
          <ellipse cx="60" cy="60" rx="15" ry="13" fill="#f6f6f6" />
          <circle cx="52" cy="48" r="4" fill="#fff" />
          <circle cx="68" cy="48" r="4" fill="#fff" />
          <circle cx="53" cy="49" r="2" fill="#000" />
          <circle cx="67" cy="49" r="2" fill="#000" />
          <path d="M53 58l7 8 7-8z" fill="#f0a020" />
          {/* An emperor wears a crown. */}
          <path d="M44 30l5-12 6 9 5-11 5 11 6-9 5 12z" fill="#e8c030" stroke="#a07810" />
        </>
      )}
      {variant === 'goat' && (
        <>
          <path d="M20 150c4-26 20-38 40-38s36 12 40 38z" fill="#2a3a5a" />
          <path d="M52 118l8 14 8-14z" fill="#fff" />
          <path d="M58 122l2 20 2-20z" fill="#a3202e" />
          <path d="M34 36q-10-18 4-26 0 12 10 20zM86 36q10-18-4-26 0 12-10 20z" fill="#8a7a60" />
          <ellipse cx="60" cy="62" rx="24" ry="32" fill="#efe8dc" />
          <path d="M36 50q-14 2-18 10 12 2 20-2zM84 50q14 2 18 10-12 2-20-2z" fill="#e3d8c4" />
          <ellipse cx="50" cy="56" rx="4" ry="3" fill="#c8a040" />
          <ellipse cx="70" cy="56" rx="4" ry="3" fill="#c8a040" />
          <rect x="47" y="55" width="6" height="2" fill="#000" />
          <rect x="67" y="55" width="6" height="2" fill="#000" />
          <ellipse cx="60" cy="82" rx="10" ry="8" fill="#d8c8b0" />
          <path d="M56 80h2M62 80h2" stroke="#604030" strokeWidth="2" />
          <path d="M54 94q6 20 12 0z" fill="#efe8dc" />
        </>
      )}
      {variant === 'silhouette' && (
        <>
          <path d="M18 150c4-30 20-44 42-44s38 14 42 44z" fill="#6a6a6a" />
          <ellipse cx="60" cy="62" rx="24" ry="30" fill="#6a6a6a" />
          <text x="60" y="68" textAnchor="middle" fontSize="28" fill="#c9c9c9" fontFamily="Arial, sans-serif">?</text>
        </>
      )}
    </svg>
  );
}

/**
 * The chief executive after a hard market (spec §16C.3: the portrait greys and the hairline recedes during drawdowns,
 * recovering slowly in good years): older, greyer and more tired the more stress.
 */
export function agedCeo(ceo: Ceo, stress: number): Ceo {
  if (stress < 0.05) return ceo;
  const out: Ceo = { ...ceo, ceoAge: Math.min(31, ceo.ceoAge + Math.round(stress * 16)) };
  const grey = mix(portraitColours(ceo).hair, '#a9a9a9', Math.min(1, stress * 1.3));
  out.customHair = parseInt(grey.slice(1), 16);
  const style = HAIR_STYLES[ceo.hair];
  if (stress > 0.5 && !['bald', 'shaved', 'receding', 'buzzCut'].includes(style)) out.hair = HAIR_STYLES.indexOf('receding');
  if (stress > 0.35) out.eyes = EYES.indexOf('tired');
  return out;
}
