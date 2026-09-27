import { Rng } from '../../world/rng';

/**
 * WinRamp's music (spec §4A): original tracks composed by a seeded generator, so each track is the same every time it
 * plays. Chiptune: a square-wave lead, a triangle bass, noise drums, over a four-bar loop of sixteenth notes.
 */
export interface Track {
  title: string;
  bpm: number;
  /** Sixteenth-note steps of the loop: MIDI note numbers, or null for a rest. */
  lead: (number | null)[];
  bass: (number | null)[];
  kick: boolean[];
  snare: boolean[];
  hat: boolean[];
}

export const TITLES = [
  'Buy the Dip (Chiptune Mix)', 'Margin Call Blues', 'Bull Run ’98', 'Dead Cat Bounce', 'Stop-Loss Lullaby', 'Irrational Exuberance',
  'Short Squeeze (Club Edit)', 'The Federal Reservoir Waltz', 'Pork Bellies at Dawn', 'Y2K Compliant',
];
const STEPS = 64;
const SCALES = [
  [0, 2, 4, 7, 9], // major pentatonic
  [0, 3, 5, 7, 10], // minor pentatonic
  [0, 2, 3, 5, 7, 8, 10], // natural minor
  [0, 2, 4, 5, 7, 9, 11], // major
];
/** Chord roots of the four bars, as scale degrees: I–V–vi–IV and friends. */
const PROGRESSIONS = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 0, 4], [5, 3, 0, 4]];

export function track(n: number): Track {
  const rng = Rng.stream('winramp', `track:${n}`);
  const scale = SCALES[rng.int(0, SCALES.length - 1)];
  const root = 57 + rng.int(0, 7);
  const progression = PROGRESSIONS[rng.int(0, PROGRESSIONS.length - 1)];
  const degree = (d: number) => root + Math.floor(d / scale.length) * 12 + scale[((d % scale.length) + scale.length) % scale.length];
  const lead: (number | null)[] = [];
  let at = rng.int(0, scale.length);
  const density = rng.range(0.45, 0.8);
  for (let step = 0; step < STEPS; step++) {
    const chord = progression[Math.floor(step / 16)];
    // Strong beats lean on the chord; the rest wander a step or two.
    if (step % 4 === 0 && rng.chance(0.6)) at = chord + [0, 2, 4][rng.int(0, 2)];
    else at += rng.int(-2, 2);
    at = Math.max(-2, Math.min(scale.length * 2, at));
    lead.push(rng.chance(step % 2 ? density * 0.6 : density) ? degree(at) + 12 : null);
  }
  const bass = Array.from({ length: STEPS }, (_, step) => (step % 4 === 0 || (step % 8 === 6 && rng.chance(0.5)) ? degree(progression[Math.floor(step / 16)]) - 12 : null));
  const busy = rng.chance(0.5);
  const kick = Array.from({ length: STEPS }, (_, s) => s % 8 === 0 || (busy && s % 16 === 10));
  const snare = Array.from({ length: STEPS }, (_, s) => s % 8 === 4 || (s % 16 === 15 && rng.chance(0.3)));
  const hat = Array.from({ length: STEPS }, (_, s) => s % 2 === 0 || rng.chance(0.2));
  return { title: TITLES[n % TITLES.length], bpm: 96 + 8 * rng.int(0, 7), lead, bass, kick, snare, hat };
}
