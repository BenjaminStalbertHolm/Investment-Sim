import { dayOf } from '../sim/calendar';
import { founding } from '../sim/clients';
import { initialCommodities } from '../sim/commodities';
import { initialCompetitors } from '../sim/competitors';
import { launchFunds } from '../sim/funds';
import { newGovernance } from '../sim/governance';
import { newRegulator } from '../sim/regulator';
import { growthSeries } from '../sim/scoring';
import { pastQuarters, type Fundamentals } from '../sim/earnings';
import { STREAM_NAMES, type SimState } from '../sim/engine';
import { addTradingDays, newEvents } from '../sim/events';
import { newLoans } from '../sim/loans';
import { initialMacro } from '../sim/macro';
import { newMailState } from '../sim/mail';
import { INDEX_SIZE } from '../sim/model';
import { defaultPlayer } from '../sim/player';
import { hireJournalists } from '../sim/press';
import { completeSettings, type GameSettings } from '../sim/settings';
import { baseShortInterest } from '../sim/shorts';
import { decodeCompany } from '../world/company';
import { Rng } from '../world/rng';
import { newBrowserState } from './browser';
import { SAVE_FORMAT, type Manifest, type SaveDocuments } from './saveFile';

/** Version of the save format. Bump it, and add a migration, whenever what is saved changes shape (spec §18). */
export const SAVE_VERSION = 6;

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
  // Phase 5: the firm's logo and CEO, and the advanced settings.
  2: (docs) => {
    const sim = docs.sim as { world: { seed: string }; player: { firmName: string }; settings: GameSettings };
    const player = { ...defaultPlayer(sim.world.seed, sim.player.firmName), ...sim.player };
    return { ...docs, sim: { ...sim, player, settings: completeSettings(sim.settings) } };
  },
  // Phase 6: corporate events and the news archive, the economy, the press, clients and mail. An old game starts them
  // where it stands: its capital belongs to its founding clients, and the event generator plans from the next morning.
  3: (docs) => {
    const sim = docs.sim as Omit<SimState, 'macro' | 'events' | 'journalists' | 'clients' | 'mail'>;
    const { seed, genomes } = sim.world;
    const companies = genomes.map(decodeCompany);
    const market = sim.market as SimState['market'] & { status?: Uint8Array };
    const price = Array.from(market.lnP, Math.exp);
    market.status = new Uint8Array(companies.length);
    market.index.members = Int32Array.from(
      companies
        .map((c, i) => [c.marketCap, i])
        .sort((a, b) => b[0] - a[0] || a[1] - b[1])
        .slice(0, INDEX_SIZE)
        .map(([, i]) => i),
    );
    sim.fundamentals.dividend = Float64Array.from(companies, (c) => c.dividendYield * c.price);
    for (const k of ['events', 'macro', 'clients', 'mail'] as const) {
      (sim.rng as Record<string, readonly number[]>)[k] = Rng.stream(seed, k).state();
    }
    const nav = sim.account.cash + sim.account.positions.reduce((a, p) => a + p.shares * price[p.company], 0);
    const day = dayOf(sim.clock);
    const clients = founding(Rng.stream(seed, 'clients:founders'), nav, market.index.prevClose, sim.player.ceoName, sim.player.firmName, sim.settings.clients);
    clients.nextOffer = addTradingDays(day, 3);
    const mail = newMailState(addTradingDays(day, 7));
    mail.messages.push({ id: 1, time: sim.clock, kind: 'welcome', read: false, flagged: false, deleted: false });
    const upgraded: SimState = {
      ...(sim as SimState),
      macro: initialMacro(),
      events: newEvents(),
      journalists: hireJournalists(seed),
      clients,
      mail,
    };
    return { ...docs, sim: upgraded };
  },
  // Phase 7: short interest, a margin account with futures and goods, commodities (at their January 1998 levels), bank
  // loans, and random streams for commodities and the broker.
  4: (docs) => {
    const sim = docs.sim as SimState;
    const { seed, genomes } = sim.world;
    sim.market.shortInterest = baseShortInterest(seed, genomes.map(decodeCompany));
    sim.account = { ...sim.account, futures: [], goods: [], charges: 0 };
    sim.commodities = initialCommodities(seed);
    sim.loans = newLoans();
    for (const k of ['commodities', 'broker'] as const) sim.rng[k] = Rng.stream(seed, STREAM_NAMES[k]).state();
    return { ...docs, sim };
  },
  // Phase 8: index funds, competitors' books, governance, the regulator and the firm's record start where the game stands;
  // the firm's time-weighted growth is worked out from its closes and ledger. Fund fees come from the difficulty; the
  // game keeps the leverage it was started with.
  5: (docs) => {
    const sim = docs.sim as SimState;
    const { seed, genomes } = sim.world;
    const companies = genomes.map(decodeCompany);
    const price = Array.from(sim.market.lnP, Math.exp);
    const shares = companies.map((c) => c.sharesOutstanding);
    const day = dayOf(sim.clock);
    sim.settings = completeSettings(sim.settings);
    sim.account = { ...sim.account, funds: [] };
    sim.funds = launchFunds({ price, shares, sector: companies.map((c) => c.genes.industry), status: sim.market.status, index: sim.market.index.members });
    sim.competitors = initialCompetitors(sim.world.firms, sim.world.holdings, price, shares, day, sim.market.index.prevClose);
    sim.governance = newGovernance(day);
    sim.regulator = newRegulator();
    sim.scoring = { growth: growthSeries(sim.stats, sim.account.ledger), ledger: sim.account.ledger.length, achievements: {} };
    for (const k of ['rivals', 'governance', 'regulator'] as const) sim.rng[k] = Rng.stream(seed, STREAM_NAMES[k]).state();
    return { ...docs, sim };
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
