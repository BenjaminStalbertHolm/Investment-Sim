import { MAINTENANCE } from './data/commodities';

/**
 * Reg-T margin (spec §12.4, §9): opening a stock position needs equity of 1 / max leverage of its value (all of it with
 * leverage off, 50% at 2:1); an account must keep equity of 25% of its longs and 30% of its shorts, and futures their own
 * maintenance margin. Below that comes a margin call.
 */
export const MAINTENANCE_LONG = 0.25;
export const MAINTENANCE_SHORT = 0.3;
/** Interest on a debit balance: this far over the policy rate, times the difficulty's loan multiplier. */
export const MARGIN_SPREAD = 0.02;

/**
 * Maintenance rates at a leverage: Reg-T's 25% and 30% up to 2:1; beyond that half the initial requirement (and 1.2 times
 * that for shorts), so a fully levered position at 15:1 isn't in a margin call the moment it opens.
 */
export const maintenanceRates = (leverage: number) => ({
  long: Math.min(MAINTENANCE_LONG, 0.5 / leverage),
  short: Math.min(MAINTENANCE_SHORT, 0.6 / leverage),
});

export interface Requirements {
  initial: number;
  maintenance: number;
}

/** What an account's positions require: stocks by value, futures by their initial margin (maintenance is 75% of it). */
export function requirements(longValue: number, shortValue: number, futuresInitial: number, leverage: number): Requirements {
  const rates = maintenanceRates(leverage);
  return {
    initial: (longValue + shortValue) / leverage + futuresInitial,
    maintenance: rates.long * longValue + rates.short * shortValue + MAINTENANCE * futuresInitial,
  };
}

/** Stock buying power: the equity above the initial requirement, levered up (spec §12.2: "buying power after"). */
export const buyingPower = (equity: number, initial: number, leverage: number) => Math.max(0, equity - initial) * leverage;
