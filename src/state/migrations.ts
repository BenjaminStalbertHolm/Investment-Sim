import { pastQuarters, type Fundamentals } from '../sim/earnings';
import { newBrowserState } from './browser';
import { SAVE_FORMAT, type Manifest, type SaveDocuments } from './saveFile';

/** Version of the save format. Bump it, and add a migration, whenever what is saved changes shape (spec §18). */
export const SAVE_VERSION = 2;

type Migration = (documents: SaveDocuments) => SaveDocuments;

/** MIGRATIONS[n] upgrades a version-n save to version n + 1. */
export const MIGRATIONS: Record<number, Migration> = {
  // Phase 4: quarterly results for the Investor Relations pages, and the browser's favourites and history.
  1: (docs) => {
    const sim = docs.sim as { fundamentals: Fundamentals };
    pastQuarters(sim.fundamentals);
    const game = docs.game as Record<string, unknown> | undefined;
    return { ...docs, game: game && { ...game, browser: newBrowserState() } };
  },
};

/** Throws, with a message for the player, unless the manifest belongs to a save this version can load. */
export function checkManifest(manifest: Manifest | undefined, target = SAVE_VERSION): void {
  if (manifest?.format !== SAVE_FORMAT || !Number.isInteger(manifest.version)) {
    throw new Error('This is not a Majorsoft Doors 98 saved game.');
  }
  if (manifest.version > target) throw new Error('This game was saved by a newer version of Majorsoft Doors 98.');
}

/** Brings a save up to date, or explains why it can't be loaded. */
export function migrate(documents: SaveDocuments, migrations = MIGRATIONS, target = SAVE_VERSION): SaveDocuments {
  const { manifest } = documents;
  checkManifest(manifest, target);
  let docs = documents;
  for (let v = manifest.version; v < target; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`No upgrade from save version ${v}.`);
    docs = step(docs);
    docs.manifest = { ...docs.manifest, version: v + 1 };
  }
  return docs;
}
