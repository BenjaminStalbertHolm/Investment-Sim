import { useState } from 'react';
import type { Order } from '../../sim/account';
import { formatClock } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { useAccountData, useGame } from '../../state/game';
import { useTrade } from '../../state/trade';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count, money, price } from '../format';
import { FORCED, SIDE_LABEL, describeType } from './labels';

const STATUS: Record<Order['status'], string> = {
  open: 'Working',
  filled: 'Filled',
  cancelled: 'Cancelled',
  expired: 'Expired',
  rejected: 'Rejected',
};

/** Orders & History (spec §12.7): open orders to cancel or modify, and every order placed. */
export function Orders() {
  const open = useGame((s) => s.snapshot?.openOrders) ?? [];
  const tickers = useGame((s) => s.directory.tickers);
  const history = useAccountData(() => simulation().orders());
  const [selected, setSelected] = useState<number>();
  const order = open.find((o) => o.id === selected);

  const columns: Column<Order>[] = [
    { header: '#', align: 'right', cell: (o) => o.id },
    { header: 'Placed', cell: (o) => formatClock(o.placed) },
    { header: 'Symbol', cell: (o) => <b>{tickers[o.company]}</b> },
    { header: 'Action', cell: (o) => SIDE_LABEL[o.side] },
    { header: 'Type', cell: (o) => describeType(o) },
    { header: 'Quantity', align: 'right', cell: (o) => count(o.shares) },
    { header: 'Filled', align: 'right', cell: (o) => count(o.filled) },
    { header: 'Avg price', align: 'right', cell: (o) => (o.filled ? price(o.price) : '') },
    { header: 'TIF', cell: (o) => o.tif.toUpperCase() },
    { header: 'Status', cell: (o) => STATUS[o.status] },
  ];
  const done = (history ?? []).filter((o) => o.status !== 'open').reverse();

  return (
    <div className="tab-page">
      <div className="section-title">Open orders</div>
      <VirtualTable
        className="open-orders"
        rows={open}
        columns={columns}
        rowKey={(o) => o.id}
        selected={selected}
        onSelect={(o) => setSelected(o.id)}
        empty="No open orders."
      />
      <div className="button-row">
        <button disabled={!order} onClick={() => void simulation().cancelOrder(order!.id)}>
          Cancel Order
        </button>
        <button
          disabled={!order}
          onClick={() =>
            useTrade.getState().trade(order!.company, order!.side, {
              type: order!.type,
              shares: String(order!.shares - order!.filled),
              limit: order!.limit ? String(order!.limit) : '',
              stop: order!.stop && order!.type !== 'trailingStop' ? String(order!.stop) : '',
              trail: order!.trail ? String(Math.round(order!.trail * 1000) / 10) : '5',
              tif: order!.tif,
              replaces: order!.id,
            })
          }
        >
          Modify…
        </button>
      </div>
      <div className="section-title">History</div>
      <VirtualTable
        rows={done}
        columns={[
          ...columns,
          { header: 'Commission', align: 'right', cell: (o) => (o.commission ? money(o.commission) : '') },
          { header: 'Note', cell: (o) => [o.forced && FORCED[o.forced], o.note].filter(Boolean).join('. ') },
        ]}
        rowKey={(o) => o.id}
        empty="No orders yet."
      />
    </div>
  );
}
