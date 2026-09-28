import { useId, type ReactNode } from 'react';
import type { PortraitVariant } from '../../sim/data/countries';
import { VariantPortrait } from './variants';
import { colourHex } from '../../world/bitcode';
import { ceoAge, type Ceo } from '../../world/ceo';
import { TOP100 } from '../../world/top100';
import { darken, lighten, mix } from '../colour';
import { Emblem, luminance, type LogoSpec } from '../logo/Logo';
import { PALETTES } from '../logo/options';
import {
  ACCESSORIES, BACKGROUNDS, CLOTHING, CLOTHING_COLOURS, CLOTHING_HEX, EYEBROWS, EYES, FACE_SHAPES, FACIAL_HAIR,
  HAIR_COLOURS, HAIR_HEX, HAIR_STYLES, MOUTHS, NOSES, SKIN_TONES, UNDERTONES,
} from './options';
import {
  BOW_TIE, BROWS, COLLAR, EYE_PARTS, FACES, FACIAL, HAIR, LAPEL, MOUTH_PARTS, NECK, NOSE_PARTS, OUTFITS, PADDED,
  SHIRT_V, TIE, TORSO, TURTLENECK,
} from './parts';

const INK = '#2b1d16';
const TINTS = { neutral: undefined, warm: ['#e0782a', 0.1], cool: ['#c0609a', 0.08], olive: ['#80843a', 0.12] } as const;
const SHIRTS = { white: '#f6f6f6', cream: '#f1e7cc', light: '#dbe6f2' };
const MIRROR = 'translate(120 0) scale(-1 1)';

/** The Rhodesia Tobacco Company's logo, which every cigar band, cigarette and pack carries (spec §8). */
const RTC = (() => {
  const logo = TOP100.find((c) => c.ticker === 'RTC')!.logo!;
  return { ...logo, palette: PALETTES.find((p) => p.id === logo.palette)! } as LogoSpec;
})();
const RtcLogo = ({ x, y, size }: { x: number; y: number; size: number }) => (
  <Emblem spec={RTC} name="Rhodesia Tobacco Company" height={size} x={x} y={y} />
);

/** Colours of a CEO's portrait, from palette choices or custom colours. */
export function portraitColours(ceo: Ceo) {
  const tint = TINTS[UNDERTONES[ceo.undertone]];
  const base = SKIN_TONES[ceo.skinTone];
  const skin = ceo.customSkin !== undefined ? colourHex(ceo.customSkin) : tint ? mix(base, tint[0], tint[1]) : base;
  const hairName = HAIR_COLOURS[ceo.hairColour];
  const hair = ceo.customHair !== undefined ? colourHex(ceo.customHair) : HAIR_HEX[hairName];
  const [top, bottom] =
    ceo.customBackground !== undefined
      ? [lighten(colourHex(ceo.customBackground), 0.35), colourHex(ceo.customBackground)]
      : BACKGROUNDS[ceo.background];
  return {
    skin,
    hair,
    // People dye their hair, not their eyebrows.
    brows: ceo.customHair === undefined && hairName.startsWith('dyed') ? '#3b2616' : darken(hair, 0.15),
    clothing: ceo.customClothing !== undefined ? colourHex(ceo.customClothing) : CLOTHING_HEX[CLOTHING_COLOURS[ceo.clothingColour]],
    background: [top, bottom] as const,
  };
}

/**
 * A CEO's portrait (spec §8): head and upper chest, front-facing, flat 90s clip art built from layered SVG parts.
 * `size` is the width in pixels; the photo is 4:5.
 */
export function Portrait({ ceo, size = 120, title, variant }: { ceo: Ceo; size?: number; title?: string; variant?: PortraitVariant }) {
  // The fun modules' faces (spec §16C): a penguin, a goat, a silhouette, or a face behind the censor's blur.
  if (variant && variant !== 'blur') return <VariantPortrait variant={variant} size={size} title={title} />;
  if (variant === 'blur') {
    return (
      <span className="portrait-censored" title={title}>
        <Portrait ceo={ceo} size={size} title="Censored" />
      </span>
    );
  }
  return <Face ceo={ceo} size={size} title={title} />;
}

function Face({ ceo, size = 120, title }: { ceo: Ceo; size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  const c = portraitColours(ceo);
  const face = FACES[FACE_SHAPES[ceo.faceShape]];
  const m = face.chin - 12; // the mouth
  const shade = darken(c.skin, 0.16);
  const line = darken(c.skin, 0.4);
  const hair = HAIR[HAIR_STYLES[ceo.hair]];
  const beard = FACIAL[FACIAL_HAIR[ceo.facialHair]];
  const outfit = OUTFITS[CLOTHING[ceo.clothing]];
  const eye = EYE_PARTS[EYES[ceo.eyes]];
  const brow = BROWS[EYEBROWS[ceo.eyebrows]];
  const nose = NOSE_PARTS[NOSES[ceo.nose]];
  const mouth = MOUTH_PARTS[MOUTHS[ceo.mouth]](m);
  const accessory = ACCESSORIES[ceo.accessory];
  const age = ceoAge(ceo);
  const coat = outfit.whiteCoat ? '#f4f4f2' : c.clothing;
  const shirt = outfit.shirt ? SHIRTS[outfit.shirt] : coat;
  const tie = outfit.whiteCoat ? c.clothing : luminance(coat) < 0.12 || outfit.torso ? '#a3202e' : darken(coat, 0.45);
  const lips = mix(c.skin, '#a8434f', 0.35);
  const ear = (side: number) => 60 + side * (face.half + 1);
  const ref = (name: string) => `url(#${id}${name})`;

  return (
    <svg className="portrait" viewBox="0 0 120 150" width={size} height={size * 1.25} role="img" aria-label={title ?? 'Portrait'}>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.background[0]} />
          <stop offset="1" stopColor={c.background[1]} />
        </linearGradient>
        <clipPath id={`${id}face`}>
          <path d={face.path} />
        </clipPath>
        <clipPath id={`${id}neck`}>
          <path d={NECK} />
        </clipPath>
        <clipPath id={`${id}jaw`}>
          <rect x="0" y="62" width="120" height="60" />
        </clipPath>
        {outfit.pattern === 'plaid' && (
          <pattern id={`${id}cloth`} width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill={coat} />
            <rect y="4" width="12" height="3.5" fill={darken(coat, 0.4)} opacity="0.6" />
            <rect x="4" width="3.5" height="12" fill={darken(coat, 0.4)} opacity="0.6" />
            <path d="M0 10.5H12M10.5 0V12" stroke={lighten(coat, 0.5)} strokeWidth="0.6" />
          </pattern>
        )}
        {outfit.pattern === 'flowers' && (
          <pattern id={`${id}cloth`} width="22" height="22" patternUnits="userSpaceOnUse">
            <rect width="22" height="22" fill={coat} />
            <ellipse cx="16" cy="17" rx="4" ry="1.6" fill="#2e7d3a" transform="rotate(-30 16 17)" />
            {[0, 72, 144, 216, 288].map((a) => (
              <circle key={a} cx={7 + 2.6 * Math.cos((a * Math.PI) / 180)} cy={7 + 2.6 * Math.sin((a * Math.PI) / 180)} r="2" fill={lighten(coat, 0.75)} />
            ))}
            <circle cx="7" cy="7" r="1.1" fill="#f2c200" />
          </pattern>
        )}
      </defs>

      <rect width="120" height="150" fill={ref('bg')} />

      {/* Hair behind the head */}
      {hair.back && <path d={hair.back} fill={c.hair} stroke={INK} strokeWidth="0.9" />}

      {/* Neck, with the chin's shadow */}
      <path d={NECK} fill={c.skin} stroke={INK} strokeWidth="0.9" />
      <ellipse cx="60" cy={face.chin + 1} rx="13" ry="6" fill={shade} clipPath={ref('neck')} />

      {/* Clothes */}
      <path d={outfit.padded ? PADDED : TORSO} fill={outfit.torso ? shirt : outfit.pattern ? ref('cloth') : coat} stroke={INK} strokeWidth="0.9" />
      {outfit.shirt && !outfit.torso && <path d={SHIRT_V} fill={shirt} stroke={INK} strokeWidth="0.6" />}
      {outfit.garment && <path d={outfit.garment} fill={outfit.pattern ? ref('cloth') : coat} stroke={INK} strokeWidth="0.8" />}
      {outfit.darker && <path d={outfit.darker} fill={darken(coat, 0.25)} stroke={INK} strokeWidth="0.6" />}
      {outfit.lighter && <path d={outfit.lighter} fill={lighten(coat, 0.75)} stroke={INK} strokeWidth="0.5" />}
      {outfit.tie && <path d={TIE} fill={tie} stroke={INK} strokeWidth="0.6" />}
      {outfit.lapels && (
        <>
          <path d={LAPEL} fill={darken(coat, CLOTHING[ceo.clothing] === 'tuxedo' ? 0.35 : 0.12)} stroke={INK} strokeWidth="0.7" />
          <path d={LAPEL} fill={darken(coat, CLOTHING[ceo.clothing] === 'tuxedo' ? 0.35 : 0.12)} stroke={INK} strokeWidth="0.7" transform={MIRROR} />
        </>
      )}
      {outfit.shirt && !outfit.torso && (
        <>
          <path d={COLLAR} fill={shirt} stroke={INK} strokeWidth="0.6" />
          <path d={COLLAR} fill={shirt} stroke={INK} strokeWidth="0.6" transform={MIRROR} />
        </>
      )}
      {outfit.bowTie && <path d={BOW_TIE} fill="#161616" stroke={INK} strokeWidth="0.5" />}
      {outfit.turtleneck && <path d={TURTLENECK} fill={coat} stroke={INK} strokeWidth="0.9" />}
      {outfit.lines && <path d={outfit.lines} fill="none" stroke={darken(coat, 0.45)} strokeWidth="0.9" strokeLinecap="round" />}
      {outfit.buttons?.map(([x, y]) => <circle key={y} cx={x} cy={y} r="1.3" fill={darken(coat, 0.5)} />)}

      {/* Accessories worn on the chest */}
      {accessory === 'pearlNecklace' &&
        Array.from({ length: 13 }, (_, i) => {
          const t = i / 12;
          const x = 49 + 22 * t;
          const y = (1 - t) ** 2 * 98 + 2 * t * (1 - t) * 116 + t ** 2 * 98;
          return <circle key={i} cx={x} cy={y} r="1.5" fill="#f5f1e6" stroke="#a9a49a" strokeWidth="0.4" />;
        })}
      {accessory === 'bowTieClip' && <path d={BOW_TIE} fill="#a3202e" stroke={INK} strokeWidth="0.5" />}
      {accessory === 'lapelPin' && (
        <>
          <circle cx="81" cy="115" r="2.3" fill="#d4af37" stroke={INK} strokeWidth="0.5" />
          <circle cx="81" cy="115" r="1" fill="#1f2d57" />
        </>
      )}
      {accessory === 'cigarettePack' && (
        <>
          <rect x="75" y="107" width="11" height="15" fill="#1f4d2b" stroke={INK} strokeWidth="0.5" />
          <rect x="75" y="107" width="11" height="2" fill="#d4af37" />
          <RtcLogo x={76.5} y={109.5} size={8} />
          <path d="M73 116H88V127H73Z" fill={outfit.torso ? shirt : darken(coat, 0.08)} stroke={INK} strokeWidth="0.6" />
        </>
      )}

      {/* Long hair over the shoulders */}
      {hair.drape && <path d={hair.drape} fill={c.hair} stroke={INK} strokeWidth="0.8" />}

      {/* Ears and face */}
      {[-1, 1].map((side) => (
        <g key={side}>
          <ellipse cx={ear(side)} cy="60" rx="4.2" ry="6.8" fill={c.skin} stroke={INK} strokeWidth="0.9" />
          <path d={`M${ear(side) + side * 1.2} 56Q${ear(side) + side * 2.6} 60 ${ear(side) + side * 0.8} 64`} fill="none" stroke={shade} strokeWidth="1" />
        </g>
      ))}
      <path d={face.path} fill={c.skin} stroke={INK} strokeWidth="0.9" />
      <ellipse cx="48" cy={m - 5} rx="4" ry="2.4" fill="#e0707a" opacity="0.12" />
      <ellipse cx="72" cy={m - 5} rx="4" ry="2.4" fill="#e0707a" opacity="0.12" />

      {/* Age */}
      {age >= 50 && (
        <g fill="none" stroke={line} strokeWidth="0.6" opacity="0.45">
          <path d="M51 44Q60 42.6 69 44" />
          {age >= 56 && <path d="M53 47Q60 46 67 47" />}
          <path d={`M52.5 ${m - 7}Q50.5 ${m - 3} 52.5 ${m + 1}M67.5 ${m - 7}Q69.5 ${m - 3} 67.5 ${m + 1}`} />
        </g>
      )}

      {/* Beards */}
      {beard.face && (
        <g clipPath={ref('face')}>
          <path d={beard.face} fill={c.hair} opacity={beard.stubble ? 0.3 : 1} />
        </g>
      )}
      {beard.strap && <path d={face.path} fill="none" stroke={c.hair} strokeWidth="5" clipPath={ref('jaw')} />}

      {/* Eyes and eyebrows */}
      {[false, true].map((mirrored) => (
        <g key={String(mirrored)} transform={mirrored ? MIRROR : undefined}>
          {eye.white && <ellipse cx="51" cy="57" rx={eye.white[0]} ry={eye.white[1]} fill="#fff" stroke={INK} strokeWidth="0.6" />}
          {eye.iris && (
            <>
              <circle cx="51" cy="57" r={eye.iris} fill="#3b2a1e" />
              <circle cx="51.6" cy="56.4" r="0.5" fill="#fff" />
            </>
          )}
          {eye.lines && <path d={eye.lines} fill="none" stroke={INK} strokeWidth="0.9" strokeLinecap="round" />}
          {!(EYEBROWS[ceo.eyebrows] === 'unibrow' && mirrored) && (
            <path
              d={brow.path}
              fill={brow.fill ? c.brows : 'none'}
              stroke={c.brows}
              strokeWidth={brow.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      ))}

      {/* Nose and mouth */}
      {nose.tip && <ellipse cx={nose.tip[0]} cy={nose.tip[1]} rx={nose.tip[2]} ry={nose.tip[3]} fill={shade} />}
      <path d={nose.path} fill="none" stroke={line} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
      {nose.nostrils && (
        <>
          <ellipse cx="58.4" cy="65.2" rx="0.8" ry="0.5" fill={line} />
          <ellipse cx="61.6" cy="65.2" rx="0.8" ry="0.5" fill={line} />
        </>
      )}
      {mouth.open && <path d={mouth.open} fill="#5a1a1e" stroke={INK} strokeWidth="0.7" />}
      {mouth.teeth && <path d={mouth.teeth} fill="#fbfbf4" stroke={INK} strokeWidth="0.7" />}
      {mouth.teeth && !mouth.open && <path d={`M52 ${m - 1.4}Q60 ${m + 1.8} 68 ${m - 1.4}`} fill="none" stroke="#bdb8a8" strokeWidth="0.4" />}
      {mouth.gap && <rect x="59.4" y={m - 1.2} width="1.2" height="3.4" fill="#5a1a1e" />}
      {mouth.gold && <rect x="62" y={m - 0.8} width="2.4" height="2.6" fill="#e0b52c" stroke="#8a6a10" strokeWidth="0.3" />}
      {mouth.pout && <ellipse cx="60" cy={m + 1} rx="4.2" ry="2.8" fill={lips} stroke={INK} strokeWidth="0.5" />}
      {mouth.line && <path d={mouth.line} fill="none" stroke={INK} strokeWidth={mouth.width ?? 1.1} strokeLinecap="round" />}
      {mouth.lip && <path d={mouth.lip} fill="none" stroke={lips} strokeWidth="1.3" strokeLinecap="round" />}

      {/* Moustaches and chin tufts */}
      {beard.over && <path d={beard.over(m, face.chin)} fill={c.hair} stroke={darken(c.hair, 0.3)} strokeWidth="0.4" />}

      {/* Hair over the forehead */}
      {hair.shaved && <path d={hair.shaved} fill={c.hair} opacity="0.35" clipPath={ref('face')} />}
      {hair.front && <path d={hair.front} fill={c.hair} stroke={INK} strokeWidth="0.9" />}
      {hair.detail && <path d={hair.detail} fill="none" stroke={darken(c.hair, 0.3)} strokeWidth="1" strokeLinecap="round" />}
      {hair.tips && <path d={hair.tips} fill="#f6e7a0" />}
      {HAIR_STYLES[ceo.hair] === 'bald' && <ellipse cx="52" cy="37" rx="5" ry="2.6" fill="#fff" opacity="0.3" />}

      {/* Accessories on the face */}
      {accessory === 'roundGlasses' && (
        <Glasses half={face.half}>
          <circle cx="51" cy="57" r="5" />
        </Glasses>
      )}
      {accessory === 'squareGlasses' && (
        <Glasses half={face.half}>
          <rect x="45.5" y="53" width="11" height="8" rx="1.5" />
        </Glasses>
      )}
      {accessory === 'halfMoonGlasses' && (
        <Glasses half={face.half} colour="#8a6a2a" bridge="M56.5 60.5Q60 59 63.5 60.5" temple={59.5}>
          <path d="M45.5 59.5H56.5A5.5 4.5 0 0 1 45.5 59.5Z" />
        </Glasses>
      )}
      {accessory === 'aviators' && (
        <Glasses half={face.half} colour="#b8932f" lens="rgba(50, 70, 60, 0.6)" bridge="M44.5 53.4H75.5">
          <path d="M44.6 54Q51 52 56.4 54Q57.4 60 52 63.2Q45.6 63.4 44.6 57Z" />
        </Glasses>
      )}
      {accessory === 'monocle' && (
        <g fill="none" stroke="#b8932f">
          <circle cx="69" cy="57" r="5.5" strokeWidth="1.3" fill="rgba(255, 255, 255, 0.18)" />
          <path d="M74 59Q82 80 77 104" strokeWidth="0.5" />
        </g>
      )}
      {accessory === 'earring' && <circle cx={ear(1)} cy="68.5" r="2" fill="none" stroke="#d4af37" strokeWidth="1" />}
      {accessory === 'earpiece' && (
        <g>
          <path d={`M${ear(-1)} 62Q${ear(-1) - 5} 82 ${ear(-1) + 3} 100`} fill="none" stroke="#333" strokeWidth="0.7" />
          <circle cx={ear(-1)} cy="60.5" r="1.8" fill="#333" />
        </g>
      )}
      {accessory === 'phoneHeadset' && (
        <g fill="none" stroke="#2a2a2a">
          <path d={`M${ear(-1) - 1} 58C${ear(-1) - 2} 16 ${ear(1) + 2} 16 ${ear(1) + 1} 58`} strokeWidth="2.4" />
          <path d={`M${ear(-1)} 64Q${ear(-1) + 2} ${m + 2} 52 ${m + 1}`} strokeWidth="1.2" />
          <rect x={ear(-1) - 3.5} y="55" width="7" height="10" rx="2" fill="#2a2a2a" />
          <rect x={ear(1) - 3.5} y="55" width="7" height="10" rx="2" fill="#2a2a2a" />
          <ellipse cx="51" cy={m + 1} rx="1.8" ry="1.3" fill="#2a2a2a" />
        </g>
      )}
      {accessory === 'pipe' && (
        <g stroke={INK} strokeWidth="0.6">
          <path d={`M66 ${m + 0.5}L79 ${m + 5}`} stroke="#3a2414" strokeWidth="2" strokeLinecap="round" />
          <path d={`M77 ${m - 4}H86V${m + 5}Q86 ${m + 9} 81.5 ${m + 9}Q77 ${m + 9} 77 ${m + 5}Z`} fill="#6b3f1f" />
          <ellipse cx="81.5" cy={m - 4} rx="4.5" ry="1.2" fill="#2a1a10" />
          <path d={`M82 ${m - 6}Q79 ${m - 11} 83 ${m - 15}Q87 ${m - 19} 84 ${m - 24}`} fill="none" stroke="#d8d8d8" strokeWidth="1" opacity="0.8" />
        </g>
      )}
      {accessory === 'cigar' && (
        <g>
          <path d={`M66 ${m + 0.5}L87 ${m + 4.5}`} stroke="#7a4a26" strokeWidth="4.4" strokeLinecap="round" />
          <path d={`M86 ${m + 4.3}L88.6 ${m + 4.8}`} stroke="#9a9a9a" strokeWidth="4.2" />
          <path d={`M70.5 ${m + 1.3}L74.5 ${m + 2.1}`} stroke="#1f4d2b" strokeWidth="4.6" />
          <RtcLogo x={70.5} y={m - 0.6} size={4} />
          <path d={`M89 ${m + 2}Q86 ${m - 3} 90 ${m - 8}Q94 ${m - 13} 91 ${m - 18}`} fill="none" stroke="#d8d8d8" strokeWidth="1" opacity="0.8" />
        </g>
      )}
      {accessory === 'cigarette' && (
        <g>
          <path d={`M66 ${m + 0.5}L85 ${m + 2.5}`} stroke="#f7f7f2" strokeWidth="2.2" />
          <path d={`M66 ${m + 0.5}L71 ${m + 1}`} stroke="#d99a4e" strokeWidth="2.3" />
          <RtcLogo x={71.4} y={m - 0.3} size={2.6} />
          <path d={`M85 ${m + 2.5}L86.4 ${m + 2.7}`} stroke="#e5502a" strokeWidth="2.2" />
          <path d={`M87 ${m + 1}Q84 ${m - 4} 88 ${m - 9}Q92 ${m - 14} 89 ${m - 19}`} fill="none" stroke="#d8d8d8" strokeWidth="0.8" opacity="0.8" />
        </g>
      )}
    </svg>
  );
}

/** A pair of glasses: one lens shape (for the left eye; mirrored), a bridge and temples to the ears. */
function Glasses(props: { half: number; children: ReactNode; colour?: string; lens?: string; bridge?: string; temple?: number }) {
  const { half, colour = '#1e1e1e', lens = 'rgba(255, 255, 255, 0.18)', bridge = 'M56 56.5Q60 55 64 56.5', temple = 56 } = props;
  return (
    <g fill={lens} stroke={colour} strokeWidth="1.1">
      {props.children}
      <g transform={MIRROR}>{props.children}</g>
      <path d={`${bridge}M46 ${temple}L${60 - half - 1} ${temple - 1}M74 ${temple}L${60 + half + 1} ${temple - 1}`} fill="none" />
    </g>
  );
}
