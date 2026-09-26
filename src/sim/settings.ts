export type Difficulty = 'easy' | 'medium' | 'hard' | 'custom';
export type Level = 'low' | 'normal' | 'high';

/**
 * Difficulty and advanced settings (spec §9). The market and the broker use some now; the rest are chosen at the
 * start and saved for the systems of later phases (DECISIONS.md lists which).
 */
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
  /** Corporate event frequency multiplier (Phase 6). */
  events: number;
  /** Maximum leverage on stocks, e.g. 2 for 2:1 (Phase 7). */
  maxLeverage: number;
  /** Trading days to meet a margin call (Phase 7). */
  marginGrace: number;
  shortSelling: boolean;
  futures: boolean;
  /** Clients and mandates (Phase 6); off is a pure sandbox with the firm's own capital. */
  clients: boolean;
  /** Low patience is forgiving, high demanding. */
  clientPatience: Level;
  insiderTips: boolean;
  /** Share of tips that are genuine (Phase 6). */
  tipReliability: number;
  /** How closely the Securities Oversight Bureau looks, and how strict its audits are (Phase 8). */
  scrutiny: Level;
  /** Competitor aggressiveness (Phase 8). */
  aggression: Level;
  /** Loan interest multiplier (Phase 7). */
  loanRates: number;
  darkWeb: boolean;
  /** Added to dark web success chances, e.g. 0.1 for +10 points (Phase 9). */
  darkWebOdds: number;
  /** Heat decay multiplier (Phase 8). */
  heatDecay: number;
  /** Single autosave slot, no reloading. */
  ironman: boolean;
  /** Cash can go negative and the game never fails. */
  noBankruptcy: boolean;
  /** Year shown for the start date (cosmetic: the calendar is 1998's). */
  startYear: number;
  /** Optional fun modules (spec §16C); they don't make a game Custom. */
  modules: { geopolitics: boolean; periodEvents: boolean; gags: boolean };
}

const COMMON = {
  events: 1, shortSelling: true, futures: true, clients: true, insiderTips: true, darkWeb: true, ironman: false,
  noBankruptcy: false, startYear: 1998, modules: { geopolitics: false, periodEvents: false, gags: false },
};

export const DIFFICULTIES: Record<Exclude<Difficulty, 'custom'>, GameSettings> = {
  easy: {
    ...COMMON, difficulty: 'easy', startingCapital: 100_000, commission: { fixed: 9.95, rate: 0 },
    spread: 0.5, smallCapSpread: 1, volatility: 0.8, crashes: 0.5, impact: 0.5, maxLeverage: 2, marginGrace: 3,
    clientPatience: 'low', tipReliability: 0.6, scrutiny: 'low', aggression: 'low', loanRates: 0.75, darkWebOdds: 0.1,
    heatDecay: 1.5,
  },
  medium: {
    ...COMMON, difficulty: 'medium', startingCapital: 1_000_000, commission: { fixed: 19.95, rate: 0 },
    spread: 1, smallCapSpread: 1, volatility: 1, crashes: 1, impact: 1, maxLeverage: 2, marginGrace: 2,
    clientPatience: 'normal', tipReliability: 0.4, scrutiny: 'normal', aggression: 'normal', loanRates: 1, darkWebOdds: 0,
    heatDecay: 1,
  },
  hard: {
    ...COMMON, difficulty: 'hard', startingCapital: 10_000_000, commission: { fixed: 29.95, rate: 0.0005 },
    spread: 1, smallCapSpread: 2, volatility: 1.25, crashes: 2, impact: 1, maxLeverage: 1.5, marginGrace: 1,
    clientPatience: 'high', tipReliability: 0.25, scrutiny: 'high', aggression: 'high', loanRates: 1.5, darkWebOdds: -0.1,
    heatDecay: 0.5,
  },
};

/** Settings that don't change how hard the game is, so changing them keeps the difficulty label. */
const COSMETIC = new Set<keyof GameSettings>(['difficulty', 'startYear', 'modules']);

/**
 * The difficulty label for a set of settings (spec §9): the preset they match, else Custom. Changing any value
 * makes it Custom; changing it back restores the label.
 */
export function difficultyOf(settings: GameSettings): Difficulty {
  const key = (s: GameSettings) =>
    JSON.stringify(Object.entries(s).filter(([k]) => !COSMETIC.has(k as keyof GameSettings)).sort(([a], [b]) => a.localeCompare(b)));
  const mine = key(settings);
  return (Object.keys(DIFFICULTIES) as Exclude<Difficulty, 'custom'>[]).find((d) => key(DIFFICULTIES[d]) === mine) ?? 'custom';
}

/** Applies a change and relabels the difficulty. */
export function changeSettings(settings: GameSettings, change: Partial<GameSettings>): GameSettings {
  const next = { ...settings, ...change };
  return { ...next, difficulty: difficultyOf(next) };
}

/** Fills in settings a save from before Phase 5 doesn't have, from its difficulty's preset. */
export function completeSettings(saved: Partial<GameSettings> & Pick<GameSettings, 'difficulty'>): GameSettings {
  const preset = DIFFICULTIES[saved.difficulty === 'custom' ? 'medium' : saved.difficulty];
  return { ...preset, ...saved };
}
