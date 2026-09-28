import type { Engine } from '../src/sim/engine';

/**
 * The simulation worker for UI tests: the engine itself, called in-process; each call is answered on the next tick, as
 * Comlink would. It imports nothing of the UI's, so the client's mock can load it before anything else.
 */
export const worker = {
  engine: undefined as unknown as Engine,
  /** The worker's names that aren't the engine's. */
  renamed: { outlooks: 'outlookViews' } as Record<string, string>,
};

export const client = {
  simulation: () =>
    new Proxy(
      {},
      {
        get: (_, key: string) =>
          async (...args: unknown[]) => {
            const e = worker.engine as unknown as Record<string, (...a: unknown[]) => unknown>;
            const f = e[worker.renamed[key] ?? key];
            if (typeof f !== 'function') throw new Error(`The worker has no ${key}()`);
            return structuredClone(f.apply(e, args));
          },
      },
    ),
};

