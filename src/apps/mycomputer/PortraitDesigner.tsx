import { useState, type ReactNode } from 'react';
import {
  ACCESSORIES, BACKGROUNDS, CLOTHING, CLOTHING_COLOURS, EYEBROWS, EYES, FACE_SHAPES, FACIAL_HAIR, HAIR_COLOURS,
  HAIR_STYLES, MOUTHS, NOSES, SKIN_TONES, UNDERTONES,
} from '../../art/portrait/options';
import { Portrait, portraitColours } from '../../art/portrait/Portrait';
import { colourBits } from '../../world/bitcode';
import {
  CUSTOM_COLOUR, FEATURES, ceoAge, ceoName, decodeCeo, encodeCeo, randomCeo, randomiseFeature, type Ceo, type Feature,
} from '../../world/ceo';
import { CodeField, Picker, label, useDesignerRng } from './designer';

const tones = (n: number, name: string) => Array.from({ length: n }, (_, i) => `${name} ${i + 1}`);

/** Each feature's options as the designer lists them. */
const OPTIONS: Record<Feature, readonly string[]> = {
  faceShape: FACE_SHAPES,
  skinTone: tones(SKIN_TONES.length, 'Tone'),
  undertone: UNDERTONES,
  hair: HAIR_STYLES,
  hairColour: HAIR_COLOURS,
  eyebrows: EYEBROWS,
  eyes: EYES,
  nose: NOSES,
  mouth: MOUTHS,
  facialHair: FACIAL_HAIR,
  accessory: ACCESSORIES,
  clothing: CLOTHING,
  clothingColour: CLOTHING_COLOURS,
  background: tones(BACKGROUNDS.length, 'Backdrop'),
};

const NAMES: Record<string, string> = {
  faceShape: 'Face', skinTone: 'Skin tone', hairColour: 'Hair colour', facialHair: 'Facial hair', clothingColour: 'Colour',
  aquiline: 'Hawk (aquiline)', snub: 'Snub (upturned)', crooked: 'Crooked (boxer)', toothbrushMoustache: 'Toothbrush (Chaplin)',
  suitAndTie: 'Suit & tie', threePiece: 'Three-piece', powerSuit: 'Power suit', tuxedo: 'Tuxedo & bow tie',
  fleeceVest: 'Fleece vest', suspenders: 'Suspenders', hawaiian: 'Hawaiian shirt', flannel: 'Flannel shirt',
  cigarettePack: 'Cigarette pack', bowTieClip: 'Bow tie clip', phoneHeadset: 'Phone headset', curtains: "Curtains ('90s)",
  frostedTips: "Frosted tips ('90s)", closedSmile: 'Closed smile',
};
const name = (id: string) => NAMES[id] ?? label(id);

/** Features whose palette colour can be replaced by a custom one. */
const CUSTOMISABLE: Partial<Record<Feature, 'skin' | 'hair' | 'clothing' | 'background'>> = {
  skinTone: 'skin', hairColour: 'hair', clothingColour: 'clothing', background: 'background',
};

/**
 * The CEO Portrait Designer (spec §8): every option, custom colours, Randomise, Randomise one feature and Undo.
 * Its output is a CEO code. `preview` (the live ID badge) sits beside the photo.
 */
export function PortraitDesigner(props: {
  name: string;
  onName(name: string): void;
  value: Ceo;
  onChange(ceo: Ceo): void;
  preview?: ReactNode;
}) {
  const { value } = props;
  const rng = useDesignerRng('portrait');
  const [history, setHistory] = useState<Ceo[]>([]);
  const change = (next: Ceo) => {
    setHistory((h) => [...h.slice(-49), value]);
    props.onChange(next);
  };
  const colours = portraitColours(value);
  const hex = { skin: colours.skin, hair: colours.hair, clothing: colours.clothing, background: colours.background[1] };

  return (
    <div className="designer portrait-designer">
      <div className="designer-controls">
        <div className="field-row picker">
          <label htmlFor="ceo-name">CEO name:</label>
          <input id="ceo-name" value={props.name} maxLength={40} onChange={(e) => props.onName(e.target.value)} />
          <button title="Pick a random name" onClick={() => props.onName(ceoName(randomCeo(rng())))}>
            Random name
          </button>
        </div>
        <div className="field-row picker">
          <label htmlFor="ceo-age">Age:</label>
          <input
            id="ceo-age"
            type="number"
            min={32}
            max={63}
            value={ceoAge(value)}
            onChange={(e) => {
              const age = Math.round(Number(e.target.value));
              if (age >= 32 && age <= 63) change({ ...value, ceoAge: age - 32 });
            }}
          />
        </div>
        {FEATURES.map((feature) => {
          const custom = CUSTOMISABLE[feature];
          const field = CUSTOM_COLOUR[feature as keyof typeof CUSTOM_COLOUR];
          return (
            <div key={feature} className="feature-row">
              <Picker
                label={name(feature)}
                options={OPTIONS[feature]}
                names={Object.fromEntries(OPTIONS[feature].map((o) => [o, name(o)]))}
                value={OPTIONS[feature][value[feature]]}
                onChange={(o) => {
                  const next = { ...value, [feature]: OPTIONS[feature].indexOf(o) };
                  if (field) delete next[field];
                  change(next);
                }}
              />
              {custom && (
                <input
                  type="color"
                  title={`Custom ${custom} colour`}
                  aria-label={`Custom ${custom} colour`}
                  value={hex[custom]}
                  onChange={(e) => change({ ...value, [field!]: colourBits(e.target.value) })}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="designer-preview">
        <div className="portrait-preview">
          <div className="portrait-frame">
            <Portrait ceo={value} size={props.preview ? 140 : 180} title={props.name} />
          </div>
          {props.preview}
        </div>
        <div className="button-row">
          <button onClick={() => change({ ...randomCeo(rng()), ceoFirstName: value.ceoFirstName, ceoLastName: value.ceoLastName })}>
            Randomise
          </button>
          <button onClick={() => change(randomiseFeature(rng(), value, rng().pick(FEATURES)))}>Randomise one feature</button>
          <button
            disabled={!history.length}
            onClick={() => {
              props.onChange(history.at(-1)!);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            Undo
          </button>
        </div>
        <CodeField
          label="CEO code"
          code={encodeCeo(value)}
          decode={decodeCeo}
          onApply={(ceo) => {
            change(ceo);
            props.onName(ceoName(ceo));
          }}
        />
      </div>
    </div>
  );
}
