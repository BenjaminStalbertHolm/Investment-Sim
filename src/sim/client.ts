import * as Comlink from 'comlink';
import type { SimulationApi } from './worker';

let remote: Comlink.Remote<SimulationApi> | undefined;

/** The simulation worker (spec §11), started on first use. */
export function simulation(): Comlink.Remote<SimulationApi> {
  return (remote ??= Comlink.wrap<SimulationApi>(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })));
}
