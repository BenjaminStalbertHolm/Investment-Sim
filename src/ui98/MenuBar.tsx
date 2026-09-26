import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick(): void;
}

/** A window's menu bar (File, View, Help…): click a title to open it, then hover across to the others. */
export function MenuBar({ menus }: { menus: { label: string; items: MenuItem[] }[] }) {
  const [open, setOpen] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(undefined);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="menu-bar" ref={ref}>
      {menus.map((menu) => (
        <div key={menu.label} className="menu-bar-entry">
          <button
            className={`menu-bar-title${open === menu.label ? ' open' : ''}`}
            onClick={() => setOpen(open === menu.label ? undefined : menu.label)}
            onMouseEnter={() => open && setOpen(menu.label)}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <ul className="menu window menu-dropdown">
              {menu.items.map((item) => (
                <li
                  key={item.label}
                  className={`menu-item${item.disabled ? ' disabled' : ''}`}
                  onClick={() => {
                    if (item.disabled) return;
                    setOpen(undefined);
                    item.onClick();
                  }}
                >
                  <span className="menu-check">{item.checked ? '✓' : ''}</span>
                  <span>{item.label}</span>
                  {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
