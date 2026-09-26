import { test } from 'vitest';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { Rng } from '../src/world/rng';

// Budget (spec §11.3): one bar for 10,000 companies under 4 ms. Run with `npm run bench`.
const RUNS = { iterations: 200, time: 0, warmupIterations: 20, warmupTime: 0 };

test('engine', async ({ bench }) => {
  const e = Engine.newGame({ seed: 'bench', settings: DIFFICULTIES.medium, firmName: 'Bench' });
  const rng = Rng.stream('bench', 'ticks');
  await bench('one bar, 10,000 companies', () => void e.market.bar(rng, 40)).run(RUNS);
  await bench('one session (78 bars, open and close)', () => e.runSessions(1)).run({ ...RUNS, iterations: 10, warmupIterations: 2 });
});
