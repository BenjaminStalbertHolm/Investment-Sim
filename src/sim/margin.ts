import { MAINTENANCE } from './data/commodities';

/**
 * Reg-T margin (spec §12.4, §9): opening a stock position needs equity of 1 / max leverage of its value (50% at 2:1, two
 * thirds at Hard's 1.5:1); an account must keep equity of 25% of its longs and 30% of its shorts, and futures their own
 * maintenance margin. Below that comes a margin call.
 */
export const MAINTENANCE_LONG = 0.25;
export const MAINTENANCE_SHORT = 0.3;
/** Interest on a debit balance: this far over the policy rate, times the difficulty's loan multiplier. */
export const MARGIN_SPREAD = 0.02;

export interface Requirements {
  initial: number;
  maintenance: number;
}

/** What an account's positions require: stocks by value, futures by their initial margin (maintenance is 75% of it). */
export function requirements(longValue: number, shortValue: number, futuresInitial: number, leverage: number): Requirements {
  return {
    initial: (longValue + shortValue) / leverage + futuresInitial,
    maintenance: MAINTENANCE_LONG * longValue + MAINTENANCE_SHORT * shortValue + MAINTENANCE * futuresInitial,
  };
}

/** Stock buying power: the equity above the initial requirement, levered up (spec §12.2: "buying power after"). */
export const buyingPower = (equity: number, initial: number, leverage: number) => Math.max(0, equity - initial) * leverage;
