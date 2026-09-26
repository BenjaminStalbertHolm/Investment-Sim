import { dayOf, formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { CalendarEntry } from '../../sim/types';
import { openQuote, useGame } from '../../state/game';
import { useTrade } from '../../state/trade';
import { useFetched } from '../../sites/hooks';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { money } from '../format';

const WHAT: Record<CalendarEntry['kind'], string> = {
  jobs: 'Jobs report', cpi: 'Consumer prices (CPI)', gdp: 'Gross domestic product', confidence: 'Consumer confidence',
  fed: 'Federal Reservoir rate decision', earnings: 'Earnings',
};
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Calendar (spec §12.8): the next six weeks' releases, Federal Reservoir meetings and your companies' earnings. */
export function Calendar() {
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : 0));
  const held = useGame((s) => s.snapshot?.positions.map((p) => p.company).join() ?? '');
  const watchlists = useTrade((s) => s.watchlists);
  const { tickers, names } = useGame.getState().directory;
  const companies = [...new Set([...(held ? held.split(',').map(Number) : []), ...watchlists.flatMap((w) => w.companies)])];
  const rows = useFetched(() => simulation().calendar(day, day + 42, companies), [day, held, companies.join()]) ?? [];
  const columns: Column<CalendarEntry & { key: number }>[] = [
    { header: 'Date', cell: (e) => formatDate(e.day) },
    { header: 'Time', cell: (e) => (e.kind === 'earnings' ? 'Before the bell' : clock(e.minute)) },
    { header: 'Event', cell: (e) => WHAT[e.kind] },
    { header: 'Company', cell: (e) => (e.company !== undefined ? `${tickers[e.company]} — ${names[e.company]}` : '') },
    { header: 'Dividend', align: 'right', cell: (e) => (e.dividend ? `${money(e.dividend)} a share` : '') },
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
      <p className="hint">Earnings are shown for your holdings and watchlists. Double-click a company to open its quote.</p>
    </div>
  );
}
