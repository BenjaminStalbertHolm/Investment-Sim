import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { uniformFloat64 } from 'pure-rand/distribution/uniformFloat64';
import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plusFromState } from 'pure-rand/generator/xoroshiro128plus';
import type { RandomGenerator } from 'pure-rand/types/RandomGenerator';

/** A stream's complete state. Stored in saves so a stream resumes exactly where it was (spec §10.1, §18). */
export type RngState = readonly number[];

/**
 * Seeded randomness. Everything random in the game draws from one of these, never from Math.random().
 * The generator is pure-rand's xoroshiro128+, whose whole state is four numbers. The helpers keep no hidden
 * state of their own (no cached spare normals), so state() really is everything there is to save.
 */
export class Rng {
  private constructor(private readonly gen: RandomGenerator) {}

  /** Named substream of a seed: the first 128 bits of SHA-256(seed, name) become the generator state. */
  static stream(seed: string, name: string): Rng {
    const hash = sha256(utf8ToBytes(`${seed}\u0000${name}`));
    const words = new DataView(hash.buffer, hash.byteOffset, 16);
    // `| 1` keeps the state non-zero, which xoroshiro requires.
    return Rng.fromState([words.getInt32(0), words.getInt32(4), words.getInt32(8), words.getInt32(12) | 1]);
  }

  static fromState(state: RngState): Rng {
    return new Rng(xoroshiro128plusFromState(state));
  }

  state(): RngState {
    return this.gen.getState();
  }

  /** Uniform in [0, 1). */
  float(): number {
    return uniformFloat64(this.gen);
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.float();
  }

  /** Uniform integer in [lo, hi], both ends included. */
  int(lo: number, hi: number): number {
    return uniformInt(this.gen, lo, hi);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** An index, drawn with probability proportional to its weight. */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.float() * total;
    let last = 0;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      last = i;
      r -= weights[i];
      if (r < 0) return i;
    }
    return last;
  }

  /** Normal variate (Box–Muller; the spare value is discarded). */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.float());
  }

  /** Fisher–Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
