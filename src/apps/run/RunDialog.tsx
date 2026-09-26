import { useState } from 'react';
import { APPS, type AppId } from '../catalog';
import { Icon } from '../../art/icons';
import { normalizeUrl } from '../../sites/urls';
import { openQuote, openUrl, useGame } from '../../state/game';
import { useWindows } from '../../state/windows';
import type { AppProps } from '../types';

/** Resolve Run… input to an app: exact id, or a title prefix. URLs open the browser. */
export function resolveRunTarget(input: string): AppId | undefined {
  const q = input.trim().toLowerCase();
  if (!q) return undefined;
  if (isAddress(q)) return 'browser';
  // Quote windows need a company: they open from a ticker instead.
  const apps = Object.values(APPS).filter((a) => !a.dialog && a.id !== 'quote');
  return (apps.find((a) => a.id === q) ?? apps.find((a) => a.title.toLowerCase().startsWith(q)))?.id;
}

/** Whether Run… input is an Internet address. */
export const isAddress = (input: string) => /^https?:\/\/|^www\.|\.(com|net|org|gov|co\.uk)\b/i.test(input.trim());

/** The company whose ticker was typed, if any. */
export function findTicker(tickers: readonly string[], input: string): number | undefined {
  const i = tickers.indexOf(input.trim().toUpperCase());
  return i < 0 ? undefined : i;
}

export default function RunDialog({ windowId }: AppProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const { open, close } = useWindows.getState();

  const run = () => {
    const company = findTicker(useGame.getState().directory.tickers, text);
    const target = company === undefined ? resolveRunTarget(text) : undefined;
    if (company === undefined && !target) {
      setError(`Cannot find '${text}'. Make sure you typed the name correctly, and then try again.`);
      return;
    }
    close(windowId);
    if (company !== undefined) openQuote(company);
    else if (isAddress(text)) openUrl(normalizeUrl(text));
    else open(target!);
  };

  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <div className="dialog-row">
        <Icon name="run" />
        <p>Type the name of a program, a ticker symbol or an Internet address, and Doors will open it for you.</p>
      </div>
      <div className="field-row">
        <label htmlFor={`${windowId}-open`}>Open:</label>
        <input id={`${windowId}-open`} autoFocus value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <div className="dialog-buttons">
        <button type="submit" className="default">OK</button>
        <button type="button" onClick={() => close(windowId)}>Cancel</button>
      </div>
    </form>
  );
}
