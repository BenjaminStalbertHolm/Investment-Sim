import { Suspense } from 'react';
import { Rnd } from 'react-rnd';
import { APPS } from '../apps/catalog';
import { appComponent } from '../apps/registry';
import { Icon } from '../art/icons';
import { useWindows, type WindowState } from '../state/windows';

const MAXIMIZED = { position: { x: 0, y: 0 }, size: { width: '100%', height: '100%' } };

export function Window({ win, active }: { win: WindowState; active: boolean }) {
  const { focus, close, minimize, toggleMaximize, setBounds } = useWindows.getState();
  const app = APPS[win.appId];
  const App = appComponent(win.appId);
  const { x, y, width, height } = win.bounds;
  const canMaximize = !app.dialog;

  return (
    <Rnd
      className="window app-window"
      style={{ zIndex: win.z, display: win.minimized ? 'none' : 'flex' }}
      bounds="parent"
      dragHandleClassName="title-bar"
      cancel=".title-bar-controls"
      minWidth={200}
      minHeight={120}
      {...(win.maximized ? MAXIMIZED : { position: { x, y }, size: { width, height } })}
      disableDragging={win.maximized}
      enableResizing={!win.maximized && !app.dialog}
      onMouseDown={() => focus(win.id)}
      onDragStop={(_e, d) => setBounds(win.id, { ...win.bounds, x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, el, _delta, pos) =>
        setBounds(win.id, { x: pos.x, y: pos.y, width: el.offsetWidth, height: el.offsetHeight })
      }
    >
      <div className={`title-bar${active ? '' : ' inactive'}`} onDoubleClick={() => canMaximize && toggleMaximize(win.id)}>
        <div className="title-bar-text">
          <Icon name={app.icon} size={16} />
          {win.title ?? app.title}
        </div>
        <div className="title-bar-controls">
          {!app.dialog && <button aria-label="Minimize" onClick={() => minimize(win.id)} />}
          {canMaximize && (
            <button aria-label={win.maximized ? 'Restore' : 'Maximize'} onClick={() => toggleMaximize(win.id)} />
          )}
          <button aria-label="Close" onClick={() => close(win.id)} />
        </div>
      </div>
      <div className="window-body">
        <Suspense fallback={<p className="loading">Please wait…</p>}>
          <App windowId={win.id} appId={win.appId} />
        </Suspense>
      </div>
    </Rnd>
  );
}
