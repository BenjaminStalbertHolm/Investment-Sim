import type { Company } from '../world/company';
import { Rng } from '../world/rng';
import { BAR_MINUTES, CLOSE, OPEN, previousTradingDay } from './calendar';
import type { Bar } from './history';
import { PROFILE } from './market';

/**
 * History that is generated rather than stored (spec §11.3, §18): five years of daily bars before the start, and
 * 5-minute bars for sessions nobody was watching. Both are seeded, so they come out the same every time.
 */

/** Five years of trading days before the start. */
export const PREGAME_DAYS = 1260;
/** The late-90s bull market leading up to the start: +15% a year at 14% volatility. */
const PREGAME_DRIFT = 0.15;
const PREGAME_VOL = 0.14;

/** The trading days before `start`, oldest first. */
export function pregameDays(start: number): number[] {
  const days: number[] = [];
  for (let d = previousTradingDay(start); days.length < PREGAME_DAYS; d = previousTradingDay(d)) days.push(d);
  return days.reverse();
}

/** The market's log level on each pre-game day relative to the start; the last day is 0. */
export function pregameMarket(seed: string, count: number): Float64Array {
  const rng = Rng.stream(seed, 'pregame:market');
  const path = new Float64Array(count);
  const dt = 1 / 252;
  for (let k = count - 2; k >= 0; k--) path[k] = path[k + 1] - (PREGAME_DRIFT * dt + PREGAME_VOL * Math.sqrt(dt) * rng.normal());
  return path;
}

/** Daily bars around a path of log closes, with seeded opens, highs, lows and volumes. */
function barsAround(rng: Rng, days: readonly number[], logCloses: Float64Array, dailyVol: number, adv: number): Bar[] {
  const bars: Bar[] = [];
  let prev = Math.exp(logCloses[0]);
  logCloses.forEach((lc, k) => {
    const close = Math.exp(lc);
    const open = prev * Math.exp(0.25 * dailyVol * rng.normal());
    const high = Math.max(open, close) * Math.exp(0.4 * dailyVol * Math.abs(rng.normal()));
    const low = Math.min(open, close) * Math.exp(-0.4 * dailyVol * Math.abs(rng.normal()));
    const busy = 0.7 + (0.3 * Math.abs(Math.log(close / prev))) / dailyVol;
    bars.push({ time: (days[k] * 1440 + CLOSE) * 60, open, high, low, close, volume: adv * busy * Math.exp(0.4 * rng.normal() - 0.08) });
    prev = close;
  });
  return bars;
}

/**
 * A company's daily bars before the start: a seeded walk ending at its starting price that moves with the market by
 * its beta and trends with its growth, starting at its IPO when that was less than five years ago.
 */
export function pregameBars(seed: string, id: number, company: Company, days: readonly number[], market: Float64Array): Bar[] {
  const rng = Rng.stream(seed, `pregame:${id}`);
  const length = Math.min(days.length, Math.max(40, company.founded * 252));
  const own = Math.sqrt(Math.max(company.volatility ** 2 - (company.beta * PREGAME_VOL) ** 2, (0.4 * company.volatility) ** 2));
  const trend = (0.5 * (Math.min(0.6, Math.max(-0.3, company.revenueGrowth)) - 0.08)) / 252;
  const first = days.length - length;
  const closes = new Float64Array(length);
  let walk = 0;
  for (let k = length - 1; k >= 0; k--) {
    closes[k] = Math.log(company.price) + company.beta * market[first + k] + walk;
    walk -= trend + (own / Math.sqrt(252)) * rng.normal();
  }
  const adv = company.marketCap ** 0.8 / company.price;
  return barsAround(rng, days.slice(first), closes, company.volatility / Math.sqrt(252), adv);
}

/** The MAJOR 500's daily bars before the start, following the market path from 1,000. */
export function pregameIndex(seed: string, days: readonly number[], market: Float64Array): Bar[] {
  const levels = market.map((m) => Math.log(1000) + m);
  return barsAround(Rng.stream(seed, 'pregame:index'), days, levels, PREGAME_VOL / Math.sqrt(252), 0);
}

/**
 * 5-minute bars `first` … `first + count - 1` of a session known only from its daily numbers: a seeded Brownian
 * bridge from `open` to `close`. With a range it is stretched to touch the day's high and low; without one it wanders
 * with `barVol` per bar. The session's `volume` is spread by the intraday profile.
 */
export function sessionBars(
  rng: Rng, day: number, first: number, count: number,
  open: number, close: number, range: [number, number] | undefined, volume: number, barVol: number,
): Bar[] {
  if (count <= 0) return [];
  const bridge = new Float64Array(count + 1);
  for (let k = 1; k <= count; k++) bridge[k] = bridge[k - 1] + rng.normal();
  let up = 0;
  let down = 0;
  for (let k = 0; k <= count; k++) {
    bridge[k] -= (k / count) * bridge[count];
    up = Math.max(up, bridge[k]);
    down = Math.min(down, bridge[k]);
  }
  const lo = Math.log(open);
  const lc = Math.log(close);
  const room = range ? [Math.log(range[1]) - Math.max(lo, lc), Math.min(lo, lc) - Math.log(range[0])] : [barVol * up, -barVol * down];
  const scaleUp = up > 0 ? Math.max(0, room[0]) / up : 0;
  const scaleDown = down < 0 ? Math.max(0, room[1]) / -down : 0;
  let profile = 0;
  for (let k = first; k < first + count; k++) profile += PROFILE[k];
  const bars: Bar[] = [];
  let prev = open;
  for (let k = 1; k <= count; k++) {
    const b = bridge[k];
    const c = Math.exp(lo + (k / count) * (lc - lo) + b * (b > 0 ? scaleUp : scaleDown));
    const slot = first + k - 1;
    const time = (day * 1440 + OPEN + slot * BAR_MINUTES) * 60;
    bars.push({ time, open: prev, high: Math.max(prev, c), low: Math.min(prev, c), close: c, volume: (volume * PROFILE[slot]) / profile });
    prev = c;
  }
  return bars;
}
