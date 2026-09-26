/**
 * Game time and the trading calendar (spec §11.1). A game time is whole minutes since 1970-01-01 00:00 market time:
 * the day is `Math.floor(t / 1440)` (days since the Unix epoch) and charts use `t * 60` as a UTC timestamp.
 */
export type GameTime = number;

export const DAY_MINUTES = 1440;
export const PRE_MARKET = 8 * 60;
export const OPEN = 9 * 60 + 30;
export const CLOSE = 16 * 60;
export const BAR_MINUTES = 5;
export const BARS_PER_DAY = (CLOSE - OPEN) / BAR_MINUTES; // 78

/** Mon 5 Jan 1998, the default start (spec §9). */
export const START_DAY = Date.UTC(1998, 0, 5) / 86_400_000;

export type Phase = 'pre' | 'open' | 'closed';

export const dayOf = (t: GameTime) => Math.floor(t / DAY_MINUTES);
export const minuteOf = (t: GameTime) => t - dayOf(t) * DAY_MINUTES;
export const at = (day: number, minute: number): GameTime => day * DAY_MINUTES + minute;
/** 0 = Sunday … 6 = Saturday; 1 Jan 1970 was a Thursday. */
export const weekday = (day: number) => (((day + 4) % 7) + 7) % 7;

type HolidayRule = { name: string; month: number } & ({ date: number } | { weekday: number; nth: number });

/**
 * The exchange's fictional holiday calendar. Fixed dates falling on a weekend are observed on the Friday before or
 * the Monday after; the others are the nth weekday of their month (nth -1 = the last).
 */
const HOLIDAYS: readonly HolidayRule[] = [
  { name: "New Year's Day", month: 1, date: 1 },
  { name: 'Doors Day', month: 1, weekday: 1, nth: 3 },
  { name: "Chairmen's Day", month: 2, weekday: 1, nth: 3 },
  { name: 'Tulip Friday', month: 4, weekday: 5, nth: 2 },
  { name: 'Memorial Day', month: 5, weekday: 1, nth: -1 },
  { name: 'Independence Day', month: 7, date: 4 },
  { name: 'Labour Day', month: 9, weekday: 1, nth: 1 },
  { name: 'Thanksgiving', month: 11, weekday: 4, nth: 4 },
  { name: 'Christmas Day', month: 12, date: 25 },
];

const byYear = new Map<number, Map<number, string>>();

function holidaysOf(year: number): Map<number, string> {
  let days = byYear.get(year);
  if (days) return days;
  days = new Map();
  for (const rule of HOLIDAYS) {
    const first = Date.UTC(year, rule.month - 1, 1) / 86_400_000;
    let day: number;
    if ('date' in rule) {
      day = first + rule.date - 1;
      if (weekday(day) === 6) day -= 1;
      else if (weekday(day) === 0) day += 1;
    } else if (rule.nth > 0) {
      day = first + ((rule.weekday - weekday(first) + 7) % 7) + 7 * (rule.nth - 1);
    } else {
      const last = Date.UTC(year, rule.month, 0) / 86_400_000;
      day = last - ((weekday(last) - rule.weekday + 7) % 7);
    }
    days.set(day, rule.name);
  }
  byYear.set(year, days);
  return days;
}

/** The holiday a day is, if any. */
export function holiday(day: number): string | undefined {
  const year = new Date(day * 86_400_000).getUTCFullYear();
  // A New Year's Day moved back to Friday 31 December belongs to the next year's calendar.
  return holidaysOf(year).get(day) ?? holidaysOf(year + 1).get(day);
}

export function isTradingDay(day: number): boolean {
  const w = weekday(day);
  return w !== 0 && w !== 6 && !holiday(day);
}

export function nextTradingDay(day: number): number {
  let d = day + 1;
  while (!isTradingDay(d)) d++;
  return d;
}

export function previousTradingDay(day: number): number {
  let d = day - 1;
  while (!isTradingDay(d)) d--;
  return d;
}

/** Pre-market 08:00–09:30 (orders queue for the open), open 09:30–16:00, otherwise closed. */
export function phaseAt(t: GameTime): Phase {
  const day = dayOf(t);
  if (!isTradingDay(day)) return 'closed';
  const m = t - day * DAY_MINUTES;
  return m >= OPEN && m < CLOSE ? 'open' : m >= PRE_MARKET && m < OPEN ? 'pre' : 'closed';
}

/** The first opening bell after `t`. */
export function nextOpen(t: GameTime): GameTime {
  const day = dayOf(t);
  if (isTradingDay(day) && t < at(day, OPEN)) return at(day, OPEN);
  return at(nextTradingDay(day), OPEN);
}

/** When the current phase ends: the next pre-market, opening bell or close. */
export function phaseEnd(t: GameTime): GameTime {
  const day = dayOf(t);
  const m = t - day * DAY_MINUTES;
  if (isTradingDay(day)) {
    if (m < PRE_MARKET) return at(day, PRE_MARKET);
    if (m < OPEN) return at(day, OPEN);
    if (m < CLOSE) return at(day, CLOSE);
  }
  return at(nextTradingDay(day), PRE_MARKET);
}

/**
 * Game minutes per real second (spec §11.1). At 1× a trading day (390 minutes) takes two real minutes and the
 * pre-market runs at the same pace; a closed stretch, whether a night or a long weekend, passes in about 2 seconds.
 */
export function minutesPerSecond(t: GameTime, speed: number): number {
  if (!speed) return 0;
  if (phaseAt(t) !== 'closed') return (390 / 120) * speed;
  const day = dayOf(t);
  const previous = isTradingDay(day) && t >= at(day, CLOSE) ? day : previousTradingDay(day);
  return (phaseEnd(t) - at(previous, CLOSE)) / 2;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "05 Jan 1998" */
export function formatDate(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "10:42" */
export const formatTime = (t: GameTime) => `${pad(Math.floor(minuteOf(t) / 60))}:${pad(minuteOf(t) % 60)}`;

/** "Mon 05 Jan 1998 10:42", as the tray shows it. */
export const formatClock = (t: GameTime) => `${WEEKDAYS[weekday(dayOf(t))]} ${formatDate(dayOf(t))} ${formatTime(t)}`;
