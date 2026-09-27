import { book, type Account, type Goods } from './account';
import type { GameTime } from './calendar';
import { parseContract } from './commodities';
import { CONTRACTS, CONTRACT_INDEX, FTD_FINE, PHYSICAL_DISCOUNT, STORAGE_RATE } from './data/commodities';

/**
 * Futures positions in the account (spec §12.3): trades, the daily settlement, expiry, and the goods a long position held
 * too long leaves in the lobby. Prices come from sim/commodities.ts.
 */

export const multiplierOf = (key: string) => CONTRACTS[parseContract(key)!.k].multiplier;

/**
 * Books a trade of `contracts` (positive buys, negative sells) at `price`. The part that closes an open position pays
 * its P&L since the last settlement into cash at once; the rest opens or adds to the position. The commission is a cost
 * of the position traded (the one it closes, when it closes one).
 */
export function bookFutures(account: Account, key: string, contracts: number, price: number, commission: number, time: GameTime): void {
  const multiplier = multiplierOf(key);
  const existing = account.futures.find((x) => x.contract === key);
  let rest = contracts;
  let cash = 0;
  if (existing) {
    existing.realized -= commission;
    if (Math.sign(existing.contracts) !== Math.sign(rest)) {
      const closing = Math.sign(rest) * Math.min(Math.abs(rest), Math.abs(existing.contracts));
      cash = (price - existing.mark) * -closing * multiplier;
      existing.realized += cash;
      existing.contracts += closing;
      rest -= closing;
      if (!existing.contracts) {
        account.futures.splice(account.futures.indexOf(existing), 1);
        account.closed.push({ company: -1, contract: key, opened: existing.opened, closed: time, realized: existing.realized });
      }
    }
  }
  if (rest) {
    let p = existing?.contracts ? existing : undefined;
    if (!p) account.futures.push((p = { contract: key, contracts: 0, entry: price, mark: price, realized: existing ? 0 : -commission, opened: time }));
    // Marks and entries average over the contracts, so the next settlement pays each from its own price.
    p.mark = (p.mark * p.contracts + price * rest) / (p.contracts + rest);
    p.entry = (p.entry * p.contracts + price * rest) / (p.contracts + rest);
    p.contracts += rest;
  }
  const lines = { contract: key, shares: Math.abs(contracts), price };
  // The trade itself, and whatever P&L it closed out; the note says which way it went.
  book(account, time, 'futures', cash, { ...lines, note: contracts > 0 ? 'buy' : 'sell' });
  if (commission) book(account, time, 'commission', -commission, lines);
}

/** The daily settlement (spec §12.3): each position's change since its mark is paid in cash as variation margin. */
export function settleFutures(account: Account, settle: (key: string) => number, time: GameTime): void {
  for (const p of account.futures) {
    const price = settle(p.contract);
    const variation = (price - p.mark) * p.contracts * multiplierOf(p.contract);
    p.mark = price;
    p.realized += variation;
    if (variation) book(account, time, 'variation', variation, { contract: p.contract, shares: Math.abs(p.contracts), price });
  }
}

/** What happened to a contract held to its expiry. */
export interface Expiry {
  contract: string;
  contracts: number;
  /** Goods delivered (the invoice paid for them), a failure to deliver (the fine), or financial futures settled in cash. */
  outcome: 'delivered' | 'fined' | 'settled';
  amount: number;
  /** Units delivered: barrels, bushels… */
  quantity?: number;
}

/**
 * Contracts at their last trading day, after the final settlement at spot (spec §12.3): a long position in a commodity
 * takes delivery — the invoice is paid and the goods go to the lobby — a short one fails to deliver and is fined, and
 * financial futures settle in cash.
 */
export function expire(account: Account, day: number, spot: (k: number) => number, time: GameTime): Expiry[] {
  const out: Expiry[] = [];
  for (const p of [...account.futures]) {
    const c = parseContract(p.contract)!;
    if (c.expiry > day) continue;
    const spec = CONTRACTS[c.k];
    const price = spot(c.k);
    const lines = { contract: p.contract, shares: Math.abs(p.contracts), price };
    const e: Expiry = { contract: p.contract, contracts: p.contracts, outcome: 'settled', amount: 0 };
    if (spec.delivery && p.contracts > 0) {
      e.outcome = 'delivered';
      e.quantity = p.contracts * spec.delivery.quantity;
      e.amount = price * p.contracts * spec.multiplier;
      book(account, time, 'delivery', -e.amount, lines);
      const goods = account.goods.find((g) => g.code === spec.code);
      if (goods) {
        goods.quantity += e.quantity;
        goods.cost += e.amount;
      } else account.goods.push({ code: spec.code, quantity: e.quantity, cost: e.amount, storage: 0, delivered: time });
    } else if (spec.delivery) {
      e.outcome = 'fined';
      e.amount = FTD_FINE * price * -p.contracts * spec.multiplier;
      book(account, time, 'fine', -e.amount, { ...lines, note: 'Failure to deliver' });
      p.realized -= e.amount;
    }
    account.futures.splice(account.futures.indexOf(p), 1);
    account.closed.push({ company: -1, contract: p.contract, opened: p.opened, closed: time, realized: p.realized });
    out.push(e);
  }
  return out;
}

/** Goods at the spot price: units × spot, in the contract's quoting unit. */
export function goodsAtSpot(g: Goods, spot: number): number {
  const spec = CONTRACTS[CONTRACT_INDEX[g.code]];
  return (g.quantity * spot * spec.multiplier) / spec.delivery!.quantity;
}

/** What goods in the lobby fetch: a local merchant pays spot less a discount (spec §12.3). */
export const goodsValue = (g: Goods, spot: number) => goodsAtSpot(g, spot) * (1 - PHYSICAL_DISCOUNT);

/** Storage for goods in the lobby, charged at each close for the calendar days until the next session. */
export function chargeStorage(account: Account, days: number, spot: (code: string) => number, time: GameTime): void {
  for (const g of account.goods) {
    const fee = STORAGE_RATE * days * goodsAtSpot(g, spot(g.code));
    g.storage += fee;
    book(account, time, 'storage', -fee, { contract: g.code, shares: g.quantity });
  }
}

/** Sells goods from the lobby to the local merchant. Returns the proceeds, or undefined when there are none. */
export function sellGoods(account: Account, code: string, spot: number, time: GameTime): number | undefined {
  const g = account.goods.find((x) => x.code === code);
  if (!g) return undefined;
  const proceeds = goodsValue(g, spot);
  book(account, time, 'goods', proceeds, { contract: code, shares: g.quantity });
  account.goods.splice(account.goods.indexOf(g), 1);
  account.closed.push({ company: -1, goods: code, opened: g.delivered, closed: time, realized: proceeds - g.cost - g.storage });
  return proceeds;
}
