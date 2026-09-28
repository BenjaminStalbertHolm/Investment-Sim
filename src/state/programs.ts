import { create } from 'zustand';
import type { Target } from '../sim/desk';

/**
 * The desktop programs' own files and preferences (Phase 10, spec §4A, §18): Notepad's notes, MajorWord's documents,
 * Exceed's spreadsheets, MajorPaint's pictures and the wallpaper, Stapley, WinRamp, the games' records, the Portfolio
 * Defragmenter's targets and the Calculator's mode. All of it is the UI's half of a save (game.json).
 */
export interface Doc {
  id: number;
  name: string;
  text: string;
  font: 'serif' | 'sans' | 'mono';
  size: number;
}

export interface Sheet {
  id: number;
  name: string;
  /** "A1" → what was typed: a number, text, or a formula starting with "=". */
  cells: Record<string, string>;
}

/** A 32×32 picture in the 16-colour palette, one hexadecimal digit per pixel, row by row. */
export interface Picture {
  id: number;
  name: string;
  pixels: string;
}

export type Wallpaper = { kind: 'teal' } | { kind: 'pattern'; id: string } | { kind: 'picture'; pixels: string };

export interface Programs {
  notepad: string;
  documents: Doc[];
  sheets: Sheet[];
  pictures: Picture[];
  nextId: number;
  wallpaper: Wallpaper;
  stapley: { enabled: boolean; seen: string[] };
  winramp: { skin: number; volume: number; track: number };
  games: { sweeper: Record<string, number>; solitaire: { played: number; won: number } };
  defrag: { targets: Target[] };
  calculator: { mode: 'standard' | 'scientific' | 'financial' };
}

export const newPrograms = (): Programs => ({
  notepad: '',
  documents: [],
  sheets: [],
  pictures: [],
  nextId: 1,
  wallpaper: { kind: 'teal' },
  stapley: { enabled: true, seen: [] },
  winramp: { skin: 0, volume: 0.6, track: 0 },
  games: { sweeper: {}, solitaire: { played: 0, won: 0 } },
  defrag: { targets: [] },
  calculator: { mode: 'standard' },
});

export const usePrograms = create<Programs>()(() => newPrograms());

/** Saves a document of one kind (new when it has no id yet); returns its id. */
export function saveFile<K extends 'documents' | 'sheets' | 'pictures'>(kind: K, file: Omit<Programs[K][number], 'id'> & { id?: number }): number {
  const s = usePrograms.getState();
  const id = file.id ?? s.nextId;
  const list = s[kind] as { id: number }[];
  const next = list.some((f) => f.id === id) ? list.map((f) => (f.id === id ? { ...file, id } : f)) : [...list, { ...file, id }];
  usePrograms.setState({ [kind]: next, nextId: file.id === undefined ? s.nextId + 1 : s.nextId } as Partial<Programs>);
  return id;
}

export function deleteFile(kind: 'documents' | 'sheets' | 'pictures', id: number): void {
  usePrograms.setState((s) => ({ [kind]: (s[kind] as { id: number }[]).filter((f) => f.id !== id) }) as Partial<Programs>);
}
