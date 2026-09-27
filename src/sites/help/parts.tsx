import type { ReactNode } from 'react';
import type { AppId } from '../../apps/catalog';
import { useTrade, type TradeTab } from '../../state/trade';
import { useWindows } from '../../state/windows';
import { helpUrl } from '../urls';
import { Link } from '../web';

/**
 * A shortcut into the game from a guide, as 90s help files had ("Click here to open Display Properties"): opens an
 * app, on a MajorTrade tab or a My Computer panel.
 */
export function Go({ app, tab, view, children }: { app: AppId; tab?: TradeTab; view?: string; children: ReactNode }) {
  const go = () => {
    if (tab) useTrade.getState().setTab(tab);
    useWindows.getState().open(app, view ? { view } : undefined);
  };
  return (
    <a role="link" tabIndex={0} className="reeves-go" onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
      ↗ {children}
    </a>
  );
}

/** A link to another guide. */
export const See = ({ topic, children }: { topic: string; children: ReactNode }) => <Link href={helpUrl(topic)}>{children}</Link>;

/** A worked example, boxed. */
export const Example = ({ title = 'For example', children }: { title?: string; children: ReactNode }) => (
  <div className="reeves-example">
    <b>{title}</b>
    {children}
  </div>
);

/** Reeves's aside: a tip or a warning. */
export const Tip = ({ children }: { children: ReactNode }) => (
  <p className="reeves-tip">
    <b>Reeves suggests:</b> {children}
  </p>
);

/** Numbered steps. */
export const Steps = ({ children }: { children: ReactNode }) => <ol className="reeves-steps">{children}</ol>;

/** Reeves the butler, drawn in SVG (original art): bald, grey at the sides, a fine moustache and a bow tie. */
export function Butler({ size = 72 }: { size?: number }) {
  return (
    <svg className="reeves-butler" width={size} height={size * 1.15} viewBox="0 0 64 74" aria-hidden="true">
      <path d="M6 74c2-14 12-20 26-20s24 6 26 20z" fill="#1a1a1a" />
      <path d="M26 54l6 14 6-14z" fill="#fff" />
      <path d="M26 56l6 4-6 4zM38 56l-6 4 6 4z" fill="#111" />
      <circle cx="32" cy="60" r="1.6" fill="#333" />
      <rect x="27" y="44" width="10" height="10" fill="#e8b98f" />
      <ellipse cx="32" cy="30" rx="15" ry="18" fill="#f1c8a0" />
      <path d="M17 26c0-7 2-10 4-11-1 5-1 9 0 13zM47 26c0-7-2-10-4-11 1 5 1 9 0 13z" fill="#b8b8b8" />
      <ellipse cx="16.5" cy="31" rx="2.5" ry="4" fill="#e8b98f" />
      <ellipse cx="47.5" cy="31" rx="2.5" ry="4" fill="#e8b98f" />
      <path d="M23 24.5q3-2 6 0M35 24.5q3-2 6 0" stroke="#777" strokeWidth="1.4" fill="none" />
      <circle cx="26" cy="29" r="1.6" fill="#222" />
      <circle cx="38" cy="29" r="1.6" fill="#222" />
      <path d="M32 29q-1 6 1 8" stroke="#c9936b" strokeWidth="1.2" fill="none" />
      <path d="M24 40q4-3 8-1q4-2 8 1q-4 1-8 0q-4 1-8 0z" fill="#8a8a8a" />
      <path d="M28 44q4 2 8 0" stroke="#a0604a" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
