import type { GameTime } from './calendar';

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type TimeInForce = 'day' | 'gtc';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'expired' | 'rejected';

/** What the order ticket sends (spec §12.2; stop orders and shorting arrive in Phase 7). */
export interface OrderRequest {
  company: number;
  side: Side;
  type: OrderType;
  shares: number;
  /** Limit price, for limit orders. */
  limit?: number;
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
}

/** A holding. `cost` is its remaining cost basis, commissions included; `realized` the P&L of shares already sold. */
export interface Position {
  company: number;
  shares: number;
  cost: number;
  realized: number;
  opened: GameTime;
}

/** A position sold down to nothing. The losers are what the Recycle Bin shows. */
export interface ClosedPosition {
  company: number;
  opened: GameTime;
  closed: GameTime;
  realized: number;
}

/**
 * Deposits and withdrawals are clients' money in and out (spec §15.1); an acquisition pays out shares at the offer
 * price and a write-off removes a bankrupt company's shares (spec §11.6).
 */
export type LedgerKind = 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'commission' | 'dividend' | 'acquisition' | 'writeoff';

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
  /** Whose money: the client of a deposit or withdrawal. */
  note?: string;
}

/** The firm's brokerage account: a cash account until margin arrives (Phase 7). */
export interface Account {
  cash: number;
  deposits: number;
  positions: Position[];
  closed: ClosedPosition[];
  ledger: LedgerEntry[];
  /** Every order ever placed, oldest first. */
  orders: Order[];
  nextOrder: number;
}

/**
 * Cash paid for a position without an order: a dividend (kept, and counted in the position's realised P&L), or the
 * whole position leaving at `price` a share (a takeover's cash-out, or 0 for a bankruptcy).
 */
export function bookCash(account: Account, company: number, kind: 'dividend' | 'acquisition' | 'writeoff', amount: number, time: GameTime): void {
  const position = account.positions.find((p) => p.company === company);
  if (!position) return;
  const shares = position.shares;
  account.cash += amount;
  account.ledger.push({ time, kind, amount, balance: account.cash, company, shares, price: amount / shares });
  position.realized += kind === 'dividend' ? amount : amount - position.cost;
  if (kind === 'dividend') return;
  account.positions.splice(account.positions.indexOf(position), 1);
  account.closed.push({ company, opened: position.opened, closed: time, realized: position.realized });
}

/** Books a fill at `price` with `commission`: cash, ledger, cost basis and realized P&L. */
export function bookFill(account: Account, order: Order, shares: number, price: number, commission: number, time: GameTime): void {
  const value = shares * price;
  const buy = order.side === 'buy';
  const entry = (kind: LedgerKind, amount: number) => {
    account.cash += amount;
    account.ledger.push({ time, kind, amount, balance: account.cash, company: order.company, shares, price, order: order.id });
  };
  entry(order.side, buy ? -value : value);
  if (commission) entry('commission', -commission);

  let position = account.positions.find((p) => p.company === order.company);
  if (buy) {
    if (!position) account.positions.push((position = { company: order.company, shares: 0, cost: 0, realized: 0, opened: time }));
    position.shares += shares;
    position.cost += value + commission;
  } else if (position) {
    const basis = shares === position.shares ? position.cost : (position.cost * shares) / position.shares;
    position.realized += value - commission - basis;
    position.cost -= basis;
    position.shares -= shares;
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
