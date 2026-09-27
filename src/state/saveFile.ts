import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { BankruptcyReport } from '../sim/bankruptcy';

/**
 * The .d98 save file (spec §18): a zip archive of JSON documents, compressed by fflate. Typed arrays inside the
 * documents are stored as binary entries under bin/ (the JSON keeps a { "$bin": path } reference), with their bytes
 * split into planes, which deflate compresses far better than interleaved numbers. Renamed to .zip it opens anywhere.
 */
export const SAVE_FORMAT = 'majorsoft-doors-98-save';

export interface Manifest {
  format: typeof SAVE_FORMAT;
  version: number;
  name: string;
  firmName: string;
  /** Game time and net worth, for the Saves list. */
  gameTime: number;
  netWorth: number;
  /** Real time of saving, ms since the epoch. */
  savedAt: number;
  /** The firm went bankrupt (spec §16): the save is read-only, and this is its final report for the Hall of Shame. */
  bankrupt?: BankruptcyReport;
}

export type SaveDocuments = { manifest: Manifest } & Record<string, unknown>;

const TYPES = { Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };
type TypeName = keyof typeof TYPES;

/** Byte planes: all the first bytes of the elements, then all the second bytes… */
function shuffle(bytes: Uint8Array, width: number): Uint8Array {
  const n = bytes.length / width;
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < n; i++) for (let b = 0; b < width; b++) out[b * n + i] = bytes[i * width + b];
  return out;
}

function unshuffle(planes: Uint8Array, width: number): Uint8Array<ArrayBuffer> {
  const n = planes.length / width;
  const out = new Uint8Array(planes.length);
  for (let i = 0; i < n; i++) for (let b = 0; b < width; b++) out[i * width + b] = planes[b * n + i];
  return out;
}

export function packSave(documents: SaveDocuments): Uint8Array {
  const files: Zippable = {};
  let count = 0;
  const replacer = (_key: string, value: unknown) => {
    if (!ArrayBuffer.isView(value) || value instanceof DataView) return value;
    const type = value.constructor.name as TypeName;
    const path = `bin/${count++}.${type}`;
    files[path] = shuffle(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), TYPES[type].BYTES_PER_ELEMENT);
    return { $bin: path };
  };
  for (const [name, document] of Object.entries(documents)) files[`${name}.json`] = strToU8(JSON.stringify(document, replacer));
  // Level 1: a year of history packs 2.8× faster than at level 6 for a file only 3% larger.
  return zipSync(files, { level: 1 });
}

/** Unpacks every document, or only the manifest (enough for listing and checking a file). */
export function unpackSave(data: Uint8Array, manifestOnly = false): SaveDocuments {
  const files = unzipSync(data, manifestOnly ? { filter: (f) => f.name === 'manifest.json' } : undefined);
  if (!files['manifest.json']) throw new Error('This is not a Majorsoft Doors 98 saved game.');
  const reviver = (_key: string, value: unknown) => {
    if (!value || typeof value !== 'object' || !('$bin' in value)) return value;
    const path = String(value.$bin);
    const Type = TYPES[path.slice(path.lastIndexOf('.') + 1) as TypeName];
    const bytes = unshuffle(files[path], Type.BYTES_PER_ELEMENT);
    return new Type(bytes.buffer, 0, bytes.length / Type.BYTES_PER_ELEMENT);
  };
  const documents: Record<string, unknown> = {};
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith('.json')) documents[name.slice(0, -5)] = JSON.parse(strFromU8(bytes), reviver);
  }
  return documents as SaveDocuments;
}
