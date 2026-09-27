import type { CSSProperties } from 'react';
import type { Wallpaper } from '../state/programs';
import { pictureUrl } from './pixels';

const svg = (body: string, w: number, h: number) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)}")`;

/** Wallpapers to download from majorsoft.com (spec §4, §14.2): tiled patterns, a ticker, a bull, clouds. Original art. */
export const WALLPAPERS: { id: string; name: string; style: CSSProperties }[] = [
  { id: 'clouds', name: 'Clouds', style: { background: 'radial-gradient(ellipse 60px 26px at 30% 40%, #fff 60%, transparent 62%), radial-gradient(ellipse 90px 34px at 72% 70%, #fff 60%, transparent 62%), #5a9ae0', backgroundSize: '260px 180px' } },
  { id: 'bull', name: 'Raging Bull', style: { backgroundColor: '#1c5a1c', backgroundImage: svg('<g fill="#2e7d2e"><path d="M14 20q-8-10 2-14q-2 8 8 10zM46 20q8-10-2-14q2 8-8 10z"/><ellipse cx="30" cy="30" rx="15" ry="13"/><ellipse cx="30" cy="40" rx="8" ry="5" fill="#3f9a3f"/></g><path d="M62 96l12-14 10 8 16-22" stroke="#2e7d2e" stroke-width="4" fill="none"/>', 110, 110) } },
  { id: 'ticker', name: 'Ticker', style: { backgroundColor: '#000', backgroundImage: svg('<text x="4" y="14" font-family="monospace" font-size="11" fill="#20c020">MJR ▲1.2 PEAR ▲0.8 MVDA ▼0.4 RTC ▲2.1</text><text x="-120" y="34" font-family="monospace" font-size="11" fill="#c02020">BOIN ▼1.1 XOF ▲0.3 GOGL ▲0.9 TZLA ▼3.2</text>', 280, 40) } },
  { id: 'bricks', name: 'Red Bricks', style: { background: 'linear-gradient(#e0d0c0 2px, transparent 2px) 0 0 / 40px 20px, linear-gradient(90deg, #e0d0c0 2px, transparent 2px) 0 0 / 40px 40px, linear-gradient(90deg, #e0d0c0 2px, transparent 2px) 20px 20px / 40px 40px, #a0402a' } },
  { id: 'money', name: 'Money Green', style: { background: 'repeating-linear-gradient(45deg, #2a6b3a 0 10px, #317a44 10px 20px)' } },
];

/** The desktop's background for a wallpaper choice; teal by default (spec §4). */
export function wallpaperStyle(w: Wallpaper): CSSProperties | undefined {
  if (w.kind === 'picture') return { backgroundColor: '#008080', backgroundImage: pictureUrl(w.pixels) };
  if (w.kind === 'pattern') return WALLPAPERS.find((p) => p.id === w.id)?.style;
  return undefined;
}
