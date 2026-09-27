import type { ReactNode } from 'react';

// Original pixel-style icons, drawn on a 32×32 grid. No Microsoft artwork is used.

const K = '#000';
const W = '#fff';
const G = '#c0c0c0';
const D = '#808080';

/** The Doors logo: a wooden door with a four-pane window. */
const doorLogo = (
  <>
    <rect x="7" y="2" width="18" height="28" fill="#5a300e" />
    <rect x="9" y="4" width="14" height="26" fill="#a0602a" />
    <rect x="11" y="6" width="5" height="5" fill="#e03020" />
    <rect x="17" y="6" width="5" height="5" fill="#30a030" />
    <rect x="11" y="12" width="5" height="5" fill="#2050d0" />
    <rect x="17" y="12" width="5" height="5" fill="#f0c020" />
    <rect x="11" y="20" width="11" height="7" fill="#8a5022" />
    <rect x="19" y="18" width="2" height="2" fill="#ffd700" />
  </>
);

const page = (fill = W) => (
  <>
    <path d="M7 3h13l6 6v20H7z" fill={fill} stroke={K} />
    <path d="M20 3v6h6" fill={G} stroke={K} />
  </>
);

const appWindow = (inner: ReactNode) => (
  <>
    <rect x="2.5" y="4.5" width="27" height="23" fill={G} stroke={K} />
    <rect x="3" y="5" width="26" height="4" fill="#000080" />
    <rect x="5" y="11" width="22" height="14" fill={W} />
    {inner}
  </>
);

const ICONS = {
  doors: doorLogo,
  computer: (
    <>
      <rect x="4.5" y="3.5" width="23" height="18" fill={G} stroke={K} />
      <rect x="7" y="6" width="18" height="12" fill="#008080" stroke={D} />
      <rect x="9" y="8" width="6" height="2" fill="#7ff" />
      <rect x="12" y="22" width="8" height="3" fill={D} />
      <rect x="3.5" y="25.5" width="25" height="4" fill={G} stroke={K} />
      <path d="M6 27h20" stroke={D} />
    </>
  ),
  browser: (
    <>
      <circle cx="16" cy="16" r="11" fill="#2f6fd6" stroke="#0a2a70" />
      <path d="M9 10h6l2 3-3 3-4-1zM17 19h5l1 4-4 3-2-3z" fill="#3cb043" />
      <ellipse cx="16" cy="16" rx="15" ry="5" fill="none" stroke="#f0c020" strokeWidth="2" transform="rotate(-25 16 16)" />
      <path d="M26 3l-4 7h3l-3 6" fill="none" stroke="#ffe000" strokeWidth="2" />
    </>
  ),
  trade: appWindow(
    <>
      <path d="M6 23l5-5 4 3 5-7 6-4" fill="none" stroke="#008000" strokeWidth="2" />
      <rect x="9" y="12" width="2" height="5" fill="#c00000" />
      <rect x="17" y="17" width="2" height="4" fill="#c00000" />
      <rect x="22" y="12" width="2" height="6" fill="#008000" />
    </>,
  ),
  mail: (
    <>
      <rect x="2.5" y="8.5" width="24" height="17" fill={W} stroke={K} />
      <path d="M3 9l11.5 9L26 9" fill="none" stroke={K} />
      <path d="M3 25l9-8M26 25l-9-8" stroke={D} />
      <path d="M20 4h7v-2l4 4-4 4v-2h-7z" fill="#2050d0" stroke="#000080" />
    </>
  ),
  portfolio: (
    <>
      <path d="M12 8V5h8v3" fill="none" stroke="#3a1f08" strokeWidth="2" />
      <rect x="3.5" y="8.5" width="25" height="18" fill="#8b5a2b" stroke="#3a1f08" />
      <rect x="4" y="15" width="24" height="2" fill="#6b3f18" />
      <rect x="14" y="14" width="4" height="4" fill="#ffd700" stroke="#7a5a00" />
    </>
  ),
  notepad: (
    <>
      {page()}
      {[12, 15, 18, 21, 24].map((y) => (
        <path key={y} d={`M10 ${y}h13`} stroke="#6080d0" />
      ))}
      {[10, 14, 18].map((x) => (
        <rect key={x} x={x} y="1" width="2" height="4" fill={D} />
      ))}
    </>
  ),
  calculator: (
    <>
      <rect x="6.5" y="2.5" width="19" height="27" fill={G} stroke={K} />
      <rect x="9" y="5" width="14" height="5" fill="#90b090" stroke={D} />
      {[0, 1, 2].flatMap((c) =>
        [0, 1, 2, 3].map((r) => <rect key={`${c}${r}`} x={9 + c * 5} y={12 + r * 4} width="4" height="3" fill={r === 3 && c === 2 ? '#c00000' : W} stroke={D} strokeWidth="0.5" />),
      )}
    </>
  ),
  recyclebin: (
    <>
      <rect x="6.5" y="5.5" width="19" height="3" fill={G} stroke={K} />
      <path d="M8 9h16l-2 20H10z" fill="#e0e0e0" stroke={K} />
      {[11, 14, 17, 20].map((x) => (
        <path key={x} d={`M${x + 0.5} 10v18`} stroke={D} />
      ))}
    </>
  ),
  messenger: (
    <>
      <path d="M3 6h26v16H14l-6 6v-6H3z" fill={W} stroke={K} />
      <ellipse cx="16" cy="14" rx="9" ry="5" fill={W} stroke="#008000" strokeWidth="1.5" />
      <circle cx="16" cy="14" r="3.5" fill="#20a020" />
      <circle cx="16" cy="14" r="1.5" fill={K} />
    </>
  ),
  word: (
    <>
      {page()}
      <rect x="7" y="10" width="19" height="9" fill="#2050d0" />
      <path d="M9 18v-7l3 4 3-4v7" fill="none" stroke={W} strokeWidth="1.5" />
      {[21, 24, 27].map((y) => (
        <path key={y} d={`M9 ${y}h15`} stroke={D} />
      ))}
    </>
  ),
  sheet: (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" fill={W} stroke={K} />
      <rect x="4" y="5" width="24" height="4" fill="#208040" />
      {[10, 16, 22].map((x) => (
        <path key={x} d={`M${x + 0.5} 9v18`} stroke="#90c0a0" />
      ))}
      {[13, 17, 21, 25].map((y) => (
        <path key={y} d={`M4 ${y + 0.5}h24`} stroke="#90c0a0" />
      ))}
      <path d="M12 12l6 7M18 12l-6 7" stroke="#208040" strokeWidth="2" />
    </>
  ),
  hr: (
    <>
      <circle cx="11" cy="10" r="4.5" fill="#e0b080" stroke={K} />
      <path d="M3 27c0-7 3-10 8-10s8 3 8 10z" fill="#2050d0" stroke={K} />
      <circle cx="22" cy="12" r="4" fill="#a06840" stroke={K} />
      <path d="M15 28c1-6 3-9 7-9s7 3 7 9z" fill="#c02020" stroke={K} />
    </>
  ),
  rolodex: (
    <>
      <rect x="5.5" y="22.5" width="21" height="6" fill="#404040" stroke={K} />
      <circle cx="16" cy="18" r="3" fill={D} stroke={K} />
      <rect x="6.5" y="6.5" width="19" height="12" fill="#fffbe0" stroke={K} />
      <rect x="9.5" y="4.5" width="19" height="12" fill={W} stroke={K} />
      <path d="M12 8h8M12 11h13M12 14h10" stroke="#6080d0" />
    </>
  ),
  defrag: (
    <>
      <rect x="3.5" y="3.5" width="25" height="25" fill={W} stroke={K} />
      {Array.from({ length: 30 }, (_, i) => {
        const colours = ['#2050d0', '#c02020', '#20a020', '#f0c020', '#2050d0', W];
        return <rect key={i} x={5 + (i % 6) * 4} y={5 + Math.floor(i / 6) * 4.5} width="3" height="3.5" fill={colours[(i * 7) % 6]} />;
      })}
    </>
  ),
  taskmangler: appWindow(
    <>
      {[4, 8, 5, 10, 7, 12].map((h, i) => (
        <rect key={i} x={7 + i * 3} y={24 - h} width="2" height={h} fill="#00a000" />
      ))}
    </>,
  ),
  paint: (
    <>
      <path d="M16 4C8 4 3 9 3 16s5 12 11 12c3 0 3-3 2-5s1-4 4-3 9 0 9-7C29 8 23 4 16 4z" fill="#e8c890" stroke={K} />
      <circle cx="10" cy="12" r="2.5" fill="#e03020" />
      <circle cx="16" cy="9" r="2.5" fill="#f0c020" />
      <circle cx="22" cy="12" r="2.5" fill="#2050d0" />
      <circle cx="9" cy="19" r="2.5" fill="#30a030" />
    </>
  ),
  help: (
    <>
      <rect x="5.5" y="3.5" width="21" height="25" fill="#f0c020" stroke={K} />
      <rect x="5" y="3" width="4" height="26" fill="#c09000" />
      <text x="17.5" y="23" fontSize="18" fontWeight="bold" fontFamily="Georgia, serif" textAnchor="middle" fill="#000080">?</text>
    </>
  ),
  run: appWindow(<path d="M8 18h10v-3l6 5-6 5v-3H8z" fill="#20a020" stroke="#004000" />),
  shutdown: (
    <>
      <rect x="4.5" y="4.5" width="23" height="17" fill={G} stroke={K} />
      <rect x="7" y="7" width="18" height="12" fill={K} />
      <rect x="3.5" y="24.5" width="25" height="4" fill={G} stroke={K} />
      <circle cx="16" cy="13" r="4" fill="none" stroke="#e05000" strokeWidth="1.5" />
      <path d="M16 8v5" stroke="#e05000" strokeWidth="1.5" />
    </>
  ),
  programs: (
    <>
      <path d="M2.5 7.5h10l2 3h14v17h-26z" fill="#f0d060" stroke={K} />
      <rect x="10.5" y="13.5" width="14" height="10" fill={G} stroke={K} />
      <rect x="11" y="14" width="13" height="2" fill="#000080" />
    </>
  ),
  documents: (
    <>
      <path d="M2.5 7.5h10l2 3h14v17h-26z" fill="#f0d060" stroke={K} />
      <path d="M10.5 12.5h9l3 3v10h-12z" fill={W} stroke={K} />
    </>
  ),
  settings: (
    <>
      <path d="M2.5 7.5h10l2 3h14v17h-26z" fill="#f0d060" stroke={K} />
      <circle cx="17" cy="19" r="5" fill={D} stroke={K} strokeDasharray="2 1.2" strokeWidth="2.5" />
      <circle cx="17" cy="19" r="2" fill="#f0d060" />
    </>
  ),
  shame: (
    <>
      <rect x="2" y="27" width="28" height="4" fill="#3a8a3a" />
      <path d="M8.5 28.5V12a7.5 7.5 0 0 1 15 0v16.5z" fill={G} stroke={K} />
      <text x="16" y="17" fontSize="6" fontWeight="bold" fontFamily="Arial, sans-serif" textAnchor="middle" fill={D}>RIP</text>
      <path d="M11 20.5h10M11 23.5h7" stroke={D} />
    </>
  ),
  find: (
    <>
      <circle cx="13" cy="13" r="8" fill="#c0e0ff" stroke={K} strokeWidth="2" />
      <path d="M19 19l9 9" stroke="#5a300e" strokeWidth="4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 32, shortcut }: { name: IconName; size?: number; shortcut?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true">
      {ICONS[name]}
      {shortcut && (
        <g>
          <rect x="0.5" y="21.5" width="10" height="10" fill={W} stroke={K} />
          <path d="M3 29v-3c0-2 1-3 3-3h1v-2l3 3.5-3 3.5v-2H6c-1 0-2 1-2 3z" fill={K} />
        </g>
      )}
    </svg>
  );
}
