import { useEffect, useState } from 'react';
import { APPS } from '../apps/catalog';
import { Icon } from '../art/icons';
import { formatClock } from '../sim/calendar';
import { SOB } from '../sites/urls';
import { openUrl, setSpeed, skipToNextOpen, useGame } from '../state/game';
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
            title={w.title ?? APPS[w.appId].title}
          >
            <Icon name={APPS[w.appId].icon} size={16} />
            <span>{w.title ?? APPS[w.appId].title}</span>
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

/** Game clock, market status light, speed controls and ticker toggle (spec §4). */
function Tray() {
  const speed = useShell((s) => s.speed);
  const tickerTape = useShell((s) => s.tickerTape);
  const snapshot = useGame((s) => s.snapshot);
  const busy = useGame((s) => s.busy);
  const bankrupt = useGame((s) => !!s.bankrupt);
  const unread = snapshot?.mail.unread ?? 0;
  const phase = snapshot?.halted ? 'halted' : snapshot?.phase;
  const light = phase === 'open' ? 'open' : phase === 'pre' ? 'pre' : 'closed';
  const status =
    phase === 'halted'
      ? 'Trading halted until tomorrow'
      : phase === 'open'
        ? 'Market open'
        : phase === 'pre'
          ? 'Pre-market: orders wait for the open'
          : `Market closed${snapshot?.holiday ? ` for ${snapshot.holiday}` : ''}`;

  return (
    <div className="tray status-bar-field">
      {busy ? <span className="tray-busy">{busy}</span> : <Notice />}
      {bankrupt && (
        <button className="tray-bankrupt" title="The firm is bankrupt: its final report" onClick={() => useGame.setState({ bust: 'report' })}>
          BANKRUPT
        </button>
      )}
      {snapshot && snapshot.sob.peak > 0 && (
        <button
          className="tray-icon tray-heat"
          title={`Heat ${Math.round(snapshot.sob.heat)}/100: the Securities Oversight Bureau’s interest in your firm${snapshot.sob.suspended ? '. Trading suspended.' : ''}`}
          onClick={() => openUrl(`http://${SOB}/investigations`)}
        >
          <span className="heat-tube">
            <span className={`heat-level${snapshot.sob.suspended ? ' suspended' : ''}`} style={{ height: `${Math.max(4, snapshot.sob.heat)}%` }} />
          </span>
          <span className="heat-bulb" />
        </button>
      )}
      <PagerTray />
      <button
        className={`tray-icon${tickerTape ? ' pressed' : ''}`}
        title="Ticker tape"
        onClick={() => useShell.getState().toggleTickerTape()}
      >
        <Icon name="trade" size={16} />
      </button>
      <button
        className="tray-icon"
        title={`Outbox Express — ${unread ? `${unread} unread message${unread > 1 ? 's' : ''}` : 'no new mail'}`}
        onClick={() => useWindows.getState().open('mail')}
      >
        <Icon name="mail" size={16} />
        {unread > 0 && <span className="tray-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <div className="tray-speed" role="group" aria-label="Game speed">
        {SPEEDS.map((s) => (
          <button
            key={s.speed}
            className={speed === s.speed ? 'pressed' : ''}
            disabled={bankrupt}
            onClick={() => setSpeed(s.speed)}
            title={s.speed === 0 ? 'Pause' : `${s.speed}× speed`}
          >
            {s.label}
          </button>
        ))}
        <button disabled={!snapshot || !!busy || bankrupt} onClick={skipToNextOpen} title="Skip to next open">
          ⏭
        </button>
      </div>
      <span className={`market-light ${light}`} title={status} />
      <span className="tray-clock" title={status}>
        {snapshot ? formatClock(snapshot.time) : 'Starting…'}
      </span>
    </div>
  );
}

/** The pager on the belt (spec §4A): the newest page's code, blinking until the pager is opened. */
function PagerTray() {
  const latest = useGame((s) => s.snapshot?.desk.page);
  const [seen, setSeen] = useState<number>();
  // Pages from before this session (a loaded game's) count as read.
  useEffect(() => {
    if (seen === undefined && latest !== undefined) setSeen(latest);
  }, [seen, latest]);
  const fresh = seen !== undefined && latest !== undefined && latest > seen;
  return (
    <button
      className={`tray-icon tray-pager${fresh ? ' fresh' : ''}`}
      title={fresh ? 'New page' : 'Pager'}
      onClick={() => {
        setSeen(latest);
        useWindows.getState().open('pager');
      }}
    >
      <Icon name="pager" size={16} />
      {fresh && <span className="tray-badge">{latest! - seen! > 9 ? '9+' : latest! - seen!}</span>}
    </button>
  );
}

/** The latest fill or save message, for a few seconds. */
function Notice() {
  const notice = useGame((s) => s.notice);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  return visible && notice ? <span className="tray-notice">{notice.text}</span> : null;
}
