import { INDUSTRIES } from '../world/industries';
import type { Rng } from '../world/rng';
import { OPEN, isTradingDay, nextTradingDay, previousTradingDay, weekday } from './calendar';
import { CYCLICALITY, MACRO_START, RATE_DURATION } from './data/macro';
import type { Market } from './market';
import type { MacroKind } from './news';

/**
 * The macro layer (spec §11.4): the Federal Reservoir's policy rate, and inflation, growth, unemployment and consumer
 * confidence as simple autoregressive series with shocks, released on a calendar.
 */
export interface MacroState {
  rate: number;
  /** Year-on-year CPI inflation. */
  inflation: number;
  /** Annualised quarterly GDP growth. */
  gdp: number;
  unemployment: number;
  /** Consumer confidence index (1985 = 100). */
  confidence: number;
}

export const initialMacro = (): MacroState => ({ ...MACRO_START });

/** What a release or meeting announced: the new level, the one before, what economists expected. */
export interface Release {
  kind: MacroKind;
  level: number;
  prev: number;
  expect: number;
  /** The surprise in standard deviations, positive = good for stocks. */
  surprise: number;
  /** Federal Reservoir minutes: −1 dovish … +1 hawkish (more hikes to come). */
  tone?: number;
}

const day0 = (year: number, month: number) => Date.UTC(year, month, 1) / 86_400_000;
const ymd = (day: number) => {
  const d = new Date(day * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
};
/** The nth given weekday of a month (nth −1: the last). */
function nthWeekday(year: number, month: number, wd: number, nth: number): number {
  if (nth > 0) {
    const first = day0(year, month);
    return first + ((wd - weekday(first) + 7) % 7) + 7 * (nth - 1);
  }
  const last = day0(year, month + 1) - 1;
  return last - ((weekday(last) - wd + 7) % 7);
}
const onOrAfter = (day: number) => (isTradingDay(day) ? day : nextTradingDay(day));
const onOrBefore = (day: number) => (isTradingDay(day) ? day : previousTradingDay(day));

/** Months (0–11) of the Federal Reservoir's eight meetings a year. */
const FED_MONTHS = [0, 2, 4, 5, 7, 8, 10, 11];
const GDP_MONTHS = [0, 3, 6, 9];

/**
 * The release calendar (spec §11.4): the jobs report on the first Friday, CPI mid-month, GDP after each quarter, consumer
 * confidence on the last Tuesday, and the Federal Reservoir's decision at 14:15 on the third Tuesday of its months.
 * Returns the minute of the day each happens on `day`.
 */
export function releasesOn(day: number): { minute: number; kind: MacroKind }[] {
  if (!isTradingDay(day)) return [];
  const { year, month } = ymd(day);
  const out: { minute: number; kind: MacroKind }[] = [];
  if (onOrAfter(nthWeekday(year, month, 5, 1)) === day) out.push({ minute: 8 * 60 + 30, kind: 'jobs' });
  if (onOrAfter(day0(year, month) + 14) === day) out.push({ minute: 8 * 60 + 30, kind: 'cpi' });
  if (GDP_MONTHS.includes(month) && onOrBefore(nthWeekday(year, month, 4, -1)) === day) out.push({ minute: 8 * 60 + 30, kind: 'gdp' });
  if (onOrBefore(nthWeekday(year, month, 2, -1)) === day) out.push({ minute: OPEN + 30, kind: 'confidence' });
  if (FED_MONTHS.includes(month) && onOrAfter(nthWeekday(year, month, 2, 3)) === day) out.push({ minute: 14 * 60 + 15, kind: 'fed' });
  return out;
}

// Regime order: calm, nervous, turbulent, crash, euphoric (market.ts).
const GDP_BIAS = [0.003, -0.003, -0.01, -0.02, 0.008];
const CONFIDENCE_BIAS = [1, -2, -5, -10, 3];
const SD = { jobs: 0.001, cpi: 0.0015, gdp: 0.01, confidence: 4 };
/** Stock market reaction to a one-standard-deviation surprise, before beta and cyclicality. */
const REACTION = 0.004;

/** A release comes out: the series moves, and the surprise against expectations moves the market. */
export function release(kind: MacroKind, m: MacroState, market: Market, rng: Rng): Release {
  const regime = market.state.regime;
  let r: Release;
  switch (kind) {
    case 'jobs': {
      const expect = m.unemployment + 0.05 * (0.05 - m.unemployment) - 0.03 * (m.gdp - 0.025) / 12 + (regime >= 2 ? 0.001 : 0);
      const level = Math.max(0.025, expect + rng.normal(0, SD.jobs));
      r = { kind, level, prev: m.unemployment, expect, surprise: (expect - level) / SD.jobs };
      m.unemployment = level;
      break;
    }
    case 'cpi': {
      const expect = 0.95 * m.inflation + 0.05 * 0.025 + 0.02 * (m.gdp - 0.025);
      const level = expect + rng.normal(0, SD.cpi);
      r = { kind, level, prev: m.inflation, expect, surprise: -(level - expect) / SD.cpi };
      m.inflation = level;
      break;
    }
    case 'gdp': {
      const expect = 0.6 * m.gdp + 0.4 * 0.03 + GDP_BIAS[regime];
      const level = expect + rng.normal(0, SD.gdp);
      r = { kind, level, prev: m.gdp, expect, surprise: (level - expect) / SD.gdp };
      m.gdp = level;
      break;
    }
    case 'confidence': {
      const target = 110 + 400 * (m.gdp - 0.025) - 300 * (m.unemployment - 0.05);
      const expect = m.confidence + 0.2 * (target - m.confidence) + CONFIDENCE_BIAS[regime];
      const level = Math.max(30, expect + rng.normal(0, SD.confidence));
      r = { kind, level, prev: m.confidence, expect, surprise: (level - expect) / SD.confidence };
      m.confidence = level;
      break;
    }
    case 'fed':
      return fed(m, market, rng);
  }
  const good = Math.max(-3, Math.min(3, r.surprise));
  const { beta, sector } = market.model;
  const { jump, jumpBars, lnV } = market.state;
  for (let i = 0; i < jump.length; i++) {
    const move = REACTION * good * beta[i] * CYCLE[sector[i]];
    jump[i] += move;
    lnV[i] += 0.5 * move;
    if (!jumpBars[i]) jumpBars[i] = 3;
  }
  return r;
}

const CYCLE = INDUSTRIES.map((i) => CYCLICALITY[i.id] ?? 1);
const DURATION = INDUSTRIES.map((i) => RATE_DURATION[i.id] ?? 4);

/** Where a Taylor rule puts the policy rate: a 3% neutral rate plus inflation, leaning against inflation and growth. */
const taylor = (m: MacroState, crash: boolean) =>
  0.03 + m.inflation + 0.5 * (m.inflation - 0.02) + 0.5 * (m.gdp - 0.025) - (crash ? 0.01 : 0);

/**
 * A Federal Reservoir meeting: the rate moves 25 or 50 basis points towards the Taylor rule, usually as expected.
 * Every sector's value re-rates by its duration (growth most, banks the other way); the surprise moves prices at once.
 */
function fed(m: MacroState, market: Market, rng: Rng): Release {
  const crash = market.state.regime === 3;
  const target = taylor(m, crash);
  const gap = target - m.rate;
  const step = Math.abs(gap) >= 0.01 ? 0.005 : Math.abs(gap) >= 0.00375 ? 0.0025 : 0;
  const expect = m.rate + Math.sign(gap) * (Math.abs(gap) >= 0.00375 ? 0.0025 : 0);
  let level = m.rate;
  if (crash && rng.chance(0.5)) level -= 0.005;
  else if (step && rng.chance(0.75)) level += Math.sign(gap) * step;
  else if (!step && rng.chance(0.08)) level += Math.sign(gap || rng.float() - 0.5) * 0.0025;
  level = Math.max(0.0025, Math.round(level / 0.0025) * 0.0025);
  const change = level - m.rate;
  const surprise = level - expect;
  const prev = m.rate;
  m.rate = level;
  const { beta, sector } = market.model;
  const { jump, jumpBars, lnV } = market.state;
  for (let i = 0; i < jump.length; i++) {
    lnV[i] -= DURATION[sector[i]] * change;
    jump[i] -= (DURATION[sector[i]] + 2 * beta[i]) * surprise;
    if (!jumpBars[i]) jumpBars[i] = 3;
  }
  market.rate = level;
  const tone = Math.max(-1, Math.min(1, (taylor(m, crash) - level) / 0.01));
  return { kind: 'fed', level, prev, expect, surprise: -surprise / 0.0025, tone };
}
