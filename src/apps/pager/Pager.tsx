import { useState } from 'react';
import { formatClock } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { Page } from '../../sim/desk';
import type { Directory } from '../../sim/types';
import { showError, useGame } from '../../state/game';
import { useWindows } from '../../state/windows';
import { useDesk } from '../../sites/hooks';
import { AppMenuBar } from '../AppMenuBar';
import { price } from '../format';
import type { AppProps } from '../types';
import '../programs.css';

/** A page's numeric code, as the pager's little screen shows it: the code, then the page number. */
export const pageCode = (p: Page) => `${p.code}-${String(p.id % 10_000).padStart(4, '0')}`;

/** What a code means (spec §4A: numeric-code pages with a text expansion). */
export function pageText(p: Page, directory: Directory): string {
  switch (p.code) {
    case '911':
      return 'MARGIN CALL. Your broker needs money. See Outbox Express.';
    case '411':
      return `${directory.tickers[p.company!]} ${p.above ? 'UP TO' : 'DOWN TO'} $${price(p.level!)}. Your price alert.`;
    case '7337':
      return `STOP-LOSS HIT: ${directory.tickers[p.company!]} sold by your Trader.`;
    case '0800':
      return 'URGENT MAIL. Check Outbox Express.';
  }
}

/** The Pager (spec §4A): price alerts, margin calls and urgent mail, as numeric pages. */
export default function Pager({ windowId }: AppProps) {
  const desk = useDesk();
  const { directory } = useGame.getState();
  const [ticker, setTicker] = useState('');
  const [level, setLevel] = useState('');
  const pages = [...(desk?.pages ?? [])].reverse();
  const add = () => {
    const company = directory.tickers.indexOf(ticker.trim().toUpperCase());
    if (company < 0) return showError('Unknown symbol.');
    void simulation()
      .deskAction({ do: 'addAlert', company, level: Number(level) })
      .then((e) => (e ? showError(e) : (setTicker(''), setLevel(''))));
  };
  return (
    <div className="app pager">
      <AppMenuBar windowId={windowId} />
      <div className="pager-screen" aria-live="polite">
        {pages[0] ? (
          <>
            <b>{pageCode(pages[0])}</b>
            <br />
            {pageText(pages[0], directory)}
          </>
        ) : (
          'NO PAGES'
        )}
      </div>
      <ul className="pager-list sunken-panel">
        {pages.map((p) => (
          <li key={p.id} onClick={() => p.mail !== undefined && useWindows.getState().open('mail')}>
            <b>{pageCode(p)}</b> <span className="hint">{formatClock(p.time)}</span>
            <br />
            {pageText(p, directory)}
          </li>
        ))}
      </ul>
      <fieldset>
        <legend>Price alerts</legend>
        <div className="field-row">
          <input aria-label="Symbol" size={6} placeholder="Symbol" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          <label htmlFor={`${windowId}-level`}>at $</label>
          <input id={`${windowId}-level`} size={7} value={level} onChange={(e) => setLevel(e.target.value)} />
          <button onClick={add}>Add</button>
        </div>
        <ul className="pager-alerts">
          {(desk?.alerts ?? []).map((a) => (
            <li key={a.id}>
              {directory.tickers[a.company]} {a.above ? '≥' : '≤'} ${price(a.level)}{' '}
              <button onClick={() => void simulation().deskAction({ do: 'removeAlert', id: a.id })}>Remove</button>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
