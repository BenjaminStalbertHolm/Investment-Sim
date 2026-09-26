import { describe, expect, it } from 'vitest';
import {
  BARS_PER_DAY, START_DAY, at, dayOf, formatClock, holiday, isTradingDay, minutesPerSecond, nextOpen, phaseAt, phaseEnd,
} from '../src/sim/calendar';

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;
const hm = (h: number, m = 0) => h * 60 + m;

describe('trading calendar (spec §11.1)', () => {
  it('starts on Monday 5 January 1998 and formats the tray clock', () => {
    expect(START_DAY).toBe(day(1998, 1, 5));
    expect(formatClock(at(START_DAY, hm(10, 42)))).toBe('Mon 05 Jan 1998 10:42');
    expect(BARS_PER_DAY).toBe(78);
  });

  it('keeps a holiday calendar that moves fixed dates off weekends', () => {
    const holidays = [];
    for (let d = day(1998, 1, 1); d <= day(1998, 12, 31); d++) if (holiday(d)) holidays.push(formatClock(at(d, 0)).slice(0, 15));
    expect(holidays).toEqual([
      'Thu 01 Jan 1998', 'Mon 19 Jan 1998', 'Mon 16 Feb 1998', 'Fri 10 Apr 1998', 'Mon 25 May 1998',
      'Fri 03 Jul 1998', 'Mon 07 Sep 1998', 'Thu 26 Nov 1998', 'Fri 25 Dec 1998',
    ]);
    expect(holiday(day(1998, 7, 3))).toBe('Independence Day'); // 4 July 1998 was a Saturday
    let sessions = 0;
    for (let d = day(1998, 1, 1); d <= day(1998, 12, 31); d++) if (isTradingDay(d)) sessions++;
    expect(sessions).toBe(252);
  });

  it('has a pre-market, a session and closed hours', () => {
    const monday = day(1998, 1, 12);
    expect(phaseAt(at(monday, hm(7, 59)))).toBe('closed');
    expect(phaseAt(at(monday, hm(8)))).toBe('pre');
    expect(phaseAt(at(monday, hm(9, 30)))).toBe('open');
    expect(phaseAt(at(monday, hm(15, 59)))).toBe('open');
    expect(phaseAt(at(monday, hm(16)))).toBe('closed');
    expect(phaseAt(at(day(1998, 1, 10), hm(10)))).toBe('closed'); // Saturday
    expect(phaseAt(at(day(1998, 1, 19), hm(10)))).toBe('closed'); // Doors Day
  });

  it('finds the next opening bell across nights, weekends and holidays', () => {
    expect(nextOpen(at(day(1998, 1, 12), hm(8)))).toBe(at(day(1998, 1, 12), hm(9, 30)));
    expect(nextOpen(at(day(1998, 1, 12), hm(9, 30)))).toBe(at(day(1998, 1, 13), hm(9, 30)));
    expect(nextOpen(at(day(1998, 1, 16), hm(16)))).toBe(at(day(1998, 1, 20), hm(9, 30))); // Fri → Tue after Doors Day
  });

  it('knows when each phase ends, so a fast weekend cannot skip the pre-market', () => {
    expect(phaseEnd(at(day(1998, 1, 16), hm(16)))).toBe(at(day(1998, 1, 20), hm(8))); // Fri close → Tue pre-market
    expect(phaseEnd(at(day(1998, 1, 20), hm(8)))).toBe(at(day(1998, 1, 20), hm(9, 30)));
    expect(phaseEnd(at(day(1998, 1, 20), hm(9, 30)))).toBe(at(day(1998, 1, 20), hm(16)));
    expect(phaseEnd(at(day(1998, 1, 20), hm(3)))).toBe(at(day(1998, 1, 20), hm(8)));
  });

  it('runs two real minutes a day at 1× and passes any night in about two seconds', () => {
    const monday = day(1998, 1, 12);
    expect(minutesPerSecond(at(monday, hm(10)), 1) * 120).toBeCloseTo(390);
    expect(minutesPerSecond(at(monday, hm(10)), 20)).toBeCloseTo(65);
    expect(minutesPerSecond(at(monday, hm(10)), 0)).toBe(0);
    expect(minutesPerSecond(at(monday, hm(17)), 1) * 2).toBe(16 * 60); // Mon 16:00 → Tue 08:00
    expect(minutesPerSecond(at(day(1998, 1, 17), hm(12)), 1) * 2).toBe(88 * 60); // Fri 16:00 → Tue 08:00
    expect(dayOf(at(monday, hm(23, 59)))).toBe(monday);
  });
});
