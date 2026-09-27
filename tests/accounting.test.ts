import fc from 'fast-check';
import { beforeAll, expect, it } from 'vitest';
import type { OrderRequest, OrderType } from '../src/sim/account';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { generateWorld, type World } from '../src/world/generator';

// Spec §19, Phase 3: "P&L accounting invariant tests pass". Random sessions of orders, cancels and time passing, with
// the account's books checked after every step. Phase 7 adds short sales and covers, stop orders, a margin account and
// bank loans.

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'accounting', companyCount: 1000 });
});

/** Mega caps to nano caps. */
const COMPANIES = [0, 1, 2, 50, 300, 600, 900, 950, 990, 999];

const order = {
  type: fc.constantFrom<OrderType>('market', 'limit', 'stop', 'stopLimit', 'trailingStop'),
  /** Limit or stop relative to the last price. */
  offset: fc.double({ min: -0.05, max: 0.05, noNaN: true }),
  tif: fc.constantFrom('day' as const, 'gtc' as const),
};
const action = fc.oneof(
  // Buys and short sales spend a share of the buying power, which on the small caps is many days' volume.
  { weight: 3, arbitrary: fc.record({ kind: fc.constantFrom('buy' as const, 'short' as const), company: fc.constantFrom(...COMPANIES), size: fc.double({ min: 0.001, max: 0.4, noNaN: true }), ...order }) },
  // Sales and covers take a share of a position, sometimes all of it.
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('close' as const), nth: fc.nat(), size: fc.oneof(fc.constant(1), fc.double({ min: 0.01, max: 1, noNaN: true })), ...order }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('advance' as const), minutes: fc.integer({ min: 1, max: 1500 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('cancel' as const), nth: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('loan' as const), amount: fc.integer({ min: 10_000, max: 400_000 }) }) },
);

type Action = typeof action extends fc.Arbitrary<infer A> ? A : never;

function apply(e: Engine, a: Action): void {
  if (a.kind === 'advance') return e.advance(a.minutes);
  if (a.kind === 'loan') {
    e.takeLoan(a.amount, a.amount % 2 ? 'interestOnly' : 'amortising', 12);
    return;
  }
  if (a.kind === 'cancel') {
    const open = e.openOrders();
    if (open.length) e.cancelOrder(open[a.nth % open.length].id);
    return;
  }
  let request: Pick<OrderRequest, 'company' | 'side' | 'shares'>;
  if (a.kind === 'close') {
    const positions = e.positions();
    if (!positions.length) return;
    const p = positions[a.nth % positions.length];
    request = { company: p.company, side: p.shares > 0 ? 'sell' : 'cover', shares: Math.max(1, Math.floor(a.size * Math.abs(p.shares))) };
  } else {
    request = { company: a.company, side: a.kind, shares: Math.max(1, Math.floor((a.size * e.account().buyingPower) / e.market.price[a.company])) };
  }
  const price = e.market.price[request.company] * (1 + a.offset);
  // A stop sits where the market has yet to go: above it for Buy and Buy to Cover, below it for Sell and Sell Short.
  const up = request.side === 'buy' || request.side === 'cover';
  const stop = e.market.price[request.company] * (1 + (up ? 1 : -1) * Math.abs(a.offset));
  e.placeOrder({
    ...request,
    type: a.type,
    limit: a.type === 'limit' || a.type === 'stopLimit' ? price : undefined,
    stop: a.type === 'stop' || a.type === 'stopLimit' ? stop : undefined,
    trail: a.type === 'trailingStop' ? 0.05 : undefined,
    tif: a.tif,
  });
}

function checkBooks(e: Engine): void {
  const account = e.account();
  const ledger = e.ledger();
  const orders = e.orders();

  // The ledger is the cash: each balance is the running sum, the last one is the account's cash.
  let running = 0;
  for (const entry of ledger) {
    running += entry.amount;
    expect(entry.balance).toBeCloseTo(running, 6);
  }
  expect(ledger.at(-1)!.balance).toBe(account.cash);
  // A margin account: buying power never exceeds max leverage times the equity, and equity is what it says.
  expect(account.buyingPower).toBeLessThanOrEqual(e.settings.maxLeverage * Math.max(0, account.equity) + 1e-6);
  expect(account.equity).toBeCloseTo(account.cash + account.longValue - account.shortValue + account.futuresPnl, 6);

  // Positions are exactly the shares bought (or covered) less the shares sold (or sold short).
  const shares = new Map<number, number>();
  const add = (company: number, n: number) => shares.set(company, (shares.get(company) ?? 0) + n);
  for (const l of ledger) {
    if (l.kind === 'buy' || l.kind === 'cover') add(l.company!, l.shares!);
    if (l.kind === 'sell' || l.kind === 'short') add(l.company!, -l.shares!);
    // Positions paid out in a takeover or written off in a bankruptcy (Phase 6), long or short.
    if (l.kind === 'acquisition' || l.kind === 'writeoff') add(l.company!, -l.shares!);
  }
  const held = new Map(e.positions().map((p) => [p.company, p.shares]));
  for (const [company, n] of shares) expect(held.get(company) ?? 0).toBe(n);
  for (const p of e.positions()) expect(Number.isInteger(p.shares) && p.shares !== 0).toBe(true);

  // Everything made or lost is realised (dividends, borrow fees and interest included) or unrealised:
  // net worth − net deposits = realised + unrealised. Loans add cash and debt alike.
  expect(account.netWorth - account.deposits).toBeCloseTo(account.realized + account.unrealized, 4);

  // Orders never overfill, and commissions in the ledger are the orders' commissions.
  for (const o of orders) {
    expect(o.filled).toBeLessThanOrEqual(o.shares);
    expect(o.status === 'filled').toBe(o.filled === o.shares);
  }
  const charged = ledger.filter((l) => l.kind === 'commission').reduce((a, l) => a - l.amount, 0);
  expect(charged).toBeCloseTo(orders.reduce((a, o) => a + o.commission, 0), 6);
}

it('keeps the books balanced through any sequence of orders', () => {
  fc.assert(
    fc.property(fc.array(action, { minLength: 10, maxLength: 40, size: 'max' }), (actions) => {
      const e = Engine.create(world, { settings: DIFFICULTIES.hard, firmName: 'Test' });
      for (const a of actions) {
        apply(e, a);
        checkBooks(e);
      }
    }),
    { numRuns: 60 },
  );
}, 120_000);
