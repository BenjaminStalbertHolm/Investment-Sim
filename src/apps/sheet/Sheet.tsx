import { useMemo, useRef, useState } from 'react';
import { formatClock } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { FUNDS } from '../../sim/data/funds';
import { useGame } from '../../state/game';
import { deleteFile, saveFile, usePrograms } from '../../state/programs';
import { useTrade } from '../../state/trade';
import { useWindows } from '../../state/windows';
import { Prompt } from '../../ui98/Modal';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import { COLUMNS, ROWS, cellLabel, display, evaluate, fromRows, toCsv } from './formula';
import '../programs.css';

/** Opens a table (header row first) as a new sheet in Exceed: the exports of spec §4A. */
export function openSheet(name: string, rows: readonly (readonly (string | number)[])[]): void {
  const id = saveFile('sheets', { name, cells: fromRows(rows) });
  useWindows.getState().open('sheet', { view: String(id) });
}

/** The Portfolio, the ledger and the active watchlist, as tables for Exceed. */
async function exportOf(kind: 'portfolio' | 'ledger' | 'watchlist'): Promise<(string | number)[][]> {
  const { tickers, names } = useGame.getState().directory;
  if (kind === 'portfolio') {
    const positions = useGame.getState().snapshot?.positions ?? [];
    const funds = await simulation().funds();
    return [
      ['Symbol', 'Name', 'Shares', 'Last', 'Value', 'Cost', 'Unrealised'],
      ...positions.map((p) => [tickers[p.company], names[p.company], p.shares, p.last, p.value, p.cost, p.unrealized]),
      ...funds.positions.map((p) => [FUNDS[p.fund].ticker, FUNDS[p.fund].name, p.units, p.nav, p.value, p.cost, p.unrealized]),
    ];
  }
  if (kind === 'ledger') {
    const ledger = await simulation().ledger();
    return [['Date', 'Type', 'Symbol', 'Amount', 'Balance', 'Note'], ...ledger.map((l) => [formatClock(l.time), l.kind, l.company !== undefined ? tickers[l.company] : '', l.amount, l.balance, l.note ?? ''])];
  }
  const { watchlists, active } = useTrade.getState();
  const list = watchlists.find((w) => w.name === active) ?? watchlists[0];
  const quotes = useGame.getState().snapshot?.quotes ?? {};
  return [['Symbol', 'Name', 'Last', 'Change %'], ...(list?.companies ?? []).map((i) => [tickers[i], names[i], quotes[i]?.last ?? '', quotes[i] ? Number((quotes[i].pct * 100).toFixed(2)) : ''])];
}

/**
 * Exceed 98 (spec §4A): a grid that opens exports of the portfolio, ledger and screener results, with SUM, AVERAGE, MIN,
 * MAX, arithmetic and cell references, and exports CSV to the real computer. Sheets are kept in the saved game.
 */
export default function Sheet({ windowId }: AppProps) {
  const sheets = usePrograms((s) => s.sheets);
  const param = useWindows((s) => s.windows.find((w) => w.id === windowId)?.params?.view);
  const [chosen, setChosen] = useState<number>();
  const id = chosen ?? (param ? Number(param) : sheets[0]?.id);
  const sheet = sheets.find((s) => s.id === id);
  const [at, setAt] = useState('A1');
  const [draft, setDraft] = useState<string>();
  const [renaming, setRenaming] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const values = useMemo(() => evaluate(sheet?.cells ?? {}), [sheet]);
  const raw = sheet?.cells[at] ?? '';

  const create = (name = `Book${sheets.length + 1}`, cells: Record<string, string> = {}) => setChosen(saveFile('sheets', { name, cells }));
  const commit = (value: string) => {
    if (!sheet) return;
    const cells = { ...sheet.cells };
    if (value) cells[at] = value;
    else delete cells[at];
    saveFile('sheets', { ...sheet, cells });
    setDraft(undefined);
  };
  const move = (dc: number, dr: number) => {
    const c = Math.min(COLUMNS - 1, Math.max(0, at.charCodeAt(0) - 65 + dc));
    const r = Math.min(ROWS - 1, Math.max(0, Number(at.slice(1)) - 1 + dr));
    setAt(cellLabel(c, r));
  };
  const importTable = async (kind: 'portfolio' | 'ledger' | 'watchlist') => create(kind[0].toUpperCase() + kind.slice(1), fromRows(await exportOf(kind)));
  const exportCsv = () => {
    if (!sheet) return;
    const url = URL.createObjectURL(new Blob([toCsv(sheet.cells)], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sheet.name.replace(/[\\/:*?"<>|]/g, '_')}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="app sheet">
      <AppMenuBar
        windowId={windowId}
        menus={[
          { label: 'Sheet', items: [
            { label: 'New', onClick: () => create() },
            { label: 'Rename…', disabled: !sheet, onClick: () => setRenaming(true) },
            { label: 'Delete', disabled: !sheet, onClick: () => { if (sheet) deleteFile('sheets', sheet.id); setChosen(undefined); } },
            { label: 'Export CSV…', disabled: !sheet, onClick: exportCsv },
          ] },
          { label: 'Data', items: [
            { label: 'Import Portfolio', onClick: () => void importTable('portfolio') },
            { label: 'Import Ledger', onClick: () => void importTable('ledger') },
            { label: 'Import Watchlist', onClick: () => void importTable('watchlist') },
          ] },
        ]}
      />
      <div className="toolbar">
        <select aria-label="Sheet" value={id ?? ''} onChange={(e) => setChosen(Number(e.target.value) || undefined)}>
          <option value="">(no sheet open)</option>
          {sheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button onClick={() => create()}>New</button>
        <b className="sheet-at">{at}</b>
        <input
          className="sheet-formula"
          aria-label="Formula bar"
          disabled={!sheet}
          value={draft ?? raw}
          placeholder="=SUM(A1:A10)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit(draft ?? raw);
              move(0, 1);
              grid.current?.focus();
            }
            if (e.key === 'Escape') setDraft(undefined);
          }}
        />
      </div>
      {sheet ? (
        <div
          className="sheet-grid sunken-panel"
          tabIndex={0}
          ref={grid}
          onKeyDown={(e) => {
            const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], Tab: [1, 0], Enter: [0, 1] };
            if (arrows[e.key]) {
              e.preventDefault();
              move(...arrows[e.key]);
            } else if (e.key === 'Delete' || e.key === 'Backspace') commit('');
            else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              setDraft(e.key);
              (e.currentTarget.parentElement?.querySelector('.sheet-formula') as HTMLInputElement | null)?.focus();
            }
          }}
        >
          <table>
            <thead>
              <tr>
                <th />
                {Array.from({ length: COLUMNS }, (_, c) => (
                  <th key={c}>{String.fromCharCode(65 + c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, r) => (
                <tr key={r}>
                  <th>{r + 1}</th>
                  {Array.from({ length: COLUMNS }, (_, c) => {
                    const key = cellLabel(c, r);
                    const v = values[key] ?? null;
                    return (
                      <td key={key} className={`${key === at ? 'selected' : ''}${typeof v === 'number' ? ' num' : ''}${typeof v === 'string' && v.startsWith('#') ? ' err' : ''}`} onClick={() => setAt(key)}>
                        {display(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">Sheets are kept in your saved game. Sheet → New, or Data → Import Portfolio.</p>
      )}
      {renaming && sheet && (
        <Prompt title="Rename" label="Sheet name:" initial={sheet.name} onOk={(name) => (saveFile('sheets', { ...sheet, name }), setRenaming(false))} onCancel={() => setRenaming(false)} />
      )}
    </div>
  );
}
