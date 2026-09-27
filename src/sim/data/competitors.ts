// How competitor firms invest (spec §6, §16): one rule set per strategy. Data only: sim/competitors.ts applies them.
import type { Strategy } from '../../world/presetFirms';

export interface StrategyRules {
  /** Management fee a year, taken from the fund (spec §16: fee structure). */
  fee: number;
  /** Stocks the strategy wants to hold, and the share of assets it keeps in cash (by market regime for macro). */
  holdings: number;
  cash: number;
  /** Most of any company it will own. */
  maxStake: number;
  /** Share of the way to its targets a week's trading goes. */
  turnover: number;
  /** New client money a quarter as a share of assets, and how strongly a year's return over the MAJOR 500 moves it. */
  inflow: number;
  chase: number;
}

export const STRATEGIES: Readonly<Record<Strategy, StrategyRules>> = {
  // The whole market of large and mid caps, weighted by value; clients pour in, whatever the returns.
  index: { fee: 0.001, holdings: 0, cash: 0.01, maxStake: 0.095, turnover: 0.25, inflow: 0.02, chase: 0.1 },
  // Blue chips, weighted by value, and a good deal of cash.
  balanced: { fee: 0.008, holdings: 100, cash: 0.4, maxStake: 0.05, turnover: 0.2, inflow: 0.005, chase: 0.4 },
  momentum: { fee: 0.01, holdings: 40, cash: 0.03, maxStake: 0.095, turnover: 0.3, inflow: 0, chase: 0.8 },
  growth: { fee: 0.01, holdings: 40, cash: 0.03, maxStake: 0.095, turnover: 0.3, inflow: 0.005, chase: 0.6 },
  value: { fee: 0.01, holdings: 40, cash: 0.05, maxStake: 0.095, turnover: 0.2, inflow: 0, chase: 0.5 },
  stockPicking: { fee: 0.01, holdings: 50, cash: 0.04, maxStake: 0.095, turnover: 0.25, inflow: 0, chase: 0.6 },
  quant: { fee: 0.02, holdings: 100, cash: 0.05, maxStake: 0.05, turnover: 0.5, inflow: 0, chase: 0.8 },
  macro: { fee: 0.02, holdings: 40, cash: 0.1, maxStake: 0.05, turnover: 0.5, inflow: 0, chase: 0.8 },
  activist: { fee: 0.02, holdings: 8, cash: 0.1, maxStake: 0.15, turnover: 0.1, inflow: 0, chase: 0.5 },
};

/** Macro firms' cash by market regime (market.ts REGIMES: calm, nervous, turbulent, crash, euphoric). */
export const MACRO_CASH = [0.1, 0.3, 0.5, 0.6, 0.05];
/** Sectors a macro firm rotates into: the best performers over this many trading days. */
export const MACRO_SECTORS = 5;
export const MACRO_LOOKBACK = 65;
/** Active strategies leave micro caps alone (their spreads would eat the returns). */
export const MIN_CAP = 300e6;
/** The index strategy's universe: large and mid caps. */
export const INDEX_MIN_CAP = 2e9;
/** Most of any company all institutions, insiders and the player together may own. */
export const OWNERSHIP_CAP = 0.95;
/** Price impact of the week's net competitor trading, relative to the square-root law the player faces. */
export const FLOW_IMPACT = 0.5;
/** Quarterly client flows never exceed this share of assets either way. */
export const MAX_FLOW = 0.15;
/** Days after a quarter's end that its holdings filing (spec §14: "45-day delayed like 13F filings") is published. */
export const FILING_DELAY = 45;
/** Holdings a filing lists. */
export const FILING_SIZE = 50;
