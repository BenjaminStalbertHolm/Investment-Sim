import { dayOf, formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { contractLabel } from '../../sim/commodities';
import { FUNDS } from '../../sim/data/funds';
import type { ClosedPosition } from '../../sim/types';
import { useAccountData, useGame } from '../../state/game';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count } from '../format';
import type { AppProps } from '../types';

/** The Recycle Bin (spec §4): your closed losing positions as files, the loss as the file size. */
export default function RecycleBin(_: AppProps) {
  const tickers = useGame((s) => s.directory.tickers);
  const closed = useAccountData(() => simulation().closedPositions());
  const losers = (closed ?? []).map((c, id) => ({ ...c, id })).filter((c) => c.realized < 0).reverse();
  const total = losers.reduce((a, c) => a - c.realized, 0);

  const columns: Column<ClosedPosition & { id: number }>[] = [
    // Futures are FUT files in C:\Futures, goods sold at a loss LOT files in the lobby, index funds FND files in C:\Funds.
    {
      header: 'Name',
      cell: (c) =>
        c.contract ? `${contractLabel(c.contract).replace(/ /g, '_')}.FUT` : c.goods ? `${c.goods}_GOODS.LOT` : c.fund !== undefined ? `${FUNDS[c.fund].ticker}.FND` : `${tickers[c.company]}.POS`,
    },
    { header: 'Original Location', cell: (c) => (c.contract ? 'C:\\Futures' : c.goods ? 'C:\\Lobby' : c.fund !== undefined ? 'C:\\Funds' : 'C:\\Portfolio') },
    { header: 'Date Deleted', cell: (c) => formatDate(dayOf(c.closed)) },
    { header: 'Size', align: 'right', cell: (c) => `${count(-c.realized)} KB` },
  ];

  return (
    <div className="app">
      <VirtualTable rows={losers} columns={columns} rowKey={(c) => c.id} empty="The Recycle Bin is empty. No losses. Yet." />
      <div className="status-bar">
        <p className="status-bar-field">{losers.length} object(s)</p>
        <p className="status-bar-field">{count(total)} KB</p>
      </div>
    </div>
  );
}
