import type { Company } from '../world/company';
import type { Rng } from '../world/rng';
import { isTradingDay, nextTradingDay } from './calendar';
import type { Market } from './market';
import { BAR_YEARS, SEASON_DAYS, type Model } from './model';

/** Reported fundamentals: trailing-twelve-month revenue and net income, and where they are heading. */
export interface Fundamentals {
  revenue: Float64Array;
  income: Float64Array;
  /** Expected annual revenue growth; fades towards the cost of equity. */
  growth: Float64Array;
  /** Current net margin; reverts towards the company's own. */
  margin: Float64Array;
  /** Day of the latest report, -1 before the first. */
  reported: Int32Array;
  /** The last QUARTERS quarters' revenue and net income, row per company, oldest first (spec §14 IR page). */
  quarterRevenue: Float32Array;
  quarterIncome: Float32Array;
  /** First day of the current season, and its economy-wide surprise that every report in it shares. */
  season: number;
  seasonSurprise: number;
  /** Annual dividend per share, in dollars; paid a quarter at a time on the day the company reports (spec §15.2). */
  dividend: Float64Array;
}

/** Mean economy-wide surprise of a season starting in each regime (calm … euphoric): crashes precede bad seasons. */
const SEASON_BIAS = [0.2, -0.3, -0.8, -1.2, 0.5];
/** How much a report follows the season: correlation of each surprise with the economy's. */
const ECONOMY = 0.4;
/** Quarters of results kept per company. */
export const QUARTERS = 8;

/** Starting fundamentals, backed out of market cap: a P/E that rises with growth, or a P/S for loss-makers. */
export function initialFundamentals(companies: readonly Company[]): Fundamentals {
  const n = companies.length;
  const f: Fundamentals = {
    revenue: new Float64Array(n),
    income: new Float64Array(n),
    growth: Float64Array.from(companies, (c) => c.revenueGrowth),
    margin: Float64Array.from(companies, (c) => c.netMargin),
    reported: new Int32Array(n).fill(-1),
    quarterRevenue: new Float32Array(n * QUARTERS),
    quarterIncome: new Float32Array(n * QUARTERS),
    season: -1,
    seasonSurprise: 0,
    dividend: Float64Array.from(companies, (c) => c.dividendYield * c.price),
  };
  companies.forEach((c, i) => {
    if (c.netMargin > 0.01) {
      f.income[i] = c.marketCap / Math.min(60, Math.max(7, 12 + 45 * c.revenueGrowth));
      f.revenue[i] = f.income[i] / c.netMargin;
    } else {
      f.revenue[i] = c.marketCap / Math.min(15, Math.max(0.5, 1 + 10 * Math.max(0, c.revenueGrowth)));
      f.income[i] = f.revenue[i] * c.netMargin;
    }
  });
  pastQuarters(f);
  return f;
}

/** Fills in the quarters reported before the game: a quarter of the trailing year, shrinking back at its growth. */
export function pastQuarters(f: Fundamentals): void {
  f.quarterRevenue = new Float32Array(f.revenue.length * QUARTERS);
  f.quarterIncome = new Float32Array(f.revenue.length * QUARTERS);
  f.revenue.forEach((revenue, i) => {
    for (let k = 0; k < QUARTERS; k++) {
      const quarter = (revenue / 4) * Math.exp((-f.growth[i] * (QUARTERS - 1 - k)) / 4);
      f.quarterRevenue[i * QUARTERS + k] = quarter;
      f.quarterIncome[i * QUARTERS + k] = quarter * (f.income[i] / revenue);
    }
  });
}

/** First trading day on or after the 14th of January, April, July and October: two weeks after a quarter ends. */
function seasonStart(year: number, quarter: number): number {
  let day = Date.UTC(year, quarter * 3, 14) / 86_400_000;
  while (!isTradingDay(day)) day++;
  return day;
}

const yearOf = (day: number) => new Date(day * 86_400_000).getUTCFullYear();

function addTradingDays(day: number, count: number): number {
  for (let k = 0; k < count; k++) day = nextTradingDay(day);
  return day;
}

/** The earnings season a trading day falls in: its first day, and which trading day of it this is (-1 outside). */
export function seasonOf(day: number): { start: number; index: number } {
  const year = yearOf(day);
  const starts = [seasonStart(year, 3), seasonStart(year, 2), seasonStart(year, 1), seasonStart(year, 0), seasonStart(year - 1, 3)];
  const start = starts.find((s) => s <= day)!;
  let index = 0;
  for (let d = start; d < day && index < SEASON_DAYS; d = nextTradingDay(d)) index++;
  return { start, index: index < SEASON_DAYS ? index : -1 };
}

/**
 * Quarters are numbered year × 4 + (0 … 3). A season reports the quarter that ended before it: January's season
 * reports the previous year's fourth quarter.
 */
export function quarterReported(day: number): number {
  const start = new Date(seasonOf(day).start * 86_400_000);
  return start.getUTCFullYear() * 4 + start.getUTCMonth() / 3 - 1;
}

/** The day a company with this season slot reports a quarter. */
export function reportDay(quarter: number, slot: number): number {
  const season = quarter + 1;
  return addTradingDays(seasonStart(Math.floor(season / 4), season % 4), slot);
}

/** The next day (today included) a company with this season slot reports. */
export function nextReport(day: number, slot: number): number {
  for (let year = yearOf(day) - 1; ; year++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const report = addTradingDays(seasonStart(year, quarter), slot);
      if (report >= day) return report;
    }
  }
}

/**
 * Quarterly reports staggered over each ~6-week season (spec §11.6–11.7), released before the open. A beat or miss
 * moves the price ±2–20% (more for volatile, low-quality companies) over 1–6 bars; value moves with it, a little
 * further for high-quality companies (the drift continues) and a little less for poor ones (it partly reverses).
 * Returns the companies that reported, with their moves.
 */
export function reportEarnings(
  day: number,
  f: Fundamentals,
  market: Market,
  companies: readonly Company[],
  rng: Rng,
  /** What short sellers make of the move (spec §12.4): good news squeezes heavily shorted stocks. */
  squeeze: (company: number, move: number) => number = (_, move) => move,
): { company: number; move: number }[] {
  const { start, index } = seasonOf(day);
  if (index < 0) return [];
  if (f.season !== start) {
    f.season = start;
    f.seasonSurprise = rng.normal(SEASON_BIAS[market.state.regime], 1);
  }
  const { model } = market;
  const { jump, jumpBars, lnV, status } = market.state;
  const reporting: { company: number; move: number }[] = [];
  for (let i = 0; i < model.count; i++) {
    if (model.slot[i] !== index || status[i]) continue;
    const z = ECONOMY * f.seasonSurprise + Math.sqrt(1 - ECONOMY ** 2) * rng.normal();
    const size = Math.min(1.8, Math.max(0.5, model.volatility[i] / 0.35)) * (1.25 - 0.5 * model.quality[i]);
    const move = Math.sign(z) * Math.min(0.4, (0.02 + 0.06 * Math.abs(z) ** 1.5) * size);
    jump[i] += squeeze(i, move);
    jumpBars[i] = rng.int(1, 6);
    lnV[i] += move * (1 + 0.4 * (model.quality[i] - 0.5));
    updateFundamentals(f, i, move, companies[i].netMargin, model);
    f.reported[i] = day;
    reporting.push({ company: i, move });
  }
  return reporting;
}

function updateFundamentals(f: Fundamentals, i: number, move: number, ownMargin: number, model: Model): void {
  const longRun = model.drift[i] / BAR_YEARS;
  f.revenue[i] *= Math.exp(f.growth[i] / 4 + 0.25 * move);
  f.margin[i] += 0.15 * (ownMargin - f.margin[i]) + 0.1 * move;
  f.growth[i] += 0.1 * (longRun - f.growth[i]) + 0.2 * move;
  // Trailing twelve months: the new quarter replaces a quarter of the old total.
  f.income[i] = 0.75 * f.income[i] + 0.25 * f.revenue[i] * f.margin[i];
  const row = i * QUARTERS;
  for (const quarters of [f.quarterRevenue, f.quarterIncome]) quarters.copyWithin(row, row + 1, row + QUARTERS);
  f.quarterRevenue[row + QUARTERS - 1] = f.revenue[i] / 4;
  f.quarterIncome[row + QUARTERS - 1] = (f.revenue[i] * f.margin[i]) / 4;
}
