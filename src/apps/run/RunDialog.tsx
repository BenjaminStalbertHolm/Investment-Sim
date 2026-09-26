import { useState } from 'react';
import { APPS, type AppId } from '../catalog';
import { Icon } from '../../art/icons';
import { useWindows } from '../../state/windows';
import type { AppProps } from '../types';

/** Resolve Run… input to an app: exact id, or a title prefix. URLs open the browser. */
export function resolveRunTarget(input: string): AppId | undefined {
  const q = input.trim().toLowerCase();
  if (!q) return undefined;
  if (/^https?:\/\/|^www\.|\.(com|net|org|gov)\b/.test(q)) return 'browser';
  const apps = Object.values(APPS).filter((a) => !a.dialog);
  return (apps.find((a) => a.id === q) ?? apps.find((a) => a.title.toLowerCase().startsWith(q)))?.id;
}

export default function RunDialog({ windowId }: AppProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const { open, close } = useWindows.getState();

  const run = () => {
    const target = resolveRunTarget(text);
    if (!target) {
      setError(`Cannot find '${text}'. Make sure you typed the name correctly, and then try again.`);
      return;
    }
    close(windowId);
    open(target);
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
        <p>Type the name of a program, and Doors will open it for you.</p>
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
