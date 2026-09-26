import { describe, expect, it } from 'vitest';
import { LOGO_FONTS, LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES } from '../src/art/logo/options';
import {
  ACCESSORIES, CLOTHING, CLOTHING_COLOURS, EYEBROWS, EYES, FACIAL_HAIR, HAIR_COLOURS, HAIR_STYLES, MOUTHS, NOSES,
  SKIN_TONES,
} from '../src/art/portrait/options';
import { CITIES } from '../src/world/cities';
import { GENOME_FIELDS, SCALES, type Gene } from '../src/world/genome';
import { INDUSTRIES } from '../src/world/industries';
import { INITIALS, NAME_TEMPLATES } from '../src/world/lexicons/shared';
import { FIRST_NAMES, LAST_NAMES } from '../src/world/people-names';
import { TOP100 } from '../src/world/top100';

// The content files are meant to grow (spec §20). These checks keep every list inside the genome field it feeds.
const width = (gene: Gene) => GENOME_FIELDS.find(([g]) => g === gene)![1];
const fits = (list: { length: number }, gene: Gene) => expect(list.length).toBeLessThanOrEqual(2 ** width(gene));
const unique = (list: readonly string[]) => expect(new Set(list).size).toBe(list.length);

describe('world data', () => {
  it('fits every option list in its genome field', () => {
    fits(INDUSTRIES, 'industry');
    fits(NAME_TEMPLATES, 'nameTemplate');
    fits(CITIES, 'hqCity');
    fits(LOGO_SHAPES, 'logoShape');
    fits(LOGO_MOTIFS, 'logoMotif');
    fits(PALETTES, 'logoPalette');
    fits(LOGO_FONTS, 'logoFont');
    fits(LOGO_LAYOUTS, 'logoLayout');
    fits(FIRST_NAMES, 'ceoFirstName');
    fits(LAST_NAMES, 'ceoLastName');
    fits(SKIN_TONES, 'skinTone');
    fits(HAIR_STYLES, 'hair');
    fits(HAIR_COLOURS, 'hairColour');
    fits(FACIAL_HAIR, 'facialHair');
    fits(EYES, 'eyes');
    fits(EYEBROWS, 'eyebrows');
    fits(NOSES, 'nose');
    fits(MOUTHS, 'mouth');
    fits(CLOTHING, 'clothing');
    fits(CLOTHING_COLOURS, 'clothingColour');
    fits(ACCESSORIES, 'accessory');
    expect(CITIES).toHaveLength(128);
    expect(PALETTES).toHaveLength(64);
    expect(INITIALS).toHaveLength(32);
  });

  it('has no duplicate names in its lists', () => {
    unique(INDUSTRIES.map((i) => i.id));
    unique(CITIES.map((c) => c.name));
    unique(PALETTES.map((p) => p.id));
    unique(FIRST_NAMES);
    unique(LAST_NAMES);
    for (const list of [LOGO_SHAPES, LOGO_MOTIFS, HAIR_STYLES, FACIAL_HAIR, ACCESSORIES, CLOTHING]) unique(list);
  });

  it('gives every industry a usable profile', () => {
    const cities = new Set(CITIES.map((c) => c.name));
    const families = new Set(PALETTES.map((p) => p.family));
    for (const industry of INDUSTRIES) {
      const { id, priors } = industry;
      fits(industry.subIndustries, 'subIndustry');
      fits(industry.suffixes, 'nameSuffix');
      for (const t of Object.keys(industry.templates)) expect(NAME_TEMPLATES[Number(t)], id).toBeDefined();
      for (const hub of industry.hubs ?? []) expect(cities.has(hub), `${id} hub ${hub}`).toBe(true);
      for (const motif of industry.motifs) expect(LOGO_MOTIFS, id).toContain(motif);
      for (const family of industry.palettes) expect(families.has(family), id).toBe(true);
      expect(priors.founded[0] >= 0 && priors.founded[1] <= 127, id).toBe(true);
      const ranges = [
        [priors.volatility, 'volatility'], [priors.beta, 'beta'], [priors.dividend, 'dividendYield'],
        [priors.growth, 'revenueGrowth'], [priors.margin, 'netMargin'], [priors.leverage, 'leverage'],
      ] as const;
      // Every prior range lies within what its gene can represent.
      for (const [[lo, hi], scale] of ranges) {
        const { value } = SCALES[scale];
        expect(value(0) <= lo && lo <= hi && hi <= value(2 ** width(scale) - 1), `${id} ${scale}`).toBe(true);
      }
    }
  });

  it('lists the curated top 100 against real industries, cities and sub-industries', () => {
    expect(TOP100).toHaveLength(100);
    unique(TOP100.map((c) => c.ticker));
    unique(TOP100.map((c) => c.name));
    const cities = new Set(CITIES.map((c) => c.name));
    for (const entry of TOP100) {
      const industry = INDUSTRIES.find((i) => i.id === entry.industry);
      expect(industry, entry.ticker).toBeDefined();
      expect(cities.has(entry.hq), entry.ticker).toBe(true);
      if (entry.sub) expect(industry!.subIndustries, entry.ticker).toContain(entry.sub);
      expect(entry.ticker).toMatch(/^[A-Z]{3,4}$/);
    }
  });
});
