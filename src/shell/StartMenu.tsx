import { useEffect, useRef, type ReactNode } from 'react';
import { PROGRAMS, available, type AppId } from '../apps/catalog';
import { Icon, type IconName } from '../art/icons';
import { helpUrl } from '../sites/urls';
import { useGame } from '../state/game';
import { useShell } from '../state/shell';
import { usePrograms } from '../state/programs';
import { useTrade } from '../state/trade';
import { useWindows, type WindowParams } from '../state/windows';

// My Computer panels (§17), opened on the panel of the same name.
const SETTINGS = ['Display', 'Sounds', 'Game', 'Firm', 'Saves'];

export function StartMenu({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const installed = useShell((s) => s.installed);
  const modules = useGame((s) => s.settings?.modules);
  const stapley = usePrograms((s) => s.stapley.enabled);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest('.start-button')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const launch = (id: AppId, params?: WindowParams) => () => {
    onClose();
    useWindows.getState().open(id, params);
  };
  // Find: the Trade app's symbol lookup (the full screener comes later).
  const find = () => {
    useTrade.getState().setTab('quotes');
    launch('trade')();
  };

  return (
    <div className="start-menu window" ref={ref}>
      <div className="start-menu-banner">
        <b>Doors</b>98
      </div>
      <ul className="menu">
        <Item icon="programs" label="Programs">
          {PROGRAMS.filter((a) => available(a.id, installed, modules)).map((a) => (
            <Item key={a.id} icon={a.icon} label={a.title} small onClick={launch(a.id)} />
          ))}
        </Item>
        <Item icon="documents" label="Documents">
          <li className="menu-empty">(Empty)</li>
        </Item>
        <Item icon="settings" label="Settings">
          {SETTINGS.map((s) => (
            <Item key={s} icon="computer" label={s} small onClick={launch('mycomputer', { view: s.toLowerCase() })} />
          ))}
          <Item
            icon="help"
            label={stapley ? 'Hide Stapley' : 'Show Stapley'}
            small
            onClick={() => {
              onClose();
              usePrograms.setState({ stapley: { ...usePrograms.getState().stapley, enabled: !stapley } });
            }}
          />
        </Item>
        <Item icon="find" label="Find" onClick={find} />
        {/* Help: Ask Reeves answers questions until Phase 11's help file (spec §14.2: it doubles as the in-game help). */}
        <Item icon="help" label="Help" onClick={launch('browser', { url: helpUrl() })} />
        <Item icon="run" label="Run…" onClick={launch('run')} />
        <li className="menu-separator" />
        <Item icon="shutdown" label="Shut Down…" onClick={launch('shutdown')} />
      </ul>
    </div>
  );
}

function Item(props: { icon: IconName; label: string; small?: boolean; onClick?(): void; children?: ReactNode }) {
  const { icon, label, small, onClick, children } = props;
  return (
    <li className={`menu-item${children ? ' has-submenu' : ''}`} onClick={onClick}>
      <Icon name={icon} size={small ? 16 : 24} />
      <span>{label}</span>
      {children && <ul className="menu submenu window">{children}</ul>}
    </li>
  );
}
