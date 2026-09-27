import { dayOf, formatDate } from '../../sim/calendar';
import { contractLabel } from '../../sim/commodities';
import { simulation } from '../../sim/client';
import type { CalendarEntry } from '../../sim/types';
import { openQuote, useGame } from '../../state/game';
import { useTrade } from '../../state/trade';
import { useFetched } from '../../sites/hooks';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { money } from '../format';

const WHAT: Record<CalendarEntry['kind'], string> = {
  jobs: 'Jobs report', cpi: 'Consumer prices (CPI)', gdp: 'Gross domestic product', confidence: 'Consumer confidence',
  fed: 'Federal Reservoir rate decision', earnings: 'Earnings', opek: 'OPEK meeting', expiry: 'Futures expiry', loan: 'Loan payment',
};
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Calendar (spec §12.8): the next six weeks' releases, Federal Reservoir and OPEK meetings, your companies' earnings, the
 * last trading days of your futures and your loan payments.
 */
export function Calendar() {
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : 0));
  const held = useGame((s) => s.snapshot?.positions.map((p) => p.company).join() ?? '');
  const revision = useGame((s) => s.snapshot?.revision);
  const watchlists = useTrade((s) => s.watchlists);
  const { tickers, names } = useGame.getState().directory;
  const companies = [...new Set([...(held ? held.split(',').map(Number) : []), ...watchlists.flatMap((w) => w.companies)])];
  const rows = useFetched(() => simulation().calendar(day, day + 42, companies), [day, held, companies.join(), revision]) ?? [];
  const columns: Column<CalendarEntry & { key: number }>[] = [
    { header: 'Date', cell: (e) => formatDate(e.day) },
    { header: 'Time', cell: (e) => (e.kind === 'earnings' ? 'Before the bell' : e.kind === 'expiry' ? 'At the close' : clock(e.minute)) },
    { header: 'Event', cell: (e) => WHAT[e.kind] },
    {
      header: 'Company',
      cell: (e) =>
        e.company !== undefined ? `${tickers[e.company]} — ${names[e.company]}` : e.contract ? contractLabel(e.contract) : e.loan ? `Loan ${e.loan}` : '',
    },
    { header: 'Amount', align: 'right', cell: (e) => (e.dividend ? `${money(e.dividend)} a share` : e.amount ? money(e.amount) : '') },
  ];
  return (
    <div className="tab-page">
      <VirtualTable
        rows={rows.map((r, key) => ({ ...r, key }))}
        columns={columns}
        rowKey={(r) => r.key}
        onOpen={(r) => r.company !== undefined && openQuote(r.company)}
        empty="Nothing scheduled."
      />
      <p className="hint">
        Earnings are shown for your holdings and watchlists, expiries for the futures you hold. Double-click a company to open its quote.
      </p>
    </div>
  );
}
