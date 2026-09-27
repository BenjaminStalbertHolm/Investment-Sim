import { beforeAll, describe, expect, it } from 'vitest';
import type { Order } from '../src/sim/account';
import { formatClock } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { PARTICIPATION } from '../src/sim/market';
import { DIFFICULTIES as PRESETS, changeSettings, type GameSettings } from '../src/sim/settings';
import type { OrderRequest } from '../src/sim/account';
import { generateWorld, type World } from '../src/world/generator';

/** Written against the Phase 7 presets: $1,000,000 at 2:1 for Medium (leverage is off in every preset since Phase 8). */
const DIFFICULTIES = { ...PRESETS, medium: changeSettings(PRESETS.medium, { startingCapital: 1_000_000, maxLeverage: 2 }) };

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'orders', companyCount: 1000 });
});
const game = (settings: GameSettings = DIFFICULTIES.medium) => Engine.create(world, { settings, firmName: 'Test' });
const place = (e: Engine, r: Partial<OrderRequest> & { company: number }): Order => {
  const result = e.placeOrder({ side: 'buy', type: 'market', shares: 100, tif: 'day', ...r });
  if ('error' in result) throw new Error(result.error);
  return e.orders().find((o) => o.id === result.order.id)!;
};
const error = (e: Engine, r: Partial<OrderRequest> & { company: number }) => {
  const result = e.placeOrder({ side: 'buy', type: 'market', shares: 100, tif: 'day', ...r });
  return 'error' in result ? result.error : undefined;
};
/** A liquid mega cap, and the company with the least dollar volume. */
const LIQUID = 0;
const illiquid = (e: Engine) => {
  const dollars = Array.from(e.market.adv, (adv, i) => adv * e.market.price[i]);
  return dollars.indexOf(Math.min(...dollars));
};

describe('order ticket and broker (spec §12.2)', () => {
  it('fills market orders at the ask plus impact and charges the commission once', () => {
    const e = game();
    const mid = e.market.price[LIQUID];
    const estimate = e.estimate({ company: LIQUID, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    const order = place(e, { company: LIQUID });
    expect(order).toMatchObject({ status: 'filled', filled: 100, commission: 19.95 });
    expect(order.price).toBeCloseTo(estimate.price, 9);
    expect(order.price).toBeGreaterThan(estimate.ask);
    expect(e.account().cash).toBeCloseTo(1_000_000 - 100 * order.price - 19.95, 6);
    expect(e.positions()[0]).toMatchObject({ company: LIQUID, shares: 100 });
    expect(e.positions()[0].cost).toBeCloseTo(100 * order.price + 19.95, 6);
    // Half of the impact stays in the price.
    expect(e.market.price[LIQUID] / mid - 1).toBeCloseTo(estimate.impact / 2, 12);
  });

  it('prices size with the square-root law and warns past 5% of daily volume', () => {
    const e = game();
    const i = illiquid(e);
    const small = e.estimate({ company: i, side: 'buy', type: 'market', shares: 10, tif: 'day' });
    const big = e.estimate({ company: i, side: 'buy', type: 'market', shares: 1000, tif: 'day' });
    expect(big.impact / small.impact).toBeCloseTo(10, 9);
    expect(big.volumeShare).toBeCloseTo(1000 / e.market.adv[i], 12);
    const easy = game(DIFFICULTIES.easy).estimate({ company: i, side: 'buy', type: 'market', shares: 1000, tif: 'day' });
    expect(easy.impact).toBeCloseTo(0.8 * 0.5 * big.impact, 12); // Easy: calmer market, half the impact
  });

  it('rejects what the account cannot do', () => {
    const e = game();
    expect(error(e, { company: LIQUID, shares: 0 })).toBe('Enter a whole number of shares.');
    expect(error(e, { company: LIQUID, shares: 1.5 })).toBe('Enter a whole number of shares.');
    expect(error(e, { company: 5000 })).toBe('Unknown symbol.');
    expect(error(e, { company: LIQUID, type: 'limit' })).toBe('Enter a limit price.');
    expect(error(e, { company: LIQUID, side: 'sell' })).toBe('You have no shares to sell.');
    // A margin account at 2:1 (Phase 7): buying power is twice the equity.
    const tooMany = Math.ceil(2_000_000 / e.market.price[LIQUID]) + 10;
    expect(error(e, { company: LIQUID, shares: tooMany })).toBe('Insufficient buying power.');
    place(e, { company: LIQUID, shares: 100 });
    expect(error(e, { company: LIQUID, side: 'sell', shares: 101 })).toBe('You can sell at most 100 shares.');
    // Open orders hold back what they may need: a buy limit its value at the limit, and leverage times its commission.
    const before = e.account().buyingPower;
    const limit = e.market.price[1] * 0.5;
    place(e, { company: 1, type: 'limit', limit, shares: 1000, tif: 'gtc' });
    expect(e.account().buyingPower).toBeCloseTo(before - 1000 * limit - 2 * 19.95, 6);
  });

  it('rests limit orders until the market reaches them, then fills at the limit, a slice of volume at a time', () => {
    const e = game();
    const i = illiquid(e);
    const adv = e.market.adv[i];
    // A limit that leaves room for the impact of one day's volume: that much fills at once, the rest rests.
    const limit = e.market.price[i] * (1 + e.market.halfSpread[i] + e.market.impact(i, adv));
    const shares = Math.round(adv * 3);
    const order = place(e, { company: i, type: 'limit', limit, shares, tif: 'gtc' });
    expect(order.filled).toBe(Math.floor(adv));
    expect(order.price).toBeLessThanOrEqual(limit);
    // The rest fills at the limit as the market trades there, at most a fifth of each bar's volume.
    e.advance(5);
    const after = e.orders().find((o) => o.id === order.id)!;
    expect(after.filled - order.filled).toBe(Math.floor(PARTICIPATION * e.market.barVolume[i]));
    const last = e.ledger().filter((l) => l.kind === 'buy').at(-1)!;
    expect(last.price).toBe(limit);
    // A sell limit far above the market never fills.
    const high = place(e, { company: LIQUID, side: 'buy', shares: 10 });
    const ask = place(e, { company: LIQUID, side: 'sell', type: 'limit', limit: e.market.price[LIQUID] * 3, shares: 10, tif: 'gtc' });
    e.runSessions(3);
    expect(e.orders().find((o) => o.id === ask.id)).toMatchObject({ status: 'open', filled: 0 });
    expect(high.status).toBe('filled');
  });

  it('expires day orders at the close and keeps GTC orders', () => {
    const e = game();
    const day = place(e, { company: 2, type: 'limit', limit: 0.01, tif: 'day' });
    const gtc = place(e, { company: 2, type: 'limit', limit: 0.01, tif: 'gtc' });
    e.runSessions(1);
    const orders = e.orders();
    expect(orders.find((o) => o.id === day.id)!.status).toBe('expired');
    expect(orders.find((o) => o.id === gtc.id)!.status).toBe('open');
    expect(e.cancelOrder(gtc.id)).toBe(true);
    expect(e.cancelOrder(gtc.id)).toBe(false);
  });

  it('queues orders placed while the market is closed and fills them after the opening gap', () => {
    const e = game();
    e.runSessions(1);
    e.advance(16 * 60 + 15); // Tue 08:15, pre-market
    expect(formatClock(e.time)).toBe('Tue 06 Jan 1998 08:15');
    expect(e.phase).toBe('pre');
    const order = place(e, { company: 9, shares: 50 });
    expect(order.status).toBe('open');
    e.advance(75); // 09:30
    const filled = e.orders().find((o) => o.id === order.id)!;
    expect(filled).toMatchObject({ status: 'filled', filled: 50 });
    expect(filled.updated).toBe(e.time);
    expect(filled.price).toBeGreaterThan(e.quote(9).open); // bought at the ask after the gap
  });

  it('modifies an order by replacing it', () => {
    const e = game();
    const first = place(e, { company: 4, type: 'limit', limit: 0.01, shares: 10, tif: 'gtc' });
    const result = e.placeOrder({ company: 4, side: 'buy', type: 'limit', limit: 0.02, shares: 20, tif: 'gtc', replaces: first.id });
    expect('order' in result).toBe(true);
    expect(e.openOrders().map((o) => [o.limit, o.shares])).toEqual([[0.02, 20]]);
    expect(e.orders().find((o) => o.id === first.id)!.status).toBe('cancelled');
    expect(error(e, { company: 4, type: 'limit', limit: 0.03, replaces: first.id })).toMatch(/already been filled or cancelled/);
  });

  it('realises P&L on sales against the average cost, commissions included', () => {
    const e = game();
    const buy = place(e, { company: 6, shares: 200 });
    e.advance(60);
    const sell = place(e, { company: 6, side: 'sell', shares: 50 });
    const basis = (200 * buy.price + 19.95) / 4;
    expect(e.account().realized).toBeCloseTo(50 * sell.price - 19.95 - basis, 6);
    place(e, { company: 6, side: 'sell', shares: 150 });
    expect(e.positions()).toEqual([]);
    const [closed] = e.closedPositions();
    expect(closed.company).toBe(6);
    expect(closed.realized).toBeCloseTo(e.account().realized, 9);
  });

  it('charges Hard’s percentage commission on top of the fixed fee', () => {
    const e = game(DIFFICULTIES.hard);
    const order = place(e, { company: LIQUID, shares: 10 });
    expect(order.commission).toBeCloseTo(29.95 + 0.0005 * 10 * order.price, 9);
  });
});
