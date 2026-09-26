import fc from 'fast-check';
import { beforeAll, expect, it } from 'vitest';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { generateWorld, type World } from '../src/world/generator';

// Spec §19, Phase 3: "P&L accounting invariant tests pass". Random sessions of orders, cancels and time passing, with
// the account's books checked after every step.

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'accounting', companyCount: 1000 });
});

/** Mega caps to nano caps. */
const COMPANIES = [0, 1, 2, 50, 300, 600, 900, 950, 990, 999];

const order = {
  type: fc.constantFrom('market' as const, 'limit' as const),
  /** Limit relative to the last price. */
  offset: fc.double({ min: -0.05, max: 0.05, noNaN: true }),
  tif: fc.constantFrom('day' as const, 'gtc' as const),
};
const action = fc.oneof(
  // Buys spend a share of the buying power, which on the small caps is many days' volume.
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('buy' as const), company: fc.constantFrom(...COMPANIES), size: fc.double({ min: 0.001, max: 0.4, noNaN: true }), ...order }) },
  // Sells take a share of a holding, sometimes all of it.
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('sell' as const), nth: fc.nat(), size: fc.oneof(fc.constant(1), fc.double({ min: 0.01, max: 1, noNaN: true })), ...order }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('advance' as const), minutes: fc.integer({ min: 1, max: 1500 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('cancel' as const), nth: fc.nat() }) },
);

type Action = typeof action extends fc.Arbitrary<infer A> ? A : never;

function apply(e: Engine, a: Action): void {
  if (a.kind === 'advance') return e.advance(a.minutes);
  if (a.kind === 'cancel') {
    const open = e.openOrders();
    if (open.length) e.cancelOrder(open[a.nth % open.length].id);
    return;
  }
  let company: number;
  let shares: number;
  if (a.kind === 'buy') {
    company = a.company;
    shares = Math.max(1, Math.floor((a.size * e.account().buyingPower) / e.market.price[company]));
  } else {
    const positions = e.positions();
    if (!positions.length) return;
    const position = positions[a.nth % positions.length];
    company = position.company;
    shares = Math.max(1, Math.floor(a.size * position.shares));
  }
  const limit = a.type === 'limit' ? e.market.price[company] * (1 + a.offset) : undefined;
  e.placeOrder({ company, side: a.kind, type: a.type, shares, limit, tif: a.tif });
}

function checkBooks(e: Engine): void {
  const tolerance = 1e-9 * 1_000_000;
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
  // A cash account never overdraws, and open orders only ever hold cash back.
  expect(account.cash).toBeGreaterThanOrEqual(-tolerance);
  expect(account.buyingPower).toBeLessThanOrEqual(account.cash + tolerance);

  // Positions are exactly the shares bought less the shares sold.
  const shares = new Map<number, number>();
  for (const l of ledger) {
    if (l.kind === 'buy') shares.set(l.company!, (shares.get(l.company!) ?? 0) + l.shares!);
    // Sales, and positions paid out in a takeover or written off in a bankruptcy (Phase 6).
    if (l.kind === 'sell' || l.kind === 'acquisition' || l.kind === 'writeoff') shares.set(l.company!, (shares.get(l.company!) ?? 0) - l.shares!);
  }
  const held = new Map(e.positions().map((p) => [p.company, p.shares]));
  for (const [company, n] of shares) expect(held.get(company) ?? 0).toBe(n);
  for (const p of e.positions()) expect(Number.isInteger(p.shares) && p.shares > 0).toBe(true);

  // Everything made or lost is either realised (dividends included) or unrealised: net worth − net deposits = realised + unrealised.
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
