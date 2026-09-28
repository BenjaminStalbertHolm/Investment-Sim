import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Speed } from './shell';

/**
 * The machine's settings (spec §17: Display, Sounds, Game), as opposed to the game's: they belong to the computer, not to
 * a firm, so they are kept in the browser (localStorage), survive New Game and Load, and are not in a `.d98`.
 */
export type Scheme = 'standard' | 'teal' | 'brick' | 'contrast';
export type Saver = 'pipes' | 'logos';
export type AutosaveEvery = 'day' | 'week' | 'month' | 'never';

export interface Prefs {
  // Display
  scheme: Scheme;
  /** Scanlines and a vignette (spec §4). */
  crt: boolean;
  saver: Saver;
  /** Minutes without input before the screensaver; 0 is never (spec §4: 3 minutes, configurable). */
  saverMinutes: number;
  // Sounds
  volume: number;
  clicks: boolean;
  mailChime: boolean;
  dialUp: boolean;
  // Game
  /** The speed a new game starts at. */
  startSpeed: Speed;
  autosave: AutosaveEvery;
  /** Stop the clock when a page comes in (margin calls and other urgent letters). */
  pauseOnPage: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  scheme: 'standard',
  crt: false,
  saver: 'pipes',
  saverMinutes: 3,
  volume: 0.7,
  clicks: true,
  mailChime: true,
  dialUp: true,
  startSpeed: 1,
  autosave: 'week',
  pauseOnPage: false,
};

export const SCHEMES: { id: Scheme; name: string }[] = [
  { id: 'standard', name: 'Doors Standard' },
  { id: 'teal', name: 'Teal' },
  { id: 'brick', name: 'Brick' },
  { id: 'contrast', name: 'High Contrast Black' },
];

/** localStorage can be missing or refuse (private windows, blocked site data): the settings then last for the session. */
const storage = createJSONStorage<Partial<Prefs>>(() => {
  try {
    localStorage.getItem('doors98-probe');
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
});

export const usePrefs = create<Prefs>()(
  persist(() => DEFAULT_PREFS, {
    name: 'majorsoft-doors-98-settings',
    version: 1,
    storage,
    // Whatever an older or hand-edited copy is missing comes from the defaults.
    merge: (saved, current) => ({ ...current, ...sanitise(saved as Partial<Prefs>) }),
  }),
);

const SPEEDS = [0, 1, 2, 5, 20];

/** Keeps only values of the right kind, so a damaged copy in localStorage cannot break the desktop. */
export function sanitise(saved: Partial<Prefs> | undefined): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  if (!saved || typeof saved !== 'object') return out;
  const pick = <K extends keyof Prefs>(key: K, ok: (v: unknown) => boolean) => {
    if (key in saved && ok(saved[key])) (out as Record<string, unknown>)[key] = saved[key];
  };
  pick('scheme', (v) => SCHEMES.some((s) => s.id === v));
  pick('saver', (v) => v === 'pipes' || v === 'logos');
  pick('autosave', (v) => v === 'day' || v === 'week' || v === 'month' || v === 'never');
  pick('startSpeed', (v) => SPEEDS.includes(v as number));
  pick('saverMinutes', (v) => typeof v === 'number' && v >= 0 && v <= 120);
  pick('volume', (v) => typeof v === 'number' && v >= 0 && v <= 1);
  for (const k of ['crt', 'clicks', 'mailChime', 'dialUp', 'pauseOnPage'] as const) pick(k, (v) => typeof v === 'boolean');
  return out;
}

export const setPrefs = (change: Partial<Prefs>) => usePrefs.setState(change);
