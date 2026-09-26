import { openQuote, useGame } from '../state/game';
import { useShell } from '../state/shell';
import { useTrade } from '../state/trade';
import { price, signedPct } from '../apps/format';

/** The scrolling ticker above the taskbar (spec §4): the MAJOR 500 and the active watchlist. */
export function TickerTape() {
  const on = useShell((s) => s.tickerTape);
  const list = useTrade((s) => s.watchlists.find((w) => w.id === s.active));
  const snapshot = useGame((s) => s.snapshot);
  const tickers = useGame((s) => s.directory.tickers);
  if (!on || !snapshot || !list) return null;

  const items = [
    { key: 'index', label: 'MAJOR 500', last: snapshot.index.last, pct: snapshot.index.pct },
    ...list.companies.flatMap((id) => {
      const q = snapshot.quotes[id];
      return q ? [{ key: String(id), label: tickers[id], last: q.last, pct: q.pct, id }] : [];
    }),
  ];
  // The run is drawn twice so the loop scrolls seamlessly.
  const run = (copy: number) =>
    items.map((item) => (
      <span
        key={`${copy}-${item.key}`}
        className={`ticker-item ${item.pct >= 0 ? 'up' : 'down'}`}
        onClick={() => 'id' in item && item.id !== undefined && openQuote(item.id)}
      >
        <b>{item.label}</b> {price(item.last)} {item.pct >= 0 ? '▲' : '▼'}
        {signedPct(item.pct)}
      </span>
    ));
  return (
    <div className="ticker-tape">
      <div className="ticker-tape-track" style={{ animationDuration: `${8 + items.length * 3}s` }}>
        {run(0)}
        {run(1)}
      </div>
    </div>
  );
}
