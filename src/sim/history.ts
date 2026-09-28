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

/**
 * Weekly closes kept for every company: twenty years. Older weeks are dropped as new ones arrive, so a game can run for
 * ever in a bounded amount of memory (spec §19 Phase 11); the pre-game charts and the daily ring are unaffected.
 */
export const MAX_WEEKS = 1040;

/** Spare columns added when IPOs outgrow the arrays: room for about 1% more companies, and at least 32. */
const spare = (count: number) => Math.max(32, Math.ceil(count * 0.01));

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
  /**
   * Width of a row of the arrays below, at least `count`. IPOs add companies one at a time, so the arrays keep spare
   * columns and are re-cut only when those run out (a re-cut copies every row). Only in memory: exportState() writes
   * rows exactly `count` wide, and a loaded game starts with none spare.
   */
  stride?: number;
  /** Day of each ring slot, -1 while empty. Slot `head` is written next. */
  days: Int32Array;
  head: number;
  /** Ring arrays, row per slot: `slot * stride + company`. */
  close: Int32Array;
  open: Int16Array;
  high: Int16Array;
  low: Int16Array;
  volume: Uint16Array;
  /** Last trading day of each week so far (the newest MAX_WEEKS), and every company's close on it (row per week). */
  weekDays: number[];
  weekly: Int32Array;
  /** MAJOR 500 daily bars for all time, as [day, open, high, low, close]. */
  index: [number, number, number, number, number][];
}

/** A row's width. */
const stride = (h: HistoryState) => h.stride ?? h.count;

export function createHistory(count: number): HistoryState {
  return {
    count,
    stride: count,
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
  const width = stride(h);
  const row = h.head * width;
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
    // One copy per week: the weeks kept, then this one. Beyond MAX_WEEKS the oldest go.
    const rows = h.weekDays.length + 1;
    const drop = Math.max(0, rows - MAX_WEEKS);
    const weekly = new Int32Array((rows - drop) * width);
    weekly.set(h.weekly.subarray(drop * width));
    weekly.set(h.close.subarray(row, row + width), (rows - drop - 1) * width);
    h.weekly = weekly;
    h.weekDays.push(day);
    if (drop) h.weekDays.splice(0, drop);
  }
}

/**
 * A company joins (an IPO): every row of the ring and the weekly archive gains a column, holding its listing price for
 * the days before it existed (charts start at its listing, so nobody sees them). The column is a spare one when there is
 * one; otherwise the arrays are re-cut wider first, with room for many more.
 */
export function addToHistory(h: HistoryState, price: number): void {
  const n = h.count;
  if (n >= stride(h)) widen(h, n + spare(n));
  const width = stride(h);
  const close = quantise(price);
  for (let r = 0; r < RING_DAYS; r++) {
    h.close[r * width + n] = close;
    h.open[r * width + n] = 0;
    h.high[r * width + n] = 0;
    h.low[r * width + n] = 0;
    h.volume[r * width + n] = 0;
  }
  for (let w = 0; w < h.weekDays.length; w++) h.weekly[w * width + n] = close;
  h.count = n + 1;
}

/** Re-cuts every array to rows `width` wide, the new columns empty. */
function widen(h: HistoryState, width: number): void {
  const old = stride(h);
  const cut = <T extends Int32Array | Int16Array | Uint16Array>(a: T, rows: number): T => {
    const out = new (a.constructor as new (length: number) => T)(rows * width);
    for (let r = 0; r < rows; r++) out.set(a.subarray(r * old, (r + 1) * old), r * width);
    return out;
  };
  h.close = cut(h.close, RING_DAYS);
  h.open = cut(h.open, RING_DAYS);
  h.high = cut(h.high, RING_DAYS);
  h.low = cut(h.low, RING_DAYS);
  h.volume = cut(h.volume, RING_DAYS);
  h.weekly = cut(h.weekly, h.weekDays.length);
  h.stride = width;
}

/** A stock split (`ratio` new shares for one): the company's past prices are divided and its volumes multiplied by it. */
export function splitHistory(h: HistoryState, company: number, ratio: number): void {
  const down = Math.round(Math.log(ratio) * CLOSE_STEP);
  const up = Math.round(Math.log(ratio) * VOLUME_STEP);
  const width = stride(h);
  for (let slot = 0; slot < RING_DAYS; slot++) {
    const k = slot * width + company;
    h.close[k] -= down;
    if (h.volume[k]) h.volume[k] = Math.min(65535, h.volume[k] + up);
  }
  for (let w = 0; w < h.weekDays.length; w++) h.weekly[w * width + company] -= down;
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
  const width = stride(h);
  return slots(h).map((slot) => {
    const k = slot * width + company;
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
  const width = stride(h);
  return h.weekDays.map((day, w) => [day, Math.exp(h.weekly[w * width + company] / CLOSE_STEP)]);
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

/** The array cut to rows `count` wide, dropping the spare columns (the same array when there are none). */
function compact<T extends Int32Array | Int16Array | Uint16Array>(a: T, rows: number, width: number, count: number): T {
  if (width === count) return a;
  const out = new (a.constructor as new (length: number) => T)(rows * count);
  for (let r = 0; r < rows; r++) out.set(a.subarray(r * width, r * width + count), r * count);
  return out;
}

/** The history as saved: rows exactly `count` wide, closes and volumes as differences between rows. */
export function packHistory(h: HistoryState): HistoryState {
  const width = stride(h);
  const weeks = h.weekDays.length;
  const { stride: _stride, ...rest } = h;
  return {
    ...rest,
    close: deltaRows(compact(h.close, RING_DAYS, width, h.count), h.count),
    open: compact(h.open, RING_DAYS, width, h.count),
    high: compact(h.high, RING_DAYS, width, h.count),
    low: compact(h.low, RING_DAYS, width, h.count),
    volume: deltaRows(compact(h.volume, RING_DAYS, width, h.count), h.count),
    weekly: deltaRows(compact(h.weekly, weeks, width, h.count), h.count),
  };
}

export function unpackHistory(h: HistoryState): HistoryState {
  return {
    ...h,
    stride: h.count,
    close: undeltaRows(h.close, h.count),
    volume: undeltaRows(h.volume, h.count),
    weekly: undeltaRows(h.weekly, h.count),
  };
}

/** Every company's close at the end of week `w` (weekDays[w]). */
export function weekCloses(h: HistoryState, w: number): Float64Array {
  const width = stride(h);
  return Float64Array.from(h.weekly.subarray(w * width, w * width + h.count), (q) => Math.exp(q / CLOSE_STEP));
}

/** The value of fixed holdings at each week's close, oldest first. */
export function weeklyValues(h: HistoryState, holdings: readonly { company: number; shares: number }[]): [number, number][] {
  const width = stride(h);
  return h.weekDays.map((day, w) => {
    let value = 0;
    for (const { company, shares } of holdings) value += shares * Math.exp(h.weekly[w * width + company] / CLOSE_STEP);
    return [day, value];
  });
}
