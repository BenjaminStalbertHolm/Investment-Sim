import { createStore, del, delMany, get, keys, setMany, type UseStore } from 'idb-keyval';

/** A save slot in C:\Saves\ (spec §17): what the list shows, and the key of the file's bytes. */
export interface SaveSlot {
  id: string;
  name: string;
  /** One of the rotating autosaves. */
  auto: boolean;
  /** Real time of saving, ms since the epoch. */
  savedAt: number;
  gameTime: number;
  firmName: string;
  netWorth: number;
  size: number;
  file: string;
  /** The firm went bankrupt in it (spec §16): read-only, in the Hall of Shame. */
  bankrupt?: boolean;
}

/** Autosaves rotate through this many slots (spec §18). */
export const AUTOSAVES = 3;
const INDEX = 'index';

let store: UseStore | undefined;
const db = () => (store ??= createStore('majorsoft-doors-98', 'saves'));

// Saves are read-modify-write on the index, so they run one at a time.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

let written = 0;

export async function listSaves(): Promise<SaveSlot[]> {
  return (await get<SaveSlot[]>(INDEX, db())) ?? [];
}

/**
 * Writes a save crash-safely (spec §18): the bytes go under a fresh key and the index switches to them in the same
 * IndexedDB transaction, so a crash leaves the old save or the new one, never half of each. The replaced file is
 * deleted afterwards; if a crash gets in between, cleanUp() sweeps it away.
 */
export function writeSave(slot: Omit<SaveSlot, 'file' | 'size'>, bytes: Uint8Array): Promise<SaveSlot> {
  return exclusive(async () => {
    const saves = await listSaves();
    const entry: SaveSlot = { ...slot, size: bytes.byteLength, file: `file:${slot.id}:${Date.now()}:${written++}` };
    const old = saves.find((s) => s.id === slot.id);
    await setMany([[entry.file, bytes], [INDEX, [...saves.filter((s) => s.id !== slot.id), entry]]], db());
    if (old) await del(old.file, db());
    return entry;
  });
}

export async function readSave(id: string): Promise<Uint8Array> {
  const slot = (await listSaves()).find((s) => s.id === id);
  const bytes = slot && (await get<Uint8Array>(slot.file, db()));
  if (!bytes) throw new Error('The saved game could not be found.');
  return bytes;
}

export function deleteSave(id: string): Promise<void> {
  return exclusive(async () => {
    const saves = await listSaves();
    const slot = saves.find((s) => s.id === id);
    if (!slot) return;
    await setMany([[INDEX, saves.filter((s) => s !== slot)]], db());
    await del(slot.file, db());
  });
}

/** The autosave slot to write next: a free one of the three, else the oldest. */
export function nextAutosave(saves: readonly SaveSlot[]): string {
  const ids = Array.from({ length: AUTOSAVES }, (_, k) => `autosave-${k + 1}`);
  const free = ids.find((id) => !saves.some((s) => s.id === id));
  if (free) return free;
  return saves.filter((s) => s.auto).sort((a, b) => a.savedAt - b.savedAt)[0].id;
}

/** Deletes files no slot points to (left behind if the game closed mid-save). */
export function cleanUp(): Promise<void> {
  return exclusive(async () => {
    const used = new Set((await listSaves()).map((s) => s.file));
    const stray = (await keys<string>(db())).filter((k) => k !== INDEX && !used.has(k));
    if (stray.length) await delMany(stray, db());
  });
}
