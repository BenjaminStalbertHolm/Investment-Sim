import { useState } from 'react';
import { Sparkline } from '../../charts/Sparkline';
import { openQuote, useGame } from '../../state/game';
import { useTrade } from '../../state/trade';
import { Confirm, Prompt } from '../../ui98/Modal';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count, price, signed, signedPct, tone } from '../format';
import { SymbolSearch } from './SymbolSearch';

/** Quotes & Watchlists (spec §12.1). */
export function Quotes() {
  const watchlists = useTrade((s) => s.watchlists);
  const active = useTrade((s) => s.active);
  const quotes = useGame((s) => s.snapshot?.quotes);
  const { tickers, names } = useGame((s) => s.directory);
  const [selected, setSelected] = useState<number>();
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete'>();
  const trade = useTrade.getState();
  const list = watchlists.find((w) => w.id === active) ?? watchlists[0];

  const q = (id: number) => quotes?.[id];
  const columns: Column<number>[] = [
    { header: 'Symbol', cell: (id) => <b>{tickers[id]}</b> },
    { header: 'Name', cell: (id) => names[id] },
    { header: 'Last', align: 'right', cell: (id) => (q(id) ? price(q(id)!.last) : '…') },
    { header: 'Change', align: 'right', cell: (id) => (q(id) ? signed(q(id)!.change, q(id)!.last) : ''), tone: (id) => tone(q(id)?.change ?? 0) },
    { header: '% Chg', align: 'right', cell: (id) => (q(id) ? signedPct(q(id)!.pct) : ''), tone: (id) => tone(q(id)?.change ?? 0) },
    { header: 'Volume', align: 'right', cell: (id) => (q(id) ? count(q(id)!.volume) : '') },
    { header: 'Trend (1 month)', cell: (id) => <Sparkline values={q(id)?.spark ?? []} /> },
  ];

  return (
    <div className="tab-page">
      <div className="toolbar">
        <label htmlFor="watchlist">Watchlist:</label>
        <select id="watchlist" value={list.id} onChange={(e) => trade.setActive(e.target.value)}>
          {watchlists.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button onClick={() => setDialog('new')}>New…</button>
        <button onClick={() => setDialog('rename')}>Rename…</button>
        <button onClick={() => setDialog('delete')} disabled={watchlists.length < 2}>
          Delete
        </button>
        <span className="toolbar-gap" />
        <label>Add:</label>
        <SymbolSearch onPick={(id) => trade.watch(id)} />
      </div>
      <VirtualTable
        rows={list.companies}
        columns={columns}
        rowKey={(id) => id}
        selected={selected}
        onSelect={(id) => setSelected(id)}
        onOpen={openQuote}
        empty="This watchlist is empty. Type a symbol or name in Add to watch a company."
      />
      <div className="button-row">
        <button disabled={selected === undefined} onClick={() => openQuote(selected!)}>
          Quote…
        </button>
        <button disabled={selected === undefined} onClick={() => trade.trade(selected!, 'buy')}>
          Buy…
        </button>
        <button disabled={selected === undefined} onClick={() => trade.trade(selected!, 'sell')}>
          Sell…
        </button>
        <button
          disabled={selected === undefined}
          onClick={() => {
            trade.unwatch(selected!);
            setSelected(undefined);
          }}
        >
          Remove
        </button>
      </div>
      {(dialog === 'new' || dialog === 'rename') && (
        <Prompt
          title={dialog === 'new' ? 'New Watchlist' : 'Rename Watchlist'}
          label="Watchlist name:"
          initial={dialog === 'rename' ? list.name : `Watchlist ${watchlists.length + 1}`}
          onOk={(name) => {
            if (dialog === 'new') trade.addWatchlist(name);
            else trade.renameWatchlist(list.id, name);
            setDialog(undefined);
          }}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'delete' && (
        <Confirm
          title="Delete Watchlist"
          onOk={() => {
            trade.deleteWatchlist(list.id);
            setDialog(undefined);
          }}
          onCancel={() => setDialog(undefined)}
        >
          Are you sure you want to delete '{list.name}'?
        </Confirm>
      )}
    </div>
  );
}
