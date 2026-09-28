import type { GameTime } from './calendar';

/** Buy and Sell trade a long position; Sell Short and Buy to Cover a short one (spec §12.2). */
export type Side = 'buy' | 'sell' | 'short' | 'cover';
export type OrderType = 'market' | 'limit' | 'stop' | 'stopLimit' | 'trailingStop';
export type TimeInForce = 'day' | 'gtc';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'expired' | 'rejected';

/** +1 for the sides that buy shares (Buy, Buy to Cover), −1 for those that sell them (Sell, Sell Short). */
export const direction = (side: Side) => (side === 'buy' || side === 'cover' ? 1 : -1);
/** Whether a side opens or adds to a position (Buy, Sell Short) rather than closing one. */
export const opens = (side: Side) => side === 'buy' || side === 'short';
/** Stop orders wait for the market to reach their stop. */
export const isStop = (type: OrderType) => type === 'stop' || type === 'stopLimit' || type === 'trailingStop';

/** What the order ticket sends (spec §12.2). */
export interface OrderRequest {
  company: number;
  side: Side;
  type: OrderType;
  shares: number;
  /** Limit price: limit and stop-limit orders. */
  limit?: number;
  /** Stop price: stop and stop-limit orders. A trailing stop keeps its own, following the market. */
  stop?: number;
  /** Trailing stops: how far behind the best price since it was placed the stop follows, as a fraction. */
  trail?: number;
  tif: TimeInForce;
  /** Open order this one replaces (Modify): it is cancelled when this one is accepted. */
  replaces?: number;
}

export interface Order extends OrderRequest {
  id: number;
  placed: GameTime;
  status: OrderStatus;
  filled: number;
  /** Average fill price. */
  price: number;
  commission: number;
  updated: GameTime;
  /** Why it was rejected or cancelled by the broker. */
  note?: string;
  /** A stop order whose stop the market reached: it now works as a market order (a limit order, for stop-limits). */
  triggered?: boolean;
  /** Placed by the broker rather than the player: a margin call's liquidation, a buy-in after a recall, a loan default. */
  forced?: 'margin' | 'buyIn' | 'loan' | 'fine' | 'shark' | 'bills' | 'payroll';
}

/**
 * A holding: `shares` is negative for a short position. `cost` is its remaining cost basis, commissions included (what
 * was paid for a long; for a short, minus what the sale brought in); `realized` the P&L of shares already closed.
 */
export interface Position {
  company: number;
  shares: number;
  cost: number;
  realized: number;
  opened: GameTime;
  /** Borrow fees paid on a short so far (spec §12.5); they are part of its realised P&L. */
  fees?: number;
  /** The lender has recalled the shares (spec §12.4): the trading day the short must be covered by. */
  recall?: number;
}

/**
 * A position closed out: stocks by company; futures by contract, goods from the lobby by commodity and index funds by
 * fund (company −1).
 * The losers are what the Recycle Bin shows.
 */
export interface ClosedPosition {
  company: number;
  contract?: string;
  goods?: string;
  /** An index fund (data/funds.ts FUNDS index). */
  fund?: number;
  opened: GameTime;
  closed: GameTime;
  realized: number;
}

/**
 * A futures position (spec §12.3), negative contracts for a short. It is marked to market at each close: the change from
 * `mark` is paid into or out of cash as variation margin, and `mark` becomes the settlement price.
 */
export interface FuturesPosition {
  /** The contract's key, "CL:23954". */
  contract: string;
  contracts: number;
  /** Average price the position was built at, for P&L since entry. */
  entry: number;
  /** Price it was last settled (or since traded) at. */
  mark: number;
  /** Variation margin and closing P&L so far, less commissions. */
  realized: number;
  opened: GameTime;
  /** The expiry warning has gone out (spec §15.2). */
  warned?: boolean;
}

/** Goods a long futures position held past its last trading day left in the office lobby (spec §12.3). */
export interface Goods {
  code: string;
  /** Barrels, bushels, ounces… */
  quantity: number;
  /** What delivery cost. */
  cost: number;
  /** Storage fees paid since. */
  storage: number;
  delivered: GameTime;
}

/** Units of an index fund (spec §11.5): a long position, valued at the fund's net asset value. */
export interface FundPosition {
  fund: number;
  units: number;
  /** What the units still held cost, commissions included, and the P&L of units already sold. */
  cost: number;
  realized: number;
  opened: GameTime;
}

/** A margin call (spec §12.4): the amount the account's equity fell short of maintenance, and the day it is due by. */
export interface MarginCall {
  issued: GameTime;
  due: number;
  amount: number;
}

/**
 * Deposits and withdrawals are clients' money in and out (spec §15.1); an acquisition pays out shares at the offer
 * price and a write-off removes a bankrupt company's shares (spec §11.6). Phase 7 adds shorts and their borrow fees,
 * margin interest, futures trades and variation margin, deliveries, storage and sales of goods, exchange fines and bank
 * loans (spec §12.7).
 */
export type LedgerKind =
  | 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'short' | 'cover' | 'commission' | 'dividend' | 'acquisition' | 'writeoff'
  | 'borrowFee' | 'interest' | 'futures' | 'variation' | 'delivery' | 'storage' | 'goods' | 'fine'
  | 'loan' | 'repayment' | 'loanInterest' | 'loanFee'
  // Phase 8: index fund units bought and sold, the regulator's fines, a strategic investor's money and its share of fees.
  | 'fund' | 'sobFine' | 'investment' | 'feeShare'
  // Phase 9: the dark web (spec §14A) — "Consulting fees" and payments through a shell, damages, a loan shark's money.
  | 'consulting' | 'offshore' | 'lawsuit' | 'shark' | 'sharkInterest'
  // Phase 10: wages and rent, luxuries and their upkeep, collectibles, conference tickets, the lotto and subscriptions.
  | 'payroll' | 'rent' | 'asset' | 'upkeep' | 'collectible' | 'ticket' | 'lotto' | 'subscription'
  // Phase 10B: cash for fractional shares after a reverse split, and the Tamagotcha's resurrection.
  | 'cashInLieu' | 'pet';

/** A line of the cash ledger (spec §12.7). `balance` is the cash after it. */
export interface LedgerEntry {
  time: GameTime;
  kind: LedgerKind;
  amount: number;
  balance: number;
  company?: number;
  shares?: number;
  price?: number;
  order?: number;
  /** Futures contract, or commodity code for goods. */
  contract?: string;
  /** Index fund (units in `shares`). */
  fund?: number;
  /** Whose money: the client of a deposit or withdrawal. Or what a charge was for. */
  note?: string;
}

/** The firm's brokerage account: a margin account (spec §12.4). */
export interface Account {
  cash: number;
  deposits: number;
  positions: Position[];
  closed: ClosedPosition[];
  ledger: LedgerEntry[];
  /** Every open order, and the most recent ones that closed (see `pruneBooks`), oldest first. */
  orders: Order[];
  nextOrder: number;
  futures: FuturesPosition[];
  goods: Goods[];
  /** Index fund units (Phase 8). */
  funds: FundPosition[];
  /** Interest, fees and fines paid that belong to no position (margin and loan interest, fines): realised losses. */
  charges: number;
  call?: MarginCall;
}

/** How much history the books keep (Phase 11: a game can run for ever in a bounded amount of memory). */
export const KEEP = { orders: 2000, ledger: 20_000, closed: 5000 };

/**
 * Drops the oldest closed orders, ledger lines and closed positions beyond what the books keep. Open orders are never
 * dropped. It waits until a tenth more than the limit has built up, so the arrays are re-cut rarely. Returns whether it did.
 */
export function pruneBooks(account: Account): boolean {
  let pruned = false;
  const orders = account.orders;
  if (orders.length > KEEP.orders * 1.1) {
    let closed = 0;
    for (const o of orders) if (o.status !== 'open') closed++;
    let drop = closed - KEEP.orders;
    if (drop > 0) {
      account.orders = orders.filter((o) => o.status === 'open' || drop-- <= 0);
      pruned = true;
    }
  }
  if (account.ledger.length > KEEP.ledger * 1.1) {
    account.ledger = account.ledger.slice(-KEEP.ledger);
    pruned = true;
  }
  if (account.closed.length > KEEP.closed * 1.1) {
    account.closed = account.closed.slice(-KEEP.closed);
    pruned = true;
  }
  return pruned;
}

/** Adds a ledger line and moves the cash. */
export function book(account: Account, time: GameTime, kind: LedgerKind, amount: number, extra: Omit<LedgerEntry, 'time' | 'kind' | 'amount' | 'balance'> = {}): void {
  account.cash += amount;
  account.ledger.push({ time, kind, amount, balance: account.cash, ...extra });
}

/**
 * Cash paid for a position without an order: a dividend (kept, and counted in the position's realised P&L; a short pays
 * it), or the whole position leaving at `price` a share (a takeover's cash-out, or 0 for a bankruptcy).
 */
export function bookCash(account: Account, company: number, kind: 'dividend' | 'acquisition' | 'writeoff', amount: number, time: GameTime): void {
  const position = account.positions.find((p) => p.company === company);
  if (!position) return;
  const shares = position.shares;
  book(account, time, kind, amount, { company, shares, price: amount / shares });
  position.realized += kind === 'dividend' ? amount : amount - position.cost;
  if (kind === 'dividend') return;
  account.positions.splice(account.positions.indexOf(position), 1);
  account.closed.push({ company, opened: position.opened, closed: time, realized: position.realized });
}

/** Books a fill at `price` with `commission`: cash, ledger, cost basis and realised P&L, for any of the four sides. */
export function bookFill(account: Account, order: Order, shares: number, price: number, commission: number, time: GameTime): void {
  const value = shares * price;
  const sign = direction(order.side);
  const lines = { company: order.company, shares, price, order: order.id };
  book(account, time, order.side, -sign * value, lines);
  if (commission) book(account, time, 'commission', -commission, lines);

  let position = account.positions.find((p) => p.company === order.company);
  if (opens(order.side)) {
    if (!position) account.positions.push((position = { company: order.company, shares: 0, cost: 0, realized: 0, opened: time }));
    position.shares += sign * shares;
    position.cost += sign * value + commission;
  } else if (position) {
    const held = Math.abs(position.shares);
    const basis = shares === held ? position.cost : (position.cost * shares) / held;
    position.realized += -sign * value - commission - basis;
    position.cost -= basis;
    position.shares += sign * shares;
    if (!position.shares) {
      account.positions.splice(account.positions.indexOf(position), 1);
      account.closed.push({ company: position.company, opened: position.opened, closed: time, realized: position.realized });
    }
  }

  order.price = (order.price * order.filled + value) / (order.filled + shares);
  order.filled += shares;
  order.commission += commission;
  order.updated = time;
  if (order.filled === order.shares) order.status = 'filled';
}

/** Books a trade in fund units (positive to buy, negative to sell) at `price` a unit, with its commission. */
export function bookFund(account: Account, fund: number, units: number, price: number, commission: number, time: GameTime): void {
  const value = Math.abs(units) * price;
  const line = { fund, shares: Math.abs(units), price, note: units > 0 ? 'buy' : 'sell' };
  book(account, time, 'fund', units > 0 ? -value : value, line);
  if (commission) book(account, time, 'commission', -commission, line);
  let position = account.funds.find((p) => p.fund === fund);
  if (units > 0) {
    if (!position) account.funds.push((position = { fund, units: 0, cost: 0, realized: 0, opened: time }));
    position.units += units;
    position.cost += value + commission;
    return;
  }
  if (!position) return;
  const basis = -units === position.units ? position.cost : (position.cost * -units) / position.units;
  position.realized += value - commission - basis;
  position.cost -= basis;
  position.units += units;
  if (!position.units) {
    account.funds.splice(account.funds.indexOf(position), 1);
    account.closed.push({ company: -1, fund, opened: position.opened, closed: time, realized: position.realized });
  }
}
