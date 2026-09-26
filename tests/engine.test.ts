import { beforeAll, describe, expect, it } from 'vitest';
import { CLOSE, OPEN, START_DAY, at, dayOf, formatClock, minuteOf, nextTradingDay } from '../src/sim/calendar';
import { seasonOf } from '../src/sim/earnings';
import { Engine } from '../src/sim/engine';
import { RING_DAYS } from '../src/sim/history';
import { DIFFICULTIES } from '../src/sim/settings';
import { INDEX, TIMEFRAMES } from '../src/sim/types';
import { generateWorld, type World } from '../src/world/generator';
import { difference } from './util';

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'engine', companyCount: 1000 });
});
const game = () => Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Test Capital' });

describe('market engine (spec §11)', () => {
  it('starts at the opening bell of 5 January 1998 with the seed money deposited', () => {
    const e = game();
    expect(formatClock(e.time)).toBe('Mon 05 Jan 1998 09:30');
    expect(e.phase).toBe('open');
    expect(e.account()).toMatchObject({ cash: 1_000_000, netWorth: 1_000_000, deposits: 1_000_000 });
    expect(e.ledger()).toEqual([{ time: e.time, kind: 'deposit', amount: 1_000_000, balance: 1_000_000 }]);
    expect(e.indexQuote().last).toBeCloseTo(1000, 6);
    world.companies.forEach((c, i) => expect(e.market.price[i]).toBeCloseTo(c.price, 9));
  });

  it('runs 78 bars a session and records each day', () => {
    const e = game();
    e.runSessions(1);
    expect(formatClock(e.time)).toBe('Mon 05 Jan 1998 16:00');
    expect(e.phase).toBe('closed');
    expect(e.bars(0, '1D')).toHaveLength(78);
    expect(e.stats()).toEqual([[START_DAY, e.netWorth(), e.indexQuote().last]]);
    e.skipToNextOpen();
    expect(formatClock(e.time)).toBe('Tue 06 Jan 1998 09:30');
    e.advance(7);
    expect(e.bars(0, '1D')).toHaveLength(1); // 09:30–09:35 done, 09:35–09:40 not yet
  });

  it('is deterministic: the same seed and orders give the same game', () => {
    const play = () => {
      const e = game();
      e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 100, tif: 'day' });
      e.runSessions(3);
      e.advance(24 * 60);
      e.placeOrder({ company: 3, side: 'sell', type: 'limit', shares: 50, limit: 1, tif: 'gtc' });
      e.runSessions(20);
      return e.exportState();
    };
    expect(difference(play(), play())).toBeUndefined();
  });

  it('keeps market truth independent of what the player watches', () => {
    const a = game();
    const b = game();
    b.watch([0, 1, 2, 500, 999]);
    a.runSessions(10);
    b.runSessions(10);
    expect(difference(b.exportState(), a.exportState())).toBeUndefined();
  });

  it('moves prices plausibly: positive, finite, and back towards value', () => {
    const e = game();
    e.runSessions(252);
    const { lnP, lnV } = e.market.state;
    let gap = 0;
    for (let i = 0; i < lnP.length; i++) {
      expect(Number.isFinite(e.market.price[i]) && e.market.price[i] > 0).toBe(true);
      gap += Math.abs(lnV[i] - lnP[i]);
    }
    // Mispricings mean-revert: after a year the average one is tens of percent, not a random walk's hundreds.
    expect(gap / lnP.length).toBeLessThan(0.4);
    const index = e.indexQuote().last;
    expect(index).toBeGreaterThan(500);
    expect(index).toBeLessThan(2500);
  });

  it('staggers every company’s earnings report over the six-week season', () => {
    const e = game();
    const next = world.companies.map((_, i) => e.details(i).nextEarnings);
    e.runSessions(45);
    const reported = Array.from(e.exportState().fundamentals.reported);
    // Each company reported once, on the day it was announced for, spread over the season's 30 trading days.
    expect(reported).toEqual(next);
    expect(new Set(reported).size).toBe(30);
    for (const day of reported) expect(seasonOf(day).index).toBeGreaterThanOrEqual(0);
    expect(formatClock(at(Math.min(...reported), OPEN)).slice(0, 15)).toBe('Wed 14 Jan 1998');
  });

  it('halts trading for the day when the MAJOR 500 falls 10%', () => {
    const e = game();
    e.advance(60);
    e.market.state.index.prevClose = e.indexQuote().last / 0.85; // as if the index were already down 15%
    e.advance(5);
    expect(e.halted).toBe(true);
    const frozen = e.market.price.slice();
    const order = e.placeOrder({ company: 5, side: 'buy', type: 'market', shares: 10, tif: 'gtc' });
    e.advance(60);
    expect(e.market.price).toEqual(frozen);
    expect('order' in order && e.openOrders()).toHaveLength(1); // queued for the next open
    e.skipToNextOpen();
    expect(e.halted).toBe(false);
    expect(e.openOrders()).toHaveLength(0);
  });

  it('assembles every chart timeframe in time order, ending at the live price', () => {
    const e = game();
    e.watch([7]);
    e.runSessions(5);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), OPEN + 60));
    for (const id of [7, 8, INDEX]) {
      const last = id === INDEX ? e.indexQuote().last : e.market.price[id];
      for (const tf of TIMEFRAMES) {
        const bars = e.bars(id, tf);
        expect(bars.length, `${id} ${tf}`).toBeGreaterThan(0);
        bars.forEach((b, k) => {
          if (k) expect(b.time, `${id} ${tf}`).toBeGreaterThan(bars[k - 1].time);
          expect(b.high).toBeGreaterThanOrEqual(Math.min(b.open, b.close) - 1e-9);
          expect(b.low).toBeLessThanOrEqual(Math.max(b.open, b.close) + 1e-9);
        });
        expect(bars.at(-1)!.close, `${id} ${tf}`).toBeCloseTo(last, 6);
      }
      expect(e.bars(id, '1D')).toHaveLength(12);
      expect(e.bars(id, '5D')).toHaveLength(4 * 78 + 12);
      expect(e.bars(id, '1Y')).toHaveLength(252);
    }
    // Five years of pre-game history (companies founded since start at their IPO).
    expect(e.bars(INDEX, 'MAX')[0].time).toBeLessThan((START_DAY - 1800) * 86_400);
  });

  it('generates the same pre-game history every time, ending at the starting price', () => {
    const a = game().bars(42, '5Y');
    const b = game().bars(42, '5Y');
    expect(a).toEqual(b);
    const daily = game().bars(42, '1Y');
    expect(daily.at(-1)!.close).toBeCloseTo(world.companies[42].price, 9);
    expect(daily.at(-2)!.time).toBeLessThan(START_DAY * 86_400);
  });

  it('keeps 260 days of daily bars and weekly closes beyond', () => {
    const e = game();
    e.runSessions(300);
    const history = e.exportState().history;
    expect(Array.from(history.days).filter((d) => d >= 0)).toHaveLength(RING_DAYS);
    expect(history.weekDays.length).toBeGreaterThanOrEqual(59);
    expect(history.index).toHaveLength(300);
    const weeks = e.bars(3, 'MAX');
    expect(weeks.length).toBeGreaterThan(260 + 55);
    expect(minuteOf(e.time)).toBe(CLOSE);
  }, 60_000);
});
