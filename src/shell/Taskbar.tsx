import { useState } from 'react';
import { APPS } from '../apps/catalog';
import { Icon } from '../art/icons';
import { useShell, type Speed } from '../state/shell';
import { activeWindowId, useWindows } from '../state/windows';
import { StartMenu } from './StartMenu';

export function Taskbar() {
  const [startOpen, setStartOpen] = useState(false);
  const windows = useWindows((s) => s.windows);
  const activeId = activeWindowId(windows);

  return (
    <div className="taskbar">
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <button className={`start-button${startOpen ? ' pressed' : ''}`} onClick={() => setStartOpen((o) => !o)}>
        <Icon name="doors" size={16} />
        <b>Start</b>
      </button>
      <div className="taskbar-divider" />
      <div className="taskbar-windows">
        {windows.map((w) => (
          <button
            key={w.id}
            className={`taskbar-window${w.id === activeId ? ' pressed' : ''}`}
            onClick={() => useWindows.getState().taskbarClick(w.id)}
            title={APPS[w.appId].title}
          >
            <Icon name={APPS[w.appId].icon} size={16} />
            <span>{APPS[w.appId].title}</span>
          </button>
        ))}
      </div>
      <Tray />
    </div>
  );
}

const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 0, label: '⏸' },
  { speed: 1, label: '1×' },
  { speed: 2, label: '2×' },
  { speed: 5, label: '5×' },
  { speed: 20, label: '20×' },
];

// Static for Phase 1: the game clock and market status go live with the engine in Phase 3.
function Tray() {
  const speed = useShell((s) => s.speed);
  return (
    <div className="tray status-bar-field">
      <button className="tray-icon" title="Outbox Express — no new mail" onClick={() => useWindows.getState().open('mail')}>
        <Icon name="mail" size={16} />
      </button>
      <div className="tray-speed" role="group" aria-label="Game speed">
        {SPEEDS.map((s) => (
          <button
            key={s.speed}
            className={speed === s.speed ? 'pressed' : ''}
            onClick={() => useShell.getState().setSpeed(s.speed)}
            title={s.speed === 0 ? 'Pause' : `${s.speed}× speed`}
          >
            {s.label}
          </button>
        ))}
        <button disabled title="Skip to next open">⏭</button>
      </div>
      <span className="market-light open" title="Market open" />
      <span className="tray-clock">Mon 05 Jan 1998 10:42</span>
    </div>
  );
}
