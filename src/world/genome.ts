import { BitOutputStream } from '@thi.ng/bitstream';
import { createModel } from 'js-crc';

/**
 * Company genome layout (spec §10.3): 200 bits of fields, most significant bit first, then a 4-bit checksum.
 * 204 bits = exactly 34 base64url characters. Field order and widths are part of the save format.
 */
export const GENOME_FIELDS = [
  // Header
  ['version', 4], ['industry', 6], ['subIndustry', 3], ['nameTemplate', 4], ['namePartA', 8], ['namePartB', 8],
  ['nameSuffix', 5], ['founded', 7], ['hqCity', 7],
  // Logo
  ['logoShape', 5], ['logoMotif', 5], ['logoPalette', 6], ['logoFont', 3], ['logoLayout', 3],
  // CEO
  ['ceoFirstName', 9], ['ceoLastName', 10], ['ceoAge', 5], ['skinTone', 4], ['hair', 5], ['hairColour', 4],
  ['facialHair', 5], ['eyes', 3], ['eyebrows', 3], ['nose', 4], ['mouth', 4], ['clothing', 4], ['clothingColour', 4],
  ['accessory', 4],
  // Fundamentals
  ['marketCap', 10], ['price', 10], ['volatility', 6], ['beta', 5], ['dividendYield', 5], ['revenueGrowth', 6],
  ['netMargin', 6], ['leverage', 5], ['quality', 5],
] as const;

export type Gene = (typeof GENOME_FIELDS)[number][0];
/** A decoded genome: one small unsigned integer per field. */
export type Genes = Record<Gene, number>;

export const GENOME_LENGTH = 34;
/** Lexicon/format version of procedural genomes. */
export const GENOME_VERSION = 1;
/** Version marking a curated top-100 entry; its `namePartA` indexes world/top100.ts. */
export const CURATED_VERSION = 15;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// CRC-4/INTERLAKEN from the CRC catalogue. Its non-zero init and xorout make an all-'A' string invalid.
const crc4 = createModel({ width: 4, poly: 0x3, init: 0xf, refin: false, refout: false, xorout: 0xf });
/** Checksum over the 25 payload bytes (the 200 field bits). */
const checksum = (payload: Uint8Array) => crc4.array(payload)[0];

export function encodeGenome(genes: Genes): string {
  const bits = new BitOutputStream(26);
  for (const [gene, width] of GENOME_FIELDS) {
    const value = genes[gene];
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) throw new RangeError(`${gene} out of range: ${value}`);
    bits.write(value, width);
  }
  bits.write(checksum(bits.bytes()), 4);
  const reader = bits.reader();
  let genome = '';
  for (let i = 0; i < GENOME_LENGTH; i++) genome += ALPHABET[reader.read(6)];
  return genome;
}

/** Unpacks a genome; throws if it has the wrong length or characters or fails the checksum. */
export function decodeGenome(genome: string): Genes {
  if (genome.length !== GENOME_LENGTH) throw new Error(`Invalid genome: expected ${GENOME_LENGTH} characters`);
  const bits = new BitOutputStream(26);
  for (const ch of genome) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw new Error(`Invalid genome: unexpected character '${ch}'`);
    bits.write(value, 6);
  }
  const reader = bits.reader();
  const genes = {} as Genes;
  for (const [gene, width] of GENOME_FIELDS) genes[gene] = reader.read(width);
  if (reader.read(4) !== checksum(bits.bytes().subarray(0, 25))) throw new Error('Invalid genome: checksum mismatch');
  return genes;
}

/** Maps a fundamentals gene to its value and back. */
export interface Scale {
  value(code: number): number;
  code(value: number): number;
  /** Nearest code whose value lies within [lo, hi] (when the grid has one there). */
  codeWithin(value: number, lo: number, hi: number): number;
}

function scale(bits: number, toValue: (code: number) => number, toCode: (value: number) => number): Scale {
  const max = 2 ** bits - 1;
  const code = (value: number) => Math.min(max, Math.max(0, Math.round(toCode(value))));
  const eps = 1e-9;
  return {
    value: toValue,
    code,
    codeWithin(value, lo, hi) {
      let min = code(lo);
      if (toValue(min) < lo - eps) min++;
      let top = code(hi);
      if (toValue(top) > hi + eps) top--;
      return min > top ? code((lo + hi) / 2) : Math.min(top, Math.max(min, code(value)));
    },
  };
}

// Rounding to 1e-9 keeps decoded values tidy (0.3 rather than 0.30000000000000004).
const linear = (bits: number, min: number, step: number) =>
  scale(bits, (c) => Math.round((min + c * step) * 1e9) / 1e9, (v) => (v - min) / step);
const logarithmic = (bits: number, min: number, max: number) => {
  const steps = 2 ** bits - 1;
  const span = Math.log(max / min);
  return scale(bits, (c) => min * Math.exp((c / steps) * span), (v) => (Math.log(v / min) / span) * steps);
};

/** Value ranges of the fundamentals genes. Rates are fractions (0.05 = 5%). */
export const SCALES = {
  marketCap: logarithmic(10, 1e6, 5e12), // $1M – $5T
  price: logarithmic(10, 0.1, 2000), // $0.10 – $2,000
  volatility: linear(6, 0.08, 0.02), // annualised σ, 8% – 134%
  beta: linear(5, -0.5, 0.1), // −0.5 – 2.6
  dividendYield: linear(5, 0, 0.003), // 0 – 9.3%
  revenueGrowth: linear(6, -0.3, 0.02), // −30% – +96%
  netMargin: linear(6, -0.6, 0.02), // −60% – +66%
  leverage: linear(5, 0, 0.1), // debt/equity 0 – 3.1
  quality: linear(5, 0, 1 / 31), // earnings reliability and governance, 0 – 1
} satisfies Partial<Record<Gene, Scale>>;
