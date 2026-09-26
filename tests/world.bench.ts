import { test } from 'vitest';
import { decodeCompany } from '../src/world/company';
import { generateWorld } from '../src/world/generator';

// Budget (spec §11.3): world generation under 1.5 s. Run with `npm run bench`.
const RUNS = { iterations: 5, time: 0, warmupIterations: 1, warmupTime: 0 };

test('world', async ({ bench }) => {
  const genomes = generateWorld({ seed: 'bench' }).companies.map((c) => c.genome);
  await bench('generate 10,000 companies', () => void generateWorld({ seed: 'bench' })).run(RUNS);
  await bench('decode 10,000 genomes', () => void genomes.map(decodeCompany)).run(RUNS);
});
