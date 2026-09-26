import { useMemo, useState } from 'react';
import type { Directory } from '../../sim/types';
import { useGame } from '../../state/game';

/** Companies matching a query: the exact ticker first, then tickers starting with it, then names containing it. */
export function searchCompanies(directory: Directory, query: string, limit = 12): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: number[] = [];
  const prefix: number[] = [];
  const named: number[] = [];
  directory.tickers.forEach((ticker, i) => {
    const t = ticker.toLowerCase();
    if (t === q) exact.push(i);
    else if (t.startsWith(q)) prefix.push(i);
    else if (directory.names[i].toLowerCase().includes(q)) named.push(i);
  });
  return [...exact, ...prefix, ...named].slice(0, limit);
}

/** Symbol lookup: type a ticker or part of a name, pick from the list (arrow keys and Enter work). */
export function SymbolSearch({ onPick, placeholder = 'Symbol or name' }: { onPick(company: number): void; placeholder?: string }) {
  const directory = useGame((s) => s.directory);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const matches = useMemo(() => searchCompanies(directory, text), [directory, text]);
  const pick = (id: number) => {
    onPick(id);
    setText('');
    setOpen(false);
  };

  return (
    <div className="symbol-search">
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, matches.length - 1));
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
          else if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'Enter' && matches.length) {
            e.preventDefault();
            pick(matches[cursor]);
          }
        }}
        onBlur={() => setOpen(false)}
      />
      {open && matches.length > 0 && (
        <ul className="symbol-matches window">
          {matches.map((id, k) => (
            <li key={id} className={k === cursor ? 'active' : undefined} onMouseDown={() => pick(id)}>
              <b>{directory.tickers[id]}</b>
              <span>{directory.names[id]}</span>
              <small>{directory.industries[id]}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
