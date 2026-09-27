import type { Company } from '../world/company';
import { Rng } from '../world/rng';

/**
 * Short selling (spec §12.4). Every company has a short interest: the share of its float other investors have sold short.
 * Lenders make a share of the float available to borrow; the busier that pool, the dearer the borrow fee (0.3% a year
 * for general collateral, up to 60% for the hardest to borrow), the likelier a lender recalls shares, and the harder a
 * stock squeezes on good news. Large caps are always available.
 */

/** Share of a company's float lenders make available to borrow. */
export const LENDABLE = 0.35;
/** The fee on stocks that are easy to borrow ("general collateral"), and the most any stock costs. */
export const GC_FEE = 0.003;
export const MAX_FEE = 0.6;
/** A stock is hard to borrow once its fee passes this. */
export const HARD_TO_BORROW = 0.01;
/** Companies worth this much or more are always available to borrow, at the general collateral fee. */
export const ALWAYS_AVAILABLE = 10e9;
/** Days' notice a recall gives: the short must be covered by then or the broker buys it in (spec §12.4). */
export const RECALL_DAYS = 2;
/** Short interest drifts back to its usual level at this rate a day. */
const REVERSION = 0.05;

/** Each company's usual short interest: higher for poorly run, volatile companies. Derived from the genomes, never saved. */
export function baseShortInterest(seed: string, companies: readonly Company[]): Float32Array {
  const rng = Rng.stream(seed, 'shorts:base');
  return Float32Array.from(companies, (c) => {
    const typical = 0.01 + 0.12 * (1 - c.quality) ** 2 * Math.max(0.5, c.volatility / 0.4);
    return Math.min(0.45, Math.max(0.003, typical * Math.exp(0.5 * rng.normal())));
  });
}

/** The annual borrow fee at a utilisation of the lendable shares. */
export function borrowFee(utilization: number): number {
  return utilization <= 0.5 ? GC_FEE : Math.min(MAX_FEE, GC_FEE + MAX_FEE * ((utilization - 0.5) / 0.5) ** 2);
}

/** What the broker's stock loan desk says about borrowing a company's shares. */
export interface Borrow {
  /** Shares it can still locate. */
  available: number;
  /** Annual fee. */
  fee: number;
  /** Short interest, yours included, as a share of the float. */
  shortInterest: number;
  /** Shares shorted as a share of those lendable. */
  utilization: number;
}

/**
 * `marketShort` is other investors' short interest (share of float), `mine` the shares the firm is short and `pending`
 * those its open orders would short.
 */
export function borrowOf(cap: number, floatShares: number, marketShort: number, mine: number, pending: number): Borrow {
  const lendable = LENDABLE * floatShares;
  const shorted = marketShort * floatShares + mine;
  const utilization = lendable > 0 ? shorted / lendable : 1;
  const shortInterest = floatShares > 0 ? shorted / floatShares : 0;
  if (cap >= ALWAYS_AVAILABLE) return { available: Math.max(0, Math.floor(lendable - mine - pending)), fee: GC_FEE, shortInterest, utilization };
  return { available: Math.max(0, Math.floor(lendable - shorted - pending)), fee: borrowFee(utilization), shortInterest, utilization };
}

/** Chance a day that a lender recalls borrowed shares: only for smaller companies, and far likelier when borrow is tight. */
export const recallChance = (b: Borrow, cap: number) => (cap >= ALWAYS_AVAILABLE ? 0 : 0.001 + 0.3 * Math.max(0, b.utilization - 0.6) ** 2);

/** How much further good news lifts a heavily shorted stock, as shorts scramble to cover (spec §12.4). */
export const squeeze = (shortInterest: number) => 1 + 3 * Math.max(0, shortInterest - 0.1);

/** Each morning short interest drifts back towards its usual level. */
export function revertShortInterest(current: Float32Array, base: Float32Array): void {
  for (let i = 0; i < current.length; i++) current[i] += REVERSION * (base[i] - current[i]);
}

/** Bad news brings the short sellers in: a fall of `move` raises short interest. */
export const pileIn = (shortInterest: number, move: number) => Math.min(0.6, shortInterest * (1 + 2 * Math.abs(move)));
