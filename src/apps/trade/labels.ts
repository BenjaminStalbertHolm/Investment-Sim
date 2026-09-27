import type { Order, OrderRequest, OrderType, Side } from '../../sim/account';
import { price } from '../format';

/** The order ticket's actions and order types (spec §12.2). */
export const SIDES: [Side, string][] = [['buy', 'Buy'], ['sell', 'Sell'], ['short', 'Sell Short'], ['cover', 'Buy to Cover']];
export const SIDE_LABEL = Object.fromEntries(SIDES) as Record<Side, string>;
/** What a side did, for fills: "bought", "sold short"… */
export const SIDE_DONE: Record<Side, string> = { buy: 'bought', sell: 'sold', short: 'sold short', cover: 'bought to cover' };

export const TYPES: [OrderType, string][] = [
  ['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop'], ['stopLimit', 'Stop-Limit'], ['trailingStop', 'Trailing Stop'],
];

/** An order's type and prices, as a list shows it: "Stop 12.50, limit 12.40", "Trailing 5% (stop 11.87)". */
export function describeType(o: OrderRequest & Partial<Pick<Order, 'triggered'>>): string {
  switch (o.type) {
    case 'market':
      return 'Market';
    case 'limit':
      return `Limit ${price(o.limit!)}`;
    case 'stop':
      return `Stop ${price(o.stop!)}${o.triggered ? ' (triggered)' : ''}`;
    case 'stopLimit':
      return `Stop ${price(o.stop!)}, limit ${price(o.limit!)}${o.triggered ? ' (triggered)' : ''}`;
    case 'trailingStop':
      return `Trailing ${Math.round(o.trail! * 1000) / 10}%${o.stop ? ` (stop ${price(o.stop)})` : ''}${o.triggered ? ' triggered' : ''}`;
  }
}

/** Who placed an order the broker placed itself. */
export const FORCED: Record<NonNullable<Order['forced']>, string> = {
  margin: 'Margin call liquidation',
  buyIn: 'Buy-in after a recall',
  loan: 'Sold for First Continental Bank',
};
