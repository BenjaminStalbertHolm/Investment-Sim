import { expect, it } from 'vitest';
import { BARS_PER_DAY } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';

// Budget (spec §11.3): one bar for 10,000 companies in under 4 ms. Timed over whole sessions, so each bar also
// carries its share of the opening gap, earnings and the daily close. `npm run bench` has the finer numbers.
it('advances one bar for 10,000 companies in under 4 ms', () => {
  const e = Engine.newGame({ seed: 'performance', settings: DIFFICULTIES.medium, firmName: 'Test' });
  e.watch([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  e.runSessions(3); // warm-up
  const start = performance.now();
  e.runSessions(5);
  const perBar = (performance.now() - start) / (5 * BARS_PER_DAY);
  expect(perBar).toBeLessThan(4);
}, 60_000);
