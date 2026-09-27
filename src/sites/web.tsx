import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useBrowser } from '../state/browser';
import type { Tile } from './data/themes';

/** What a page knows about the browser window showing it. */
export interface Page {
  url: URL;
  navigate(href: string): void;
  /** Status bar text; undefined restores the default. */
  status(text?: string): void;
  setTitle(title: string): void;
  /** Shown in the Garlic Browser, which alone reaches .garlic addresses (spec §14A). */
  garlic?: boolean;
}

export const PageContext = createContext<Page>({
  url: new URL('http://www.yeehaw.com/'),
  navigate: () => undefined,
  status: () => undefined,
  setTitle: () => undefined,
});

export const usePage = () => useContext(PageContext);

/** Sets the window title while the page shows. */
export function useTitle(title: string): void {
  const { setTitle } = usePage();
  useEffect(() => setTitle(title), [title, setTitle]);
}

/**
 * A hyperlink inside the fake web: blue and underlined, purple once visited (spec §14). It has no real href, so a
 * middle click can never leave the game for a real site of the same name.
 */
export function Link({ href, children, className, style }: { href: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const page = usePage();
  const target = new URL(href, page.url).href;
  const visited = useBrowser((s) => s.history.includes(target));
  const go = () => page.navigate(target);
  return (
    <a
      role="link"
      tabIndex={0}
      className={`${visited ? 'visited' : ''} ${className ?? ''}`}
      style={style}
      onClick={go}
      onKeyDown={(e) => e.key === 'Enter' && go()}
      onMouseEnter={() => page.status(`Shortcut to ${target}`)}
      onMouseLeave={() => page.status()}
    >
      {children}
    </a>
  );
}

/** `<marquee>`, rebuilt in React and CSS (spec §14). */
export function Marquee({ children, speed = 12, className }: { children: ReactNode; speed?: number; className?: string }) {
  return (
    <div className={`marquee ${className ?? ''}`}>
      <span style={{ animationDuration: `${speed}s` }}>{children}</span>
    </div>
  );
}

/** "You are visitor number 0012345". */
export function HitCounter({ count }: { count: number }) {
  return (
    <div className="hit-counter">
      You are visitor number{' '}
      <span className="hit-digits">
        {String(Math.round(count))
          .padStart(7, '0')
          .split('')
          .map((d, k) => (
            <span key={k}>{d}</span>
          ))}
      </span>
    </div>
  );
}

/** The yellow-and-black roadworks sign, drawn in CSS. */
export function UnderConstruction() {
  return (
    <div className="under-construction">
      <span className="uc-stripes" />
      <b>UNDER CONSTRUCTION</b>
      <span className="uc-stripes" />
    </div>
  );
}

/** An animated rainbow separator. */
export const Rule = () => <div className="web-rule" />;

export const BestViewed = () => (
  <p className="best-viewed">
    Best viewed at 800×600 with Internet Exploiter 4.0 <span className="ie-badge">e</span>
  </p>
);

/** Page background for a tile pattern, tinted with a site's colours. */
export function tileStyle(tile: Tile, main: string, accent: string): CSSProperties {
  const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;
  const a = tint(main, 10);
  const b = tint(main, 20);
  const c = tint(accent, 25);
  const bg = (backgroundImage: string, backgroundSize: string): CSSProperties => ({ backgroundColor: a, backgroundImage, backgroundSize });
  switch (tile) {
    case 'plain':
      return { backgroundColor: tint(main, 6) };
    case 'paper':
      return bg(`repeating-linear-gradient(0deg, ${b} 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, ${a} 0 1px, transparent 1px 5px)`, 'auto');
    case 'marble':
      return bg(`radial-gradient(ellipse at 20% 30%, ${c} 0 10%, transparent 30%), radial-gradient(ellipse at 70% 80%, ${b} 0 12%, transparent 35%)`, '160px 120px');
    case 'wood':
      return bg(`repeating-linear-gradient(0deg, ${b} 0 3px, ${a} 3px 9px, ${c} 9px 10px, ${a} 10px 16px)`, 'auto');
    case 'grid':
      return bg(`linear-gradient(${b} 1px, transparent 1px), linear-gradient(90deg, ${b} 1px, transparent 1px)`, '20px 20px');
    case 'circuit':
      return bg(`radial-gradient(${c} 2px, transparent 3px), linear-gradient(${b} 1px, transparent 1px), linear-gradient(90deg, ${b} 1px, transparent 1px)`, '24px 24px');
    case 'stars':
      return bg(`radial-gradient(${c} 1.5px, transparent 2px), radial-gradient(${b} 1px, transparent 1.5px)`, '37px 41px, 23px 19px');
    case 'dots':
      return bg(`radial-gradient(${b} 3px, transparent 3.5px)`, '18px 18px');
    case 'stripes':
      return bg(`repeating-linear-gradient(45deg, ${b} 0 8px, ${a} 8px 16px)`, 'auto');
    case 'bricks':
      return bg(`linear-gradient(${c} 2px, transparent 2px), linear-gradient(90deg, ${c} 2px, transparent 2px)`, '40px 20px');
    case 'waves':
      return bg(`radial-gradient(circle at 50% 0, transparent 9px, ${b} 10px, transparent 11px)`, '24px 12px');
    case 'leaves':
      return bg(`radial-gradient(ellipse 6px 12px at 30% 40%, ${b} 90%, transparent), radial-gradient(ellipse 10px 5px at 75% 70%, ${c} 90%, transparent)`, '48px 40px');
  }
}
