import { useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { DESKTOP_ICONS, type DesktopIconDef } from '../apps/catalog';
import { Icon } from '../art/icons';
import { useShell } from '../state/shell';
import { activeWindowId, useWindows } from '../state/windows';
import { Window } from './Window';

const CELL = 76;

export function Desktop() {
  const ref = useRef<HTMLDivElement>(null);
  const windows = useWindows((s) => s.windows);
  const area = useWindows((s) => s.area);
  const [selected, setSelected] = useState<string>();
  const activeId = activeWindowId(windows);

  useEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(() => useWindows.getState().setArea(el.clientWidth, el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const perColumn = Math.max(1, Math.floor(area.height / CELL));

  return (
    <div className="desktop" ref={ref} onMouseDown={(e) => e.target === e.currentTarget && setSelected(undefined)}>
      {DESKTOP_ICONS.map((icon, i) => (
        <DesktopIcon
          key={icon.id}
          icon={icon}
          fallback={{ x: 4 + Math.floor(i / perColumn) * CELL, y: 4 + (i % perColumn) * CELL }}
          selected={selected === icon.id}
          onSelect={() => setSelected(icon.id)}
        />
      ))}
      {windows.map((w) => (
        <Window key={w.id} win={w} active={w.id === activeId} />
      ))}
    </div>
  );
}

function DesktopIcon(props: {
  icon: DesktopIconDef;
  fallback: { x: number; y: number };
  selected: boolean;
  onSelect(): void;
}) {
  const { icon, selected, onSelect } = props;
  const position = useShell((s) => s.iconPositions[icon.id]) ?? props.fallback;
  const open = () => useWindows.getState().open(icon.opens);

  return (
    <Rnd
      className={`desktop-icon${selected ? ' selected' : ''}`}
      size={{ width: CELL - 4, height: CELL - 4 }}
      position={position}
      enableResizing={false}
      bounds="parent"
      onMouseDown={onSelect}
      onDragStop={(_e, d) => {
        if (d.x !== position.x || d.y !== position.y) useShell.getState().moveIcon(icon.id, d.x, d.y);
      }}
    >
      <div
        className="desktop-icon-inner"
        tabIndex={0}
        onDoubleClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
      >
        <Icon name={icon.icon} shortcut={icon.shortcut} />
        <span className="desktop-icon-label">{icon.label}</span>
      </div>
    </Rnd>
  );
}
