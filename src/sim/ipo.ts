import { decodeCompany } from '../world/company';
import { companyGenes, fit, TIERS } from '../world/generator';
import { encodeGenome } from '../world/genome';
import { INDUSTRIES } from '../world/industries';
import { RESERVED_NAMES } from '../world/lexicons/shared';
import { addTradingDays, at } from './calendar';
import type { Sim } from './context';
import { seasonOf } from './earnings';
import { enqueue } from './events';

/**
 * IPOs and stock splits (spec §11.6, §14.2 IPO Hotline). New companies are generated with fresh genomes to keep the market
 * near its starting size as takeovers and bankruptcies thin it: each week's end files enough IPOs to replace the companies
 * that left, and a few more. Filings go on the IPO Hotline's calendar two to three weeks ahead, with a price range; the
 * player can apply for an allocation, granted by a lottery weighted by reputation. The morning of its IPO the deal is
 * priced — above the range when demand is hot — and the company joins the market; its first day pops or flops.
 *
 * Companies whose shares have climbed past SPLIT_PRICE may split them when they report.
 */
export interface PendingIpo {
  id: number;
  genome: string;
  tier: number;
  filed: number;
  /** The trading day it lists. */
  day: number;
  /** The price range, and the shares on offer. */
  low: number;
  high: number;
  offered: number;
  /** Demand for the deal, hidden until it prices (about −2 to 2). */
  hot: number;
  /** Shares the player applied for. */
  applied?: number;
  /** Once listed: the price, the company's id, what the player was allotted and the first day's planned move. */
  price?: number;
  company?: number;
  allotted?: number;
  pop?: number;
}

export interface IpoState {
  pending: PendingIpo[];
  next: number;
  /** The number of listed companies the market is kept near: its size at the start. */
  target: number;
}

/** Tier weights of a new listing (Large, Mid, Small, Micro): most IPOs are small. */
const IPO_TIERS = [0.05, 0.3, 0.5, 0.15];
const LISTED_KEPT = 40;
/** Splits: a price above this, the chance a reporting company splits, and the ratios companies use. */
export const SPLIT_PRICE = 300;
const SPLIT_CHANCE = 0.3;
const RATIOS = [2, 3, 4, 5, 10, 20, 50, 100];

export const newIpos = (target: number): IpoState => ({ pending: [], next: 1, target });

/** Each week's last close: IPOs are filed to keep the market near its size, a couple a month even when it is. */
export function fileIpos(sim: Sim, day: number): void {
  const ipo = sim.s.ipo;
  const rng = sim.rng.ipo;
  let listed = 0;
  for (const s of sim.market.state.status) if (!s) listed++;
  const coming = ipo.pending.filter((p) => p.company === undefined).length;
  const need = Math.max(0, ipo.target - listed - coming);
  const count = Math.min(4, need) + (rng.chance(0.4) ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const p = draft(sim, rng, day);
    if (!p) continue;
    ipo.pending.push(p);
    enqueue(sim.s.events, at(p.day, 7 * 60), { do: 'ipo', id: p.id });
  }
  // The Hotline keeps the most recent listings.
  const done = ipo.pending.filter((p) => p.company !== undefined);
  if (done.length > LISTED_KEPT) {
    const drop = new Set(done.slice(0, done.length - LISTED_KEPT).map((p) => p.id));
    ipo.pending = ipo.pending.filter((p) => !drop.has(p.id));
  }
}

/** A new company for the market: a fresh genome in a small or mid tier, named uniquely (spec §10.4). */
function draft(sim: Sim, rng: Sim['rng']['ipo'], day: number): PendingIpo | undefined {
  const ipo = sim.s.ipo;
  const id = ipo.next++;
  const tier = 1 + rng.weighted(IPO_TIERS);
  const industry = rng.weighted(INDUSTRIES.map((i) => i.weight));
  const { min, max } = TIERS[tier];
  const marketCap = min * (max / min) ** rng.float();
  const taken = new Set(RESERVED_NAMES);
  const tickers = new Set<string>();
  const ceos = new Set<string>();
  for (const c of [...sim.companies, ...ipo.pending.filter((p) => p.company === undefined).map((p) => decodeCompany(p.genome))]) {
    taken.add(c.name.toLowerCase());
    tickers.add(c.ticker);
    ceos.add(`${c.ceo.firstName} ${c.ceo.lastName}`);
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const genes = companyGenes(sim.s.world.seed, 1_000_000 + id, { tier, industry, marketCap }, attempt);
    const genome = encodeGenome(genes);
    const c = decodeCompany(genome);
    if (!fit(c) || taken.has(c.name.toLowerCase()) || tickers.has(c.ticker) || ceos.has(`${c.ceo.firstName} ${c.ceo.lastName}`)) continue;
    // Ranges are quoted in whole dollars (cents for penny deals).
    const round = (v: number) => (c.price >= 5 ? Math.round(v) : Math.round(v * 100) / 100);
    const low = Math.max(0.1, round(c.price * 0.9));
    const high = Math.max(low + (c.price >= 5 ? 1 : 0.05), round(c.price * 1.1));
    const regime = [0.2, -0.3, -0.8, -1.5, 1][sim.market.state.regime];
    return {
      id, genome, tier, filed: day, day: addTradingDays(day, rng.int(8, 15)), low, high, offered: Math.round(c.sharesOutstanding * rng.range(0.15, 0.3)),
      hot: rng.normal(regime, 0.9),
    };
  }
  return undefined;
}

/** Applies for shares in an IPO (spec §14.2). Up to a tenth of the offering; paid for only if allotted. */
export function applyIpo(sim: Sim, id: number, shares: number): string | undefined {
  const p = sim.s.ipo.pending.find((x) => x.id === id);
  if (!p || p.company !== undefined) return 'This IPO is no longer taking applications.';
  if (!Number.isInteger(shares) || shares < 1) return 'Enter a whole number of shares.';
  if (shares > p.offered / 10) return `You can apply for at most ${Math.floor(p.offered / 10).toLocaleString('en-US')} shares.`;
  p.applied = shares;
  return undefined;
}

export function withdrawIpo(sim: Sim, id: number): boolean {
  const p = sim.s.ipo.pending.find((x) => x.id === id && x.company === undefined);
  if (!p?.applied) return false;
  p.applied = undefined;
  return true;
}

/**
 * The morning of an IPO: the deal prices (above its range when demand is hot, below when cold), the company joins the
 * market, and its first day's move waits for the opening bell. An application is allotted by lottery, weighted by the
 * firm's reputation, and smaller the hotter the deal.
 */
export function listIpo(sim: Sim, id: number): void {
  const p = sim.s.ipo.pending.find((x) => x.id === id);
  if (!p || p.company !== undefined) return;
  const rng = sim.rng.ipo;
  const mid = (p.low + p.high) / 2;
  const hot = Math.max(-1.5, Math.min(1.5, p.hot));
  const price = Math.max(0.1, Math.round(mid * (1 + 0.12 * hot) * 100) / 100);
  p.pop = hot >= 0 ? rng.range(0.03, 0.2) + 0.3 * hot : rng.range(-0.08, 0.02) + 0.1 * hot;
  p.price = price;
  const company = sim.addCompany(p.genome, p.tier, price, price * (1 + 0.3 * p.pop));
  p.company = company;
  const s = sim.market.state;
  s.jump[company] += Math.log1p(p.pop);
  s.jumpBars[company] = rng.int(2, 8);
  sim.report({ kind: 'ipo', company, level: price, amount: price * p.offered, prev: p.low, expect: p.high });
  if (!p.applied) return;
  const reputation = sim.s.clients.reputation;
  const lucky = rng.chance(0.25 + 0.6 * (reputation / 100));
  const fill = Math.min(1, Math.max(0.1, 0.8 - 0.3 * Math.max(0, hot) + rng.range(-0.1, 0.1)));
  let allotted = lucky ? Math.floor(p.applied * fill) : 0;
  if (allotted && !sim.payable(allotted * price)) allotted = 0;
  p.allotted = allotted;
  if (allotted) sim.allot(company, allotted, price);
  sim.send({ kind: 'ipo', company, shares: p.applied, amount: price, contracts: allotted });
}

/**
 * The morning a company reports (spec §11.6: stock split): a company whose price has climbed past SPLIT_PRICE may split,
 * to bring it back to around $80.
 */
export function splits(sim: Sim, day: number, exempt: (company: number) => boolean = () => false): void {
  const { index } = seasonOf(day);
  if (index < 0) return;
  const { slot } = sim.model;
  const { status } = sim.market.state;
  const { price } = sim.market;
  const rng = sim.rng.ipo;
  for (let i = 0; i < slot.length; i++) {
    if (slot[i] !== index || status[i] || price[i] < SPLIT_PRICE || exempt(i)) continue;
    if (!rng.chance(SPLIT_CHANCE)) continue;
    const ratio = RATIOS.reduce((best, r) => (Math.abs(Math.log(price[i] / r / 80)) < Math.abs(Math.log(price[i] / best / 80)) ? r : best));
    sim.split(i, ratio);
  }
}

