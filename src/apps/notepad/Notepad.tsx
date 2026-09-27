import { useRef, useState } from 'react';
import { formatClock } from '../../sim/calendar';
import { useGame } from '../../state/game';
import { usePrograms } from '../../state/programs';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import '../programs.css';

/** Notepad (spec §1): notes kept in the saved game. F5 stamps the game's date and time, as Notepad does. */
export default function Notepad({ windowId }: AppProps) {
  const text = usePrograms((s) => s.notepad);
  const [wrap, setWrap] = useState(true);
  const ref = useRef<HTMLTextAreaElement>(null);
  const stamp = () => {
    const el = ref.current;
    const time = useGame.getState().snapshot?.time;
    if (!el || time === undefined) return;
    const insert = formatClock(time);
    const next = el.value.slice(0, el.selectionStart) + insert + el.value.slice(el.selectionEnd);
    usePrograms.setState({ notepad: next });
  };
  return (
    <div className="app">
      <AppMenuBar
        windowId={windowId}
        menus={[
          { label: 'Edit', items: [{ label: 'Select All', onClick: () => ref.current?.select() }, { label: 'Time/Date', shortcut: 'F5', onClick: stamp }] },
          { label: 'Format', items: [{ label: 'Word Wrap', checked: wrap, onClick: () => setWrap(!wrap) }] },
        ]}
      />
      <textarea
        ref={ref}
        className="notepad-text"
        aria-label="Notes"
        spellCheck={false}
        wrap={wrap ? 'soft' : 'off'}
        value={text}
        onChange={(e) => usePrograms.setState({ notepad: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'F5') {
            e.preventDefault();
            stamp();
          }
        }}
      />
      <div className="status-bar">
        <p className="status-bar-field">Notes are kept in your saved game.</p>
        <p className="status-bar-field">{text.length.toLocaleString('en-US')} characters</p>
      </div>
    </div>
  );
}
