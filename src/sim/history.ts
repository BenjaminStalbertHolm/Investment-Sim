import { weekday, nextTradingDay } from './calendar';

/** A chart bar. `time` is a UTC timestamp in seconds (game time × 60). */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Rolling window of daily bars kept for every company (spec §11.3). */
export const RING_DAYS = 260;

// History is recorded quantised so saves stay small (spec §18: < 25 MB). Closes are ln(price) in steps of 0.1 basis
// point; open, high and low are ln offsets from the close in basis points; volume is ln(1 + shares) in 0.05% steps.
const CLOSE_STEP = 1e5;
const RANGE_STEP = 1e4;
const VOLUME_STEP = 2000;
const quantise = (price: number) => Math.round(Math.log(price) * CLOSE_STEP);
const offset = (price: number, close: number) =>
  Math.max(-32767, Math.min(32767, Math.round(Math.log(price / close) * RANGE_STEP)));

/** Daily history (spec §11.3): the last 260 days of OHLCV for every company, weekly closes for all time. */
export interface HistoryState {
  count: number;
  /** Day of each ring slot, -1 while empty. Slot `head` is written next. */
  days: Int32Array;
  head: number;
  /** Ring arrays, row per slot: `slot * count + company`. */
  close: Int32Array;
  open: Int16Array;
  high: Int16Array;
  low: Int16Array;
  volume: Uint16Array;
  /** Last trading day of each week so far, and every company's close on it (row per week). */
  weekDays: number[];
  weekly: Int32Array;
  /** MAJOR 500 daily bars for all time, as [day, open, high, low, close]. */
  index: [number, number, number, number, number][];
}

export function createHistory(count: number): HistoryState {
  return {
    count,
    days: new Int32Array(RING_DAYS).fill(-1),
    head: 0,
    close: new Int32Array(count * RING_DAYS),
    open: new Int16Array(count * RING_DAYS),
    high: new Int16Array(count * RING_DAYS),
    low: new Int16Array(count * RING_DAYS),
    volume: new Uint16Array(count * RING_DAYS),
    weekDays: [],
    weekly: new Int32Array(0),
    index: [],
  };
}

/** Whether `day` is the last trading day of its week. */
export const endsWeek = (day: number) => {
  const next = nextTradingDay(day);
  return next - day >= 7 || weekday(next) <= weekday(day);
};

export interface DayPrices {
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
}

/** Records a finished trading day. */
export function recordDay(h: HistoryState, day: number, p: DayPrices, index: [number, number, number, number]): void {
  const { count } = h;
  const row = h.head * count;
  for (let i = 0; i < count; i++) {
    const c = p.close[i];
    h.close[row + i] = quantise(c);
    h.open[row + i] = offset(p.open[i], c);
    h.high[row + i] = offset(p.high[i], c);
    h.low[row + i] = offset(p.low[i], c);
    h.volume[row + i] = Math.min(65535, Math.round(Math.log1p(p.volume[i]) * VOLUME_STEP));
  }
  h.days[h.head] = day;
  h.head = (h.head + 1) % RING_DAYS;
  h.index.push([day, ...index]);
  if (endsWeek(day)) {
    const weekly = new Int32Array(h.weekly.length + count);
    weekly.set(h.weekly);
    weekly.set(h.close.subarray(row, row + count), h.weekly.length);
    h.weekly = weekly;
    h.weekDays.push(day);
  }
}

/**
 * A company joins (an IPO): every row of the ring and the weekly archive gains a column, holding its listing price for
 * the days before it existed (charts start at its listing, so nobody sees them).
 */
export function addToHistory(h: HistoryState, price: number): void {
  const n = h.count;
  const widen = <T extends Int32Array | Int16Array | Uint16Array>(a: T, rows: number, fill: number): T => {
    const out = new (a.constructor as new (length: number) => T)(rows * (n + 1));
    for (let r = 0; r < rows; r++) {
      out.set(a.subarray(r * n, (r + 1) * n), r * (n + 1));
      out[r * (n + 1) + n] = fill;
    }
    return out;
  };
  const close = quantise(price);
  h.close = widen(h.close, RING_DAYS, close);
  h.open = widen(h.open, RING_DAYS, 0);
  h.high = widen(h.high, RING_DAYS, 0);
  h.low = widen(h.low, RING_DAYS, 0);
  h.volume = widen(h.volume, RING_DAYS, 0);
  h.weekly = widen(h.weekly, h.weekDays.length, close);
  h.count = n + 1;
}

/** A stock split (`ratio` new shares for one): the company's past prices are divided and its volumes multiplied by it. */
export function splitHistory(h: HistoryState, company: number, ratio: number): void {
  const down = Math.round(Math.log(ratio) * CLOSE_STEP);
  const up = Math.round(Math.log(ratio) * VOLUME_STEP);
  for (let slot = 0; slot < RING_DAYS; slot++) {
    const k = slot * h.count + company;
    h.close[k] -= down;
    if (h.volume[k]) h.volume[k] = Math.min(65535, h.volume[k] + up);
  }
  for (let w = 0; w < h.weekDays.length; w++) h.weekly[w * h.count + company] -= down;
}

/** Ring slots holding data, oldest first. */
function slots(h: HistoryState): number[] {
  const out: number[] = [];
  for (let k = 0; k < RING_DAYS; k++) {
    const slot = (h.head + k) % RING_DAYS;
    if (h.days[slot] >= 0) out.push(slot);
  }
  return out;
}

/** A company's daily bars in the ring, oldest first, with `time` at the day's close. */
export function dailyBars(h: HistoryState, company: number, closeMinute: number): Bar[] {
  return slots(h).map((slot) => {
    const k = slot * h.count + company;
    const lnClose = h.close[k] / CLOSE_STEP;
    const at = (o: number) => Math.exp(lnClose + o / RANGE_STEP);
    return {
      time: (h.days[slot] * 1440 + closeMinute) * 60,
      open: at(h.open[k]),
      high: at(h.high[k]),
      low: at(h.low[k]),
      close: Math.exp(lnClose),
      volume: Math.expm1(h.volume[k] / VOLUME_STEP),
    };
  });
}

/** A company's weekly closes as [day, close], oldest first. */
export function weeklyCloses(h: HistoryState, company: number): [number, number][] {
  return h.weekDays.map((day, w) => [day, Math.exp(h.weekly[w * h.count + company] / CLOSE_STEP)]);
}

/** The oldest day still in the ring, or undefined while empty. */
export function oldestDay(h: HistoryState): number | undefined {
  const s = slots(h);
  return s.length ? h.days[s[0]] : undefined;
}

// Saves store the ring's closes and volumes as differences between consecutive rows, which compress far better
// than the values themselves (the save packer then byte-shuffles every array).
const deltaRows = <T extends Int32Array | Uint16Array>(a: T, width: number): T => {
  const out = a.slice() as T;
  for (let k = out.length - 1; k >= width; k--) out[k] = a[k] - a[k - width];
  return out;
};
const undeltaRows = <T extends Int32Array | Uint16Array>(a: T, width: number): T => {
  const out = a.slice() as T;
  for (let k = width; k < out.length; k++) out[k] = out[k] + out[k - width];
  return out;
};

export function packHistory(h: HistoryState): HistoryState {
  return {
    ...h,
    close: deltaRows(h.close, h.count),
    volume: deltaRows(h.volume, h.count),
    weekly: deltaRows(h.weekly, h.count),
  };
}

export function unpackHistory(h: HistoryState): HistoryState {
  return {
    ...h,
    close: undeltaRows(h.close, h.count),
    volume: undeltaRows(h.volume, h.count),
    weekly: undeltaRows(h.weekly, h.count),
  };
}

/** Every company's close at the end of week `w` (weekDays[w]). */
export function weekCloses(h: HistoryState, w: number): Float64Array {
  return Float64Array.from(h.weekly.subarray(w * h.count, (w + 1) * h.count), (q) => Math.exp(q / CLOSE_STEP));
}

/** The value of fixed holdings at each week's close, oldest first. */
export function weeklyValues(h: HistoryState, holdings: readonly { company: number; shares: number }[]): [number, number][] {
  return h.weekDays.map((day, w) => {
    let value = 0;
    for (const { company, shares } of holdings) value += shares * Math.exp(h.weekly[w * h.count + company] / CLOSE_STEP);
    return [day, value];
  });
}
