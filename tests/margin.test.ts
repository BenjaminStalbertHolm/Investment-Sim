import { beforeAll, describe, expect, it } from 'vitest';
import type { OrderRequest } from '../src/sim/account';
import { CLOSE, OPEN, addTradingDays, at, dayOf, nextTradingDay } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { MAINTENANCE_LONG, MAINTENANCE_SHORT, buyingPower, requirements } from '../src/sim/margin';
import { DIFFICULTIES as PRESETS, MAX_LEVERAGE, changeSettings, type GameSettings } from '../src/sim/settings';
import { GC_FEE, borrowFee, squeeze } from '../src/sim/shorts';
import { generateWorld, type World } from '../src/world/generator';

// Spec §19, Phase 7: "Margin math matches spec in tests". Spec §12.4: Reg-T margin, 50% initial, 25% maintenance for
// longs and 30% for shorts; margin calls with a deadline, then forced liquidation at the next open, worst positions
// first. Spec §9: max leverage 2:1 (Hard 1.5:1) and a grace of 3, 2 or 1 trading days.

/**
 * Leverage is off in every preset since Phase 8 (a cash account). These tests use the Phase 7 presets, levered as the spec's
 * §9 table has it: Easy $100,000 at 2:1, Medium $1,000,000 at 2:1, Hard $10,000,000 at 1.5:1.
 */
const DIFFICULTIES = {
  easy: changeSettings(PRESETS.easy, { startingCapital: 100_000, maxLeverage: 2 }),
  medium: changeSettings(PRESETS.medium, { startingCapital: 1_000_000, maxLeverage: 2 }),
  hard: changeSettings(PRESETS.hard, { startingCapital: 10_000_000, maxLeverage: 1.5 }),
};

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'margin', companyCount: 1000 });
});
const game = (settings: GameSettings = DIFFICULTIES.medium) => Engine.create(world, { settings, firmName: 'Margin' });
const order = (e: Engine, r: Partial<OrderRequest> & { company: number }) => {
  const result = e.placeOrder({ side: 'buy', type: 'market', shares: 100, tif: 'day', ...r });
  if ('error' in result) throw new Error(result.error);
  return e.orders().find((o) => o.id === result.order.id)!;
};
const error = (e: Engine, r: Partial<OrderRequest> & { company: number }) => {
  const result = e.placeOrder({ side: 'buy', type: 'market', shares: 100, tif: 'day', ...r });
  return 'error' in result ? result.error : undefined;
};
/** The mega cap everyone can trade, and a small company that is not always available to borrow. */
const MEGA = 0;
const small = (e: Engine) => world.companies.findIndex((c, i) => i > 500 && c.marketCap < 1e9 && c.marketCap > 100e6 && e.market.adv[i] * c.price > 2e6);
/** The largest whole number of shares the buying power pays for. */
const maxShares = (e: Engine, company: number, side: 'buy' | 'short' = 'buy') => {
  let lo = 0;
  let hi = Math.ceil((4 * e.account().buyingPower) / e.market.price[company]);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (e.estimate({ company, side, type: 'market', shares: mid, tif: 'day' }).buyingPowerAfter >= 0) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

describe('Reg-T margin (spec §12.4, §9)', () => {
  it('requires 1/leverage of stock positions to open and 25% of longs, 30% of shorts to keep', () => {
    expect(MAINTENANCE_LONG).toBe(0.25);
    expect(MAINTENANCE_SHORT).toBe(0.3);
    // $100k long, $50k short, futures tying up $10k of initial margin, at 2:1.
    expect(requirements(100_000, 50_000, 10_000, 2)).toEqual({ initial: 75_000 + 10_000, maintenance: 25_000 + 15_000 + 7_500 });
    // Hard's 1.5:1 needs two thirds up front.
    expect(requirements(90_000, 0, 0, 1.5).initial).toBeCloseTo(60_000, 9);
    expect(buyingPower(1_000_000, 0, 2)).toBe(2_000_000);
    expect(buyingPower(1_000_000, 1_200_000, 2)).toBe(0);
  });

  it('has leverage off in every preset: buying power is the equity', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      expect(PRESETS[d].maxLeverage).toBe(1);
      expect(game(PRESETS[d]).account().buyingPower).toBeCloseTo(PRESETS[d].startingCapital, 6);
    }
    expect([PRESETS.easy, PRESETS.medium, PRESETS.hard].map((s) => s.startingCapital)).toEqual([10_000_000, 2_500_000, 1_000_000]);
  });

  it('allows up to 15:1, keeping maintenance at half the initial requirement beyond 2:1', () => {
    expect(requirements(150_000, 0, 0, MAX_LEVERAGE)).toEqual({ initial: 10_000, maintenance: 5_000 });
    expect(requirements(0, 100_000, 0, 4).maintenance).toBeCloseTo(15_000, 9);
    const e = game(changeSettings(PRESETS.medium, { maxLeverage: MAX_LEVERAGE }));
    expect(e.account().buyingPower).toBeCloseTo(15 * 2_500_000, 6);
    order(e, { company: MEGA, shares: maxShares(e, MEGA) });
    const a = e.account();
    expect(a.longValue / a.equity).toBeGreaterThan(14.5);
    // Fully levered, but not yet in a margin call: maintenance is half the initial requirement.
    expect(a.maintenance).toBeCloseTo(a.longValue / 30, 6);
    expect(a.equity).toBeGreaterThan(a.maintenance);
  });

  it('gives buying power of 2:1 on Easy and Medium and 1.5:1 on Hard', () => {
    expect(game(DIFFICULTIES.easy).account().buyingPower).toBeCloseTo(2 * 100_000, 6);
    expect(game(DIFFICULTIES.medium).account().buyingPower).toBeCloseTo(2 * 1_000_000, 6);
    expect(game(DIFFICULTIES.hard).account().buyingPower).toBeCloseTo(1.5 * 10_000_000, 6);
  });

  it('buys on margin up to the initial requirement and not a share more', () => {
    const e = game();
    const shares = maxShares(e, MEGA);
    const o = order(e, { company: MEGA, shares });
    expect(o.status).toBe('filled');
    const a = e.account();
    // About $2M of stock on $1M: a debit balance of about $1M, and the position needs 50% of its value.
    expect(a.longValue).toBeGreaterThan(1.97e6);
    expect(a.cash).toBeLessThan(-0.97e6);
    expect(a.initial).toBeCloseTo(a.longValue / 2, 6);
    expect(a.maintenance).toBeCloseTo(0.25 * a.longValue, 6);
    expect(a.equity).toBeCloseTo(a.cash + a.longValue, 6);
    expect(a.excess).toBeCloseTo(a.equity - a.initial, 6);
    expect(a.buyingPower).toBeGreaterThanOrEqual(-1e-6);
    expect(a.buyingPower).toBeLessThan(e.market.price[MEGA] * 3);
    expect(error(e, { company: MEGA, shares: 10 })).toBe('Insufficient buying power.');
    // Hard's 1.5:1 buys three quarters as much.
    const hard = game(DIFFICULTIES.hard);
    order(hard, { company: MEGA, shares: maxShares(hard, MEGA) });
    expect(hard.account().longValue / hard.account().equity).toBeCloseTo(1.5, 1);
  });

  it('credits a short sale’s proceeds and holds 30% of the short against it', () => {
    const e = game();
    const o = order(e, { company: MEGA, side: 'short', shares: 2000 });
    const a = e.account();
    const value = 2000 * e.market.price[MEGA];
    expect(o.status).toBe('filled');
    expect(e.positions()[0]).toMatchObject({ company: MEGA, shares: -2000 });
    expect(a.cash).toBeCloseTo(1_000_000 + 2000 * o.price - o.commission, 6);
    expect(a.shortValue).toBeCloseTo(value, 6);
    expect(a.initial).toBeCloseTo(value / 2, 6);
    expect(a.maintenance).toBeCloseTo(0.3 * value, 6);
    // Only Buy to Cover closes a short, only Sell a long.
    expect(error(e, { company: MEGA, side: 'buy', shares: 1 })).toMatch(/Buy to Cover/);
    expect(error(e, { company: MEGA, side: 'sell', shares: 1 })).toBe('You have no shares to sell.');
    expect(error(e, { company: MEGA, side: 'cover', shares: 2001 })).toBe('You can cover at most 2,000 shares.');
    const cover = order(e, { company: MEGA, side: 'cover', shares: 2000 });
    expect(cover.status).toBe('filled');
    expect(e.positions()).toHaveLength(0);
    expect(e.closedPositions()[0].realized).toBeCloseTo(2000 * (o.price - cover.price) - o.commission - cover.commission, 6);
    expect(error(game(), { company: 3, side: 'cover', shares: 1 })).toMatch(/no short position/);
    const noShorts = game({ ...DIFFICULTIES.medium, shortSelling: false });
    expect(error(noShorts, { company: MEGA, side: 'short', shares: 1 })).toMatch(/switched off/);
  });

  it('charges borrow fees every night: 0.3% a year for large caps, far more when borrow is tight', () => {
    const e = game();
    const s = small(e);
    order(e, { company: MEGA, side: 'short', shares: 1000 });
    e.runSessions(1);
    const fee = e.ledger().find((l) => l.kind === 'borrowFee')!;
    const nights = nextTradingDay(dayOf(e.time)) - dayOf(e.time);
    expect(fee.amount).toBeCloseTo((-GC_FEE * 1000 * e.market.price[MEGA] * nights) / 360, 6);
    expect(e.positions()[0].fees).toBeCloseTo(-fee.amount, 9);
    // A crowded short: the fee rises with how much of the lendable float is out on loan, up to 60%.
    expect(borrowFee(0.4)).toBe(GC_FEE);
    expect(borrowFee(0.9)).toBeGreaterThan(0.3);
    expect(borrowFee(2)).toBe(0.6);
    e.market.state.shortInterest[s] = 0.33;
    const b = e.borrow(s);
    expect(b.fee).toBeGreaterThan(0.1);
    expect(error(e, { company: s, side: 'short', shares: b.available + 1 })).toMatch(/can locate only|cannot locate/);
    e.market.state.shortInterest[s] = 0.4;
    expect(e.borrow(s).available).toBe(0);
    expect(error(e, { company: s, side: 'short', shares: 1 })).toMatch(/cannot locate any shares/);
  });

  it('squeezes heavily shorted stocks on good news, and brings shorts in on bad news', () => {
    expect(squeeze(0.05)).toBe(1);
    expect(squeeze(0.3)).toBeCloseTo(1.6, 9);
    const e = game();
    const s = small(e);
    e.market.state.shortInterest[s] = 0.3;
    const si = e.borrow(s).shortInterest;
    expect(e.squeeze(s, 0.1)).toBeCloseTo(0.1 * squeeze(si), 9);
    expect(e.market.state.shortInterest[s]).toBeCloseTo(0.3 * 0.7, 6);
    const before = e.market.state.shortInterest[s];
    expect(e.squeeze(s, -0.2)).toBe(-0.2);
    expect(e.market.state.shortInterest[s]).toBeGreaterThan(before);
  });

  it('recalls borrowed shares now and then, and buys in a short left open past the deadline', () => {
    const e = game();
    const s = small(e);
    order(e, { company: s, side: 'short', shares: 2000 });
    // A crowded stock: lenders want their shares back.
    let recall;
    for (let k = 0; k < 150 && !recall; k++) {
      e.market.state.shortInterest[s] = 0.33;
      e.runSessions(1);
      recall = e.mail().messages.find((m) => m.kind === 'recall');
    }
    expect(recall).toMatchObject({ company: s, amount: 2000 });
    const due = recall!.day!;
    expect(due).toBe(addTradingDays(dayOf(recall!.time), 2));
    expect(e.positions().find((p) => p.company === s)!.recall).toBe(due);
    e.advanceTo(at(due, OPEN + 5));
    expect(e.positions().find((p) => p.company === s)).toBeUndefined();
    const buyIn = e.orders().find((o) => o.forced === 'buyIn')!;
    expect(buyIn).toMatchObject({ company: s, side: 'cover', shares: 2000, status: 'filled' });
    expect(e.mail().messages.some((m) => m.kind === 'buyIn' && m.company === s)).toBe(true);
  }, 60_000);
});

describe('margin calls (spec §12.4)', () => {
  /** Buys as much as the buying power allows, then knocks the price down before the close. */
  function overextend(e: Engine, company: number, drop: number): void {
    order(e, { company, shares: maxShares(e, company) });
    e.advanceTo(at(dayOf(e.time), CLOSE - 5));
    e.market.push(company, -drop);
    e.advanceTo(at(dayOf(e.time), CLOSE));
  }

  it('calls when equity falls below maintenance, with the difficulty’s grace, then liquidates at the open', () => {
    let liquidated = 0;
    for (const [difficulty, grace] of [['easy', 3], ['medium', 2], ['hard', 1]] as const) {
      const e = game(DIFFICULTIES[difficulty]);
      // At 2:1 a fall of a third brings a call (and one of half leaves nothing); at Hard's 1.5:1 one of more than 55%.
      overextend(e, MEGA, difficulty === 'hard' ? 0.6 : 0.4);
      const a = e.account();
      const day = dayOf(e.time);
      expect(a.equity).toBeLessThan(a.maintenance);
      expect(a.call).toMatchObject({ due: addTradingDays(day, grace) });
      expect(a.call!.amount).toBeCloseTo(a.maintenance - a.equity, 2);
      const call = e.mail().messages.find((m) => m.kind === 'marginCall')!;
      expect(call).toMatchObject({ day: addTradingDays(day, grace) });
      // Opening new positions is blocked while the call stands; closing them is not.
      expect(error(e, { company: 3, shares: 1 })).toMatch(/margin call/);
      // The day before it is due nothing is sold; at the due open the broker sells, worst first, until it is met.
      if (grace > 1) {
        e.advanceTo(at(addTradingDays(day, grace - 1), CLOSE));
        expect(e.orders().some((o) => o.forced)).toBe(false);
      }
      const due = addTradingDays(day, grace);
      e.advanceTo(at(due, OPEN));
      const forced = e.orders().filter((o) => o.forced === 'margin');
      if (e.mail().messages.some((m) => m.kind === 'marginMet')) continue; // the market saved it (it can, over three days)
      expect(forced.length).toBeGreaterThan(0);
      expect(forced.every((o) => o.side === 'sell' && o.company === MEGA)).toBe(true);
      const after = e.account();
      expect(after.equity).toBeGreaterThanOrEqual(after.maintenance);
      expect(after.call).toBeUndefined();
      expect(after.longValue).toBeGreaterThan(0); // only as much as needed was sold
      expect(e.mail().messages.some((m) => m.kind === 'liquidation' && m.reason === 'margin')).toBe(true);
      liquidated++;
    }
    expect(liquidated).toBeGreaterThanOrEqual(2);
  });

  it('is met when the equity is back above maintenance at a close', () => {
    const e = game();
    overextend(e, MEGA, 0.45);
    expect(e.account().call).toBeDefined();
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), OPEN + 30));
    // Selling cuts the requirement but not the equity: most of it has to go.
    order(e, { company: MEGA, side: 'sell', shares: Math.ceil(e.held(MEGA) * 0.8) });
    e.runSessions(1);
    expect(e.account().call).toBeUndefined();
    expect(e.mail().messages.some((m) => m.kind === 'marginMet')).toBe(true);
    e.runSessions(3);
    expect(e.orders().some((o) => o.forced)).toBe(false);
  });

  it('sells the worst positions first', () => {
    const e = game();
    const [a, b] = [1, 2];
    order(e, { company: a, shares: Math.floor(maxShares(e, a) / 2) });
    order(e, { company: b, shares: maxShares(e, b) });
    e.advanceTo(at(dayOf(e.time), CLOSE - 5));
    e.market.push(a, -0.3);
    e.market.push(b, -0.5);
    e.advanceTo(at(dayOf(e.time), CLOSE));
    const due = e.account().call!.due;
    e.advanceTo(at(due, OPEN));
    const forced = e.orders().filter((o) => o.forced === 'margin');
    expect(forced.length).toBeGreaterThan(0);
    expect(forced[0].company).toBe(b);
  });

  it('goes bankrupt when even selling everything cannot cover the debt, unless bankruptcy is off', () => {
    for (const noBankruptcy of [false, true]) {
      const e = game({ ...DIFFICULTIES.medium, noBankruptcy });
      overextend(e, MEGA, 0.7);
      const a = e.account();
      expect(a.equity).toBeLessThan(0);
      // Negative equity is due at the next open, whatever the grace.
      expect(a.call!.due).toBe(nextTradingDay(dayOf(e.time)));
      e.advanceTo(at(a.call!.due, OPEN + 60));
      expect(e.positions()).toHaveLength(0);
      if (noBankruptcy) {
        expect(e.bankrupt).toBe(false);
        expect(e.account().cash).toBeLessThan(0);
        e.runSessions(5);
        expect(e.account().call).toBeUndefined();
        continue;
      }
      expect(e.bankrupt).toBe(true);
      const report = e.bankruptcy()!;
      expect(report).toMatchObject({ cause: 'margin', firmName: 'Margin', day: a.call!.due });
      expect(report.netWorth).toBeLessThan(0);
      expect(report.worst?.label).toBe(world.companies[MEGA].ticker);
      expect(e.mail().messages.at(-1)).toMatchObject({ kind: 'bankrupt', reason: 'margin' });
      expect(e.drainEvents().some((ev) => ev.kind === 'bankrupt')).toBe(true);
      // The clock has stopped, and nothing more can be done.
      const time = e.time;
      e.runSessions(5);
      expect(e.time).toBe(time);
      expect(error(e, { company: 3, shares: 1 })).toBe('The firm is bankrupt.');
    }
  });
});

describe('stop orders (spec §12.2)', () => {
  it('sells on a stop once the price falls to it, and not before', () => {
    const e = game();
    order(e, { company: MEGA, shares: 1000 });
    const price = e.market.price[MEGA];
    const stop = order(e, { company: MEGA, side: 'sell', type: 'stop', stop: price * 0.9, shares: 1000, tif: 'gtc' });
    expect(stop.status).toBe('open');
    e.advance(30);
    expect(e.orders().find((o) => o.id === stop.id)!.status).toBe('open');
    e.market.push(MEGA, -0.15);
    e.advance(5);
    const filled = e.orders().find((o) => o.id === stop.id)!;
    expect(filled).toMatchObject({ status: 'filled', triggered: true, filled: 1000 });
    expect(e.held(MEGA)).toBe(0);
  });

  it('trails a stop behind the best price, and turns a stop-limit into a limit order', () => {
    const e = game();
    order(e, { company: MEGA, shares: 500 });
    const trailing = order(e, { company: MEGA, side: 'sell', type: 'trailingStop', trail: 0.1, shares: 500, tif: 'gtc' });
    const start = e.market.price[MEGA];
    expect(trailing.stop).toBeCloseTo(start * 0.9, 6);
    e.market.push(MEGA, 0.2);
    e.advance(5);
    const raised = e.orders().find((o) => o.id === trailing.id)!;
    expect(raised.status).toBe('open');
    expect(raised.stop).toBeGreaterThan(start * 0.9 * 1.15);
    // A cover stop-limit for a short: triggered by a rise, then works as a limit.
    order(e, { company: 5, side: 'short', shares: 300 });
    const p = e.market.price[5];
    const stopLimit = order(e, { company: 5, side: 'cover', type: 'stopLimit', stop: p * 1.05, limit: p * 1.2, shares: 300, tif: 'gtc' });
    e.market.push(5, 0.08);
    e.advance(5);
    expect(e.orders().find((o) => o.id === stopLimit.id)).toMatchObject({ triggered: true, status: 'filled' });
    expect(error(e, { company: 5, side: 'buy', type: 'stop', shares: 1 })).toBe('Enter a stop price.');
    expect(error(e, { company: 5, side: 'buy', type: 'trailingStop', trail: 0.9, shares: 1 })).toMatch(/trail between/);
  });
});
