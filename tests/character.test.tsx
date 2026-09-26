// @vitest-environment happy-dom
import fc from 'fast-check';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { difficultyLabel, type SetupOptions } from '../src/apps/mycomputer/AdvancedSettings';
import { Badge, Barcode } from '../src/art/badge/Badge';
import { DEFAULT_LOGO, LOGO_FIELDS, decodeLogo, encodeLogo } from '../src/art/logo/code';
import { companyLogo, type LogoSpec } from '../src/art/logo/Logo';
import { LOGO_EFFECTS, LOGO_FONTS, LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES } from '../src/art/logo/options';
import * as O from '../src/art/portrait/options';
import { Portrait, portraitColours } from '../src/art/portrait/Portrait';
import { START_DAY, formatDate, setStartYear } from '../src/sim/calendar';
import { DIFFICULTIES, changeSettings, completeSettings, difficultyOf } from '../src/sim/settings';
import { packCode } from '../src/world/bitcode';
import {
  CEO_FIELDS, FEATURES, companyCeo, decodeCeo, encodeCeo, randomCeo, randomiseFeature, type Ceo,
} from '../src/world/ceo';
import { generateWorld, type World } from '../src/world/generator';
import { GENOME_FIELDS } from '../src/world/genome';
import { PRESET_FIRMS, playerFirmName, presetLogo } from '../src/world/presetFirms';
import { Rng } from '../src/world/rng';

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'characters', companyCount: 1000 });
});

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const bits = (code: string) => [...code].map((c) => ALPHABET.indexOf(c).toString(2).padStart(6, '0')).join('');
const colour = fc.integer({ min: 0, max: 0xffffff });
const index = (list: readonly unknown[]) => fc.integer({ min: 0, max: list.length - 1 });

const ceoArbitrary: fc.Arbitrary<Ceo> = fc.record(
  {
    ceoFirstName: fc.integer({ min: 0, max: 511 }), ceoLastName: fc.integer({ min: 0, max: 1023 }), ceoAge: fc.integer({ min: 0, max: 31 }),
    skinTone: index(O.SKIN_TONES), hair: index(O.HAIR_STYLES), hairColour: index(O.HAIR_COLOURS), facialHair: index(O.FACIAL_HAIR),
    eyes: index(O.EYES), eyebrows: index(O.EYEBROWS), nose: index(O.NOSES), mouth: index(O.MOUTHS), clothing: index(O.CLOTHING),
    clothingColour: index(O.CLOTHING_COLOURS), accessory: index(O.ACCESSORIES), format: fc.constant(0),
    faceShape: index(O.FACE_SHAPES), undertone: index(O.UNDERTONES), background: index(O.BACKGROUNDS),
    customSkin: colour, customHair: colour, customClothing: colour, customBackground: colour,
  },
  { requiredKeys: ['ceoFirstName', 'ceoLastName', 'ceoAge', 'skinTone', 'hair', 'hairColour', 'facialHair', 'eyes', 'eyebrows', 'nose', 'mouth', 'clothing', 'clothingColour', 'accessory', 'format', 'faceShape', 'undertone', 'background'] },
);

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const logoArbitrary: fc.Arbitrary<LogoSpec> = fc
  .record({
    shape: fc.constantFrom(...LOGO_SHAPES), motif: fc.constantFrom(...LOGO_MOTIFS), palette: fc.constantFrom(...PALETTES),
    font: fc.constantFrom(...LOGO_FONTS), layout: fc.constantFrom(...LOGO_LAYOUTS), effect: fc.constantFrom(...LOGO_EFFECTS),
    custom: fc.tuple(fc.option(colour), fc.option(colour), fc.option(colour)),
  })
  .map(({ custom, palette, ...spec }) => {
    const colors = [custom[0] === null ? palette.colors[0] : hex(custom[0]), custom[1] === null ? palette.colors[1] : hex(custom[1])] as [string, string, string?];
    if (custom[2] !== null) colors.push(hex(custom[2]));
    return { ...spec, palette: { ...palette, colors } };
  });

/** Share of single-character edits a decoder rejects. */
function rejected(codes: string[], decode: (code: string) => unknown): number {
  let edits = 0;
  let caught = 0;
  for (const code of codes) {
    for (let i = 0; i < code.length; i++) {
      for (const ch of 'AQg4-') {
        if (ch === code[i]) continue;
        edits++;
        try {
          decode(code.slice(0, i) + ch + code.slice(i + 1));
        } catch {
          caught++;
        }
      }
    }
  }
  return caught / edits;
}

describe('CEO codes (spec §8)', () => {
  it('round-trip every CEO, custom colours included', () => {
    fc.assert(fc.property(ceoArbitrary, (ceo) => {
      expect(decodeCeo(encodeCeo(ceo))).toEqual(ceo);
    }), { numRuns: 2000 });
    expect(encodeCeo(randomCeo(Rng.stream('x', 'y')))).toMatch(/^[A-Za-z0-9_-]{15}$/);
  });

  it('round-trip every option of every feature', () => {
    const base = randomCeo(Rng.stream('options', 'base'));
    for (const feature of FEATURES) {
      const list = { faceShape: O.FACE_SHAPES, skinTone: O.SKIN_TONES, undertone: O.UNDERTONES, hair: O.HAIR_STYLES, hairColour: O.HAIR_COLOURS, eyebrows: O.EYEBROWS, eyes: O.EYES, nose: O.NOSES, mouth: O.MOUTHS, facialHair: O.FACIAL_HAIR, accessory: O.ACCESSORIES, clothing: O.CLOTHING, clothingColour: O.CLOTHING_COLOURS, background: O.BACKGROUNDS }[feature];
      list.forEach((_, i) => expect(decodeCeo(encodeCeo({ ...base, [feature]: i }))).toEqual({ ...base, [feature]: i }));
    }
  });

  it("share the genome's CEO block bit for bit, for every company", () => {
    const start = GENOME_FIELDS.slice(0, GENOME_FIELDS.findIndex(([f]) => f === 'ceoFirstName')).reduce((n, [, w]) => n + w, 0);
    for (const c of world.companies) {
      const ceo = companyCeo(c.genes);
      const code = encodeCeo(ceo);
      expect(decodeCeo(code)).toEqual(ceo);
      expect(bits(code).slice(0, 68)).toBe(bits(c.genome).slice(start, start + 68));
    }
  });

  it('reject corrupted codes and options that do not exist', () => {
    const rng = Rng.stream('corrupt', 'ceo');
    const codes = Array.from({ length: 200 }, () => encodeCeo(randomCeo(rng)));
    expect(rejected(codes, decodeCeo)).toBeGreaterThan(0.9);
    expect(() => decodeCeo(codes[0].slice(0, -1))).toThrow(/Invalid CEO code/);
    expect(() => decodeCeo(`${codes[0]}A`)).toThrow(/Invalid CEO code/);
    expect(() => decodeCeo(packCode(CEO_FIELDS, { ...randomCeo(rng), faceShape: 7 }))).toThrow(/unknown option/);
  });
});

describe('logo codes (spec §7)', () => {
  it('round-trip every logo, custom colours included', () => {
    fc.assert(fc.property(logoArbitrary, (spec) => {
      expect(decodeLogo(encodeLogo(spec))).toEqual(spec);
    }), { numRuns: 2000 });
    expect(encodeLogo(DEFAULT_LOGO)).toHaveLength(6);
  });

  it('encode every preset firm and company logo', () => {
    for (const firm of PRESET_FIRMS) expect(decodeLogo(encodeLogo(presetLogo(firm)))).toEqual({ ...presetLogo(firm), effect: 'none' });
    for (const c of world.companies) {
      const logo = companyLogo(c.genes);
      expect(decodeLogo(encodeLogo(logo))).toEqual({ ...logo, effect: 'none' });
    }
  });

  it('reject corrupted codes', () => {
    const rng = Rng.stream('corrupt', 'logo');
    const codes = Array.from({ length: 300 }, () => encodeLogo(fc.sample(logoArbitrary, { numRuns: 1, seed: rng.int(0, 1e9) })[0]));
    expect(rejected(codes, decodeLogo)).toBeGreaterThan(0.9);
    expect(() => decodeLogo(packCode(LOGO_FIELDS, { format: 0, shape: 12, motif: 0, palette: 0, font: 0, layout: 0, effect: 0 }))).toThrow(/unknown part/);
  });
});

describe('portraits (spec §8)', () => {
  const rng = Rng.stream('portraits', 'randomise');
  const ceos = Array.from({ length: 4000 }, () => randomCeo(rng));

  it('Randomise produces varied portraits that use every option', () => {
    expect(new Set(ceos.slice(0, 1000).map((c) => encodeCeo({ ...c, ceoFirstName: 0, ceoLastName: 0 }))).size).toBeGreaterThan(995);
    const fields = { faceShape: O.FACE_SHAPES, skinTone: O.SKIN_TONES, undertone: O.UNDERTONES, hair: O.HAIR_STYLES, hairColour: O.HAIR_COLOURS, eyebrows: O.EYEBROWS, eyes: O.EYES, nose: O.NOSES, mouth: O.MOUTHS, facialHair: O.FACIAL_HAIR, accessory: O.ACCESSORIES, clothing: O.CLOTHING, clothingColour: O.CLOTHING_COLOURS, background: O.BACKGROUNDS };
    for (const [field, list] of Object.entries(fields)) {
      expect(new Set(ceos.map((c) => c[field as keyof Ceo])).size, field).toBe(list.length);
    }
  });

  it('Randomise produces coherent portraits', () => {
    const share = (group: Ceo[], test: (c: Ceo) => boolean) => group.filter(test).length / group.length;
    const young = ceos.filter((c) => c.ceoAge < 8); // 32–39
    const old = ceos.filter((c) => c.ceoAge >= 24); // 56–63
    const grey = (c: Ceo) => ['grey', 'white'].includes(O.HAIR_COLOURS[c.hairColour]);
    const thinning = (c: Ceo) => ['bald', 'receding', 'combOver'].includes(O.HAIR_STYLES[c.hair]);
    // Grey hair and thinning come with age; dyed hair, monocles and tuxedos are rare; suits are common.
    expect(share(young, grey)).toBeLessThan(0.15);
    expect(share(old, grey)).toBeGreaterThan(0.25);
    expect(share(old, thinning)).toBeGreaterThan(2 * share(young, thinning));
    expect(share(ceos, (c) => O.HAIR_COLOURS[c.hairColour].startsWith('dyed'))).toBeLessThan(0.05);
    expect(share(ceos, (c) => O.ACCESSORIES[c.accessory] === 'monocle')).toBeLessThan(0.02);
    expect(share(ceos, (c) => O.CLOTHING[c.clothing] === 'tuxedo')).toBeLessThan(0.03);
    expect(share(ceos, (c) => O.CLOTHING[c.clothing] === 'suitAndTie')).toBeGreaterThan(0.2);
    expect(share(ceos, (c) => O.FACIAL_HAIR[c.facialHair] === 'none')).toBeGreaterThan(0.25);
    // Eyebrows match the hair, except dyed hair, whose eyebrows stay natural.
    for (const c of ceos.slice(0, 300)) {
      const { brows, hair } = portraitColours(c);
      if (O.HAIR_COLOURS[c.hairColour].startsWith('dyed')) expect(brows).toBe('#3b2616');
      else expect(brows).not.toBe(hair);
    }
  });

  it('Randomise one feature changes that feature only, and drops its custom colour', () => {
    const r = Rng.stream('portraits', 'one');
    for (const feature of FEATURES) {
      const before = { ...randomCeo(r), customHair: 0x123456, customClothing: 0x654321 };
      const after = randomiseFeature(r, before, feature);
      expect(after[feature]).not.toBe(before[feature]);
      const changed = Object.keys({ ...before, ...after }).filter((k) => before[k as keyof Ceo] !== after[k as keyof Ceo]);
      const dropped = feature === 'hairColour' ? ['customHair'] : feature === 'clothingColour' ? ['customClothing'] : [];
      expect(changed.sort()).toEqual([feature, ...dropped].sort());
    }
  });

  it('draws every option as clean SVG', () => {
    for (const c of ceos.slice(0, 400)) {
      const svg = renderToStaticMarkup(<Portrait ceo={c} />);
      expect(svg).toMatch(/^<svg/);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
    const tobacco = renderToStaticMarkup(<Portrait ceo={{ ...ceos[0], accessory: O.ACCESSORIES.indexOf('cigar') }} />);
    expect(tobacco).toContain('>RTC<'); // the Rhodesia Tobacco Company's monogram on the cigar band
  });
});

describe('ID badge (spec §8)', () => {
  const ceo = randomCeo(Rng.stream('badge', 'ceo'));
  const props = { firmName: 'Garage Capital', logo: DEFAULT_LOGO, ceoName: 'Pat Doe', ceo, ceoCode: encodeCeo(ceo), employeeNo: '04217' };

  it('flips when clicked', async () => {
    const box = document.createElement('div');
    document.body.append(box);
    const root = createRoot(box);
    await act(async () => root.render(<Badge {...props} />));
    const badge = box.querySelector<HTMLButtonElement>('.id-badge')!;
    expect(badge.classList.contains('flipped')).toBe(false);
    expect(box.querySelector('.id-badge-front')!.textContent).toContain('ALL FLOORS');
    expect(box.querySelector('.id-badge-back .id-badge-stripe')).not.toBeNull();
    await act(async () => badge.click());
    expect(badge.classList.contains('flipped')).toBe(true);
    expect(badge.getAttribute('aria-pressed')).toBe('true');
    await act(async () => badge.click());
    expect(badge.classList.contains('flipped')).toBe(false);
    await act(async () => root.unmount());
  });

  it('shows the photo, name, title, number, access, issue date and a barcode of the CEO code', () => {
    const html = renderToStaticMarkup(<Badge {...props} />);
    for (const text of ['Pat Doe', 'Chief Executive Officer', '04217', 'ALL FLOORS', formatDate(START_DAY), 'Garage Capital']) expect(html).toContain(text);
    expect(html).toContain(`Barcode ${props.ceoCode}`);
    const bars = (code: string) => renderToStaticMarkup(<Barcode text={code} />);
    expect(bars(props.ceoCode)).not.toBe(bars(encodeCeo({ ...ceo, hair: (ceo.hair + 1) % 24 })));
  });
});

describe('difficulty and advanced settings (spec §9)', () => {
  it('labels the presets and switches to Custom when any value changes', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) expect(difficultyOf(DIFFICULTIES[d])).toBe(d);
    const medium = DIFFICULTIES.medium;
    const changes: Partial<typeof medium>[] = [
      { startingCapital: 1_000_001 }, { commission: { fixed: 19.95, rate: 0.001 } }, { volatility: 1.1 }, { shortSelling: false },
      { ironman: true }, { darkWebOdds: 0.05 }, { aggression: 'high' }, { heatDecay: 2 },
    ];
    for (const change of changes) expect(changeSettings(medium, change).difficulty, JSON.stringify(change)).toBe('custom');
    // Changing a value back restores the label; cosmetic settings and fun modules never change it.
    expect(changeSettings(changeSettings(medium, { volatility: 2 }), { volatility: 1 }).difficulty).toBe('medium');
    expect(changeSettings(medium, { startYear: 2003, modules: { geopolitics: true, periodEvents: true, gags: true } }).difficulty).toBe('medium');
  });

  it('counts the world options too', () => {
    const options: SetupOptions = { seed: 'A', companyCount: 10_000, settings: DIFFICULTIES.hard, dialup: 'short' };
    expect(difficultyLabel(options)).toBe('hard');
    expect(difficultyLabel({ ...options, seed: 'B', dialup: 'authentic' })).toBe('hard');
    expect(difficultyLabel({ ...options, companyCount: 5_000 })).toBe('custom');
    expect(difficultyLabel({ ...options, competitorCount: 3 })).toBe('custom');
  });

  it('fills in settings older saves lack', () => {
    expect(completeSettings({ difficulty: 'easy', startingCapital: 5 })).toEqual({ ...DIFFICULTIES.easy, startingCapital: 5 });
  });

  it('shows the cosmetic start year', () => {
    setStartYear(2008);
    expect(formatDate(START_DAY)).toBe('05 Jan 2008');
    setStartYear(1998);
    expect(formatDate(START_DAY)).toBe('05 Jan 1998');
  });
});

describe('preset firms (spec §6)', () => {
  it("run a listed bank's asset-management arm", () => {
    const name = (id: string) => playerFirmName(PRESET_FIRMS.find((f) => f.id === id)!);
    expect(name('silvermansacks')).toBe('Silverman Sacks Asset Management');
    expect(name('jpborgan')).toBe('J.P. Borgan Asset Management');
    expect(name('whiterock')).toBe('WhiteRock');
  });

  it('leave the picked preset out of the competitors', () => {
    const w = generateWorld({ seed: 'characters', companyCount: 1000, playerFirm: 'citadull' });
    expect(w.firms.map((f) => f.id)).not.toContain('citadull');
    expect(w.firms.filter((f) => f.preset)).toHaveLength(PRESET_FIRMS.length - 1);
  });
});
