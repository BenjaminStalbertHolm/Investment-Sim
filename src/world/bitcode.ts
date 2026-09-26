import { BitOutputStream } from '@thi.ng/bitstream';
import { createModel } from 'js-crc';

/**
 * Short shareable codes (company genomes, CEO codes, logo codes): fields packed most significant bit first, a CRC-4,
 * then zero bits up to a whole base64url character.
 */

/** A field's name and width in bits. An optional field is a presence bit, then the value when present. */
export type Field = readonly [name: string, bits: number, optional?: 'optional'];

type Required<F extends readonly Field[]> = Extract<F[number], readonly [string, number]>[0];
type Optional<F extends readonly Field[]> = Extract<F[number], readonly [string, number, 'optional']>[0];
/** One unsigned integer per field; optional ones may be missing. */
export type FieldValues<F extends readonly Field[]> = Record<Exclude<Required<F>, Optional<F>>, number> &
  Partial<Record<Optional<F>, number>>;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// CRC-4/INTERLAKEN from the CRC catalogue. Its non-zero init and xorout make an all-'A' string invalid.
const crc4 = createModel({ width: 4, poly: 0x3, init: 0xf, refin: false, refout: false, xorout: 0xf });

/** Throws a RangeError if a value doesn't fit its field. */
export function packCode<F extends readonly Field[]>(fields: F, values: FieldValues<F>): string {
  const bits = new BitOutputStream(32);
  const record = values as Record<string, number | undefined>;
  for (const [name, width, optional] of fields) {
    const value = record[name];
    if (optional) {
      bits.writeBit(value === undefined ? 0 : 1);
      if (value === undefined) continue;
    }
    if (!Number.isInteger(value) || value! < 0 || value! >= 2 ** width) throw new RangeError(`${name} out of range: ${value}`);
    bits.write(value!, width);
  }
  const payload = bits.position;
  bits.write(crc4.array(bits.bytes())[0], 4);
  const length = Math.ceil((payload + 4) / 6);
  if (length * 6 > bits.position) bits.write(0, length * 6 - bits.position);
  const reader = bits.reader();
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[reader.read(6)];
  return code;
}

/** Unpacks a code; throws if it has the wrong characters or length or fails the checksum. */
export function unpackCode<F extends readonly Field[]>(fields: F, code: string, label = 'code'): FieldValues<F> {
  const fail = (why: string) => new Error(`Invalid ${label}: ${why}`);
  const bits = new BitOutputStream(Math.ceil((code.length * 6) / 8) + 1);
  for (const ch of code) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) throw fail(`unexpected character '${ch}'`);
    bits.write(value, 6);
  }
  const reader = bits.reader();
  const values: Record<string, number> = {};
  try {
    for (const [name, width, optional] of fields) {
      if (optional && !reader.read(1)) continue;
      values[name] = reader.read(width);
    }
  } catch {
    throw fail('too short');
  }
  const payload = reader.position;
  if (Math.ceil((payload + 4) / 6) !== code.length) throw fail('wrong length');
  // The checksum covers the payload bits, zero-padded to whole bytes, as when it was written.
  const bytes = bits.bytes().slice(0, Math.ceil(payload / 8));
  if (payload % 8) bytes[bytes.length - 1] &= 0xff << (8 - (payload % 8));
  if (reader.read(4) !== crc4.array(bytes)[0]) throw fail('checksum mismatch');
  if (reader.position < code.length * 6 && reader.read(code.length * 6 - reader.position)) throw fail('checksum mismatch');
  return values as FieldValues<F>;
}

/** A 24-bit colour for a code, from "#rrggbb". */
export const colourBits = (hex: string) => parseInt(hex.slice(1, 7), 16);
export const colourHex = (bits: number) => `#${bits.toString(16).padStart(6, '0')}`;
