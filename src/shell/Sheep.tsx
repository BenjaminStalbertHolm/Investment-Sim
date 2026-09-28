import { useEffect, useState } from 'react';
import { useGame } from '../state/game';
import { useWindows } from '../state/windows';
import '../apps/modules.css';

const STEP = 6;
const WIDTH = 30;

/**
 * The desktop sheep (spec §16C.2): it walks along the top edge of the front window, turns at the corners, and hops to
 * the next window when that one closes — along the taskbar when there is none. On a day the market is up, it is a bull.
 */
export default function Sheep() {
  const windows = useWindows((s) => s.windows);
  const bull = useGame((s) => (s.snapshot?.index.change ?? 0) > 0);
  const [pos, setPos] = useState({ x: 40, dir: 1 });
  const front = windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
  const edge = front && !front.maximized ? { left: front.bounds.x, right: front.bounds.x + front.bounds.width, top: front.bounds.y } : undefined;
  const floor = { left: 0, right: window.innerWidth, top: window.innerHeight - 30 };
  const path = edge ?? floor;

  useEffect(() => {
    const timer = setInterval(
      () =>
        setPos((p) => {
          const next = p.x + p.dir * STEP;
          if (next < path.left) return { x: path.left, dir: 1 };
          if (next > path.right - WIDTH) return { x: path.right - WIDTH, dir: -1 };
          return { ...p, x: next };
        }),
      250,
    );
    return () => clearInterval(timer);
  }, [path.left, path.right]);

  const x = Math.min(Math.max(pos.x, path.left), path.right - WIDTH);
  return (
    <div className={`desktop-sheep ${pos.dir < 0 ? 'left' : ''}`} style={{ left: x, top: path.top - 22 }} aria-hidden="true">
      <svg width={WIDTH} height={22} viewBox="0 0 30 22">
        {bull ? (
          <>
            <ellipse cx="14" cy="12" rx="10" ry="6" fill="#5a3a1a" />
            <circle cx="25" cy="9" r="4" fill="#5a3a1a" />
            <path d="M23 5l-2-4M27 5l2-4" stroke="#e8e0c0" strokeWidth="1.5" />
            <path d="M7 17v5M11 17v5M17 17v5M21 17v5" stroke="#3a2410" strokeWidth="2" />
          </>
        ) : (
          <>
            <ellipse cx="13" cy="11" rx="10" ry="7" fill="#f6f6f0" stroke="#808080" />
            <circle cx="24" cy="9" r="4" fill="#303030" />
            <circle cx="25" cy="8" r="0.8" fill="#fff" />
            <path d="M7 17v5M11 17v5M16 17v5M20 17v5" stroke="#303030" strokeWidth="2" />
          </>
        )}
      </svg>
    </div>
  );
}
