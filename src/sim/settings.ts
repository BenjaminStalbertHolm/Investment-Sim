export type Difficulty = 'easy' | 'medium' | 'hard' | 'custom';

/** The difficulty settings the market and the broker use (spec §9). Later phases add their own. */
export interface GameSettings {
  difficulty: Difficulty;
  startingCapital: number;
  /** Charged once per order: a fixed fee plus a share of the value traded. */
  commission: { fixed: number; rate: number };
  /** Multiplier on quoted spreads… */
  spread: number;
  /** …and a further one for companies under $2B ("wide on small caps"). */
  smallCapSpread: number;
  /** Market volatility multiplier. */
  volatility: number;
  /** Crash and bubble frequency multiplier. */
  crashes: number;
  /** Market impact of the player's orders. */
  impact: number;
}

export const DIFFICULTIES: Record<Exclude<Difficulty, 'custom'>, GameSettings> = {
  easy: {
    difficulty: 'easy', startingCapital: 100_000, commission: { fixed: 9.95, rate: 0 },
    spread: 0.5, smallCapSpread: 1, volatility: 0.8, crashes: 0.5, impact: 0.5,
  },
  medium: {
    difficulty: 'medium', startingCapital: 1_000_000, commission: { fixed: 19.95, rate: 0 },
    spread: 1, smallCapSpread: 1, volatility: 1, crashes: 1, impact: 1,
  },
  hard: {
    difficulty: 'hard', startingCapital: 10_000_000, commission: { fixed: 29.95, rate: 0.0005 },
    spread: 1, smallCapSpread: 2, volatility: 1.25, crashes: 2, impact: 1,
  },
};
