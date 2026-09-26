import { describe, expect, it } from 'vitest';
import { GENOME_FIELDS, GENOME_LENGTH, SCALES, decodeGenome, encodeGenome, type Genes } from '../src/world/genome';
import { Rng } from '../src/world/rng';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const rng = Rng.stream('tests', 'genome');
const randomGenes = () => Object.fromEntries(GENOME_FIELDS.map(([gene, width]) => [gene, rng.int(0, 2 ** width - 1)])) as Genes;
const valid = (genome: string) => {
  try {
    decodeGenome(genome);
    return true;
  } catch {
    return false;
  }
};
const replaceAt = (s: string, i: number, ch: string) => s.slice(0, i) + ch + s.slice(i + 1);

describe('genome codec', () => {
  it('packs 200 bits of fields and a 4-bit checksum into 34 characters', () => {
    expect(GENOME_FIELDS.reduce((bits, [, width]) => bits + width, 0)).toBe(200);
    expect(encodeGenome(randomGenes())).toMatch(/^[A-Za-z0-9_-]{34}$/);
    expect(GENOME_LENGTH).toBe(34);
  });

  it('round-trips any genes', () => {
    for (let i = 0; i < 500; i++) {
      const genes = randomGenes();
      const genome = encodeGenome(genes);
      expect(decodeGenome(genome)).toEqual(genes);
      expect(encodeGenome(decodeGenome(genome))).toBe(genome);
    }
  });

  it('refuses genes that do not fit their field', () => {
    expect(() => encodeGenome({ ...randomGenes(), industry: 64 })).toThrow(RangeError);
    expect(() => encodeGenome({ ...randomGenes(), price: -1 })).toThrow(RangeError);
    expect(() => encodeGenome({ ...randomGenes(), beta: 1.5 })).toThrow(RangeError);
  });

  it('rejects strings of the wrong length or alphabet, and all zeros', () => {
    const genome = encodeGenome(randomGenes());
    expect(valid(genome.slice(1))).toBe(false);
    expect(valid(`${genome}A`)).toBe(false);
    expect(valid(replaceAt(genome, 5, '!'))).toBe(false);
    expect(valid('A'.repeat(34))).toBe(false);
  });

  it('rejects every single-bit error', () => {
    for (let k = 0; k < 20; k++) {
      const genome = encodeGenome(randomGenes());
      for (let bit = 0; bit < 204; bit++) {
        const i = Math.floor(bit / 6);
        const flipped = ALPHABET[ALPHABET.indexOf(genome[i]) ^ (32 >> bit % 6)];
        expect(valid(replaceAt(genome, i, flipped))).toBe(false);
      }
    }
  });

  it('rejects single-character typos as well as a 4-bit checksum can', () => {
    // A character carries 6 bits and the checksum 4, so no checksum can catch every substitution: 64 values
    // share 16 checksums. CRC-4 is optimal: exactly 3 of the 63 substitutions at each position slip through.
    for (let k = 0; k < 5; k++) {
      const genome = encodeGenome(randomGenes());
      for (let i = 0; i < GENOME_LENGTH; i++) {
        const missed = [...ALPHABET].filter((ch) => ch !== genome[i] && valid(replaceAt(genome, i, ch)));
        expect(missed).toHaveLength(3);
      }
    }
  });
});

describe('value scales', () => {
  it('span the ranges of spec §10.3', () => {
    expect(SCALES.marketCap.value(0)).toBeCloseTo(1e6);
    expect(SCALES.marketCap.value(1023) / 5e12).toBeCloseTo(1, 9);
    expect(SCALES.price.value(0)).toBeCloseTo(0.1);
    expect(SCALES.price.value(1023)).toBeCloseTo(2000);
    expect(SCALES.dividendYield.value(0)).toBe(0);
    expect(SCALES.revenueGrowth.value(SCALES.revenueGrowth.code(0))).toBe(0);
  });

  it('round a value to the nearest step', () => {
    for (const v of [2.5e6, 7.3e8, 1.2e11, 3.9e12]) {
      expect(Math.abs(Math.log(SCALES.marketCap.value(SCALES.marketCap.code(v)) / v))).toBeLessThan(0.008);
    }
    expect(SCALES.volatility.value(SCALES.volatility.code(0.331))).toBe(0.34);
  });

  it('keep a value inside a range narrower than the grid allows', () => {
    const code = SCALES.volatility.codeWithin(0.245, 0.245, 0.5);
    expect(SCALES.volatility.value(code)).toBeGreaterThanOrEqual(0.245);
    expect(SCALES.volatility.value(SCALES.volatility.codeWithin(0.9, 0.245, 0.5))).toBeLessThanOrEqual(0.5);
  });
});
