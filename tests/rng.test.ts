import { describe, expect, it } from 'vitest';
import { Rng } from '../src/world/rng';

const draws = (rng: Rng, n = 8) => Array.from({ length: n }, () => rng.float());

describe('Rng', () => {
  it('reproduces a named stream from its seed', () => {
    expect(draws(Rng.stream('seed', 'companies'))).toEqual(draws(Rng.stream('seed', 'companies')));
  });

  it('gives different seeds and stream names different sequences', () => {
    const base = draws(Rng.stream('seed', 'companies'));
    expect(draws(Rng.stream('seed', 'events'))).not.toEqual(base);
    expect(draws(Rng.stream('seed2', 'companies'))).not.toEqual(base);
  });

  it('resumes exactly from a saved state', () => {
    const rng = Rng.stream('seed', 'market:tick');
    draws(rng, 5);
    const saved = JSON.parse(JSON.stringify(rng.state()));
    expect(draws(Rng.fromState(saved))).toEqual(draws(rng));
  });

  it('keeps draws in range', () => {
    const rng = Rng.stream('seed', 'ranges');
    for (let i = 0; i < 1000; i++) {
      const f = rng.float();
      expect(f >= 0 && f < 1).toBe(true);
      const n = rng.int(3, 5);
      expect(n >= 3 && n <= 5 && Number.isInteger(n)).toBe(true);
      expect(rng.weighted([0, 2, 0, 1])).not.toBe(0);
    }
    expect(rng.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
