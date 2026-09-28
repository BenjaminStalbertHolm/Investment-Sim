import type { CSSProperties, ReactNode } from 'react';
import { showError } from '../state/game';
import { Link } from './web';
import './more.css';

/** Colours and type of one of Phase 10's sites (spec §14.2): each is a banner, a navigation bar, a body and a footer. */
export interface Look {
  /** Banner background and text, the accent (rules, headings), the page background and the typeface. */
  head: string;
  ink: string;
  accent: string;
  page: string;
  font: string;
}

/**
 * The frame the Phase 10 sites share: a banner with the logo and tagline, links, and small print. Each site brings its own
 * colours, so a dozen sites need one stylesheet.
 */
export function SiteFrame({ home, logo, tagline, nav, look, footer, children, className }: {
  home: string;
  logo: ReactNode;
  tagline?: ReactNode;
  nav?: [string, string][];
  look: Look;
  footer: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const style = { '--head': look.head, '--ink': look.ink, '--accent': look.accent, '--page': look.page, '--font': look.font } as CSSProperties;
  return (
    <div className={`site-frame ${className ?? ''}`} style={style}>
      <div className="frame-head">
        <Link href={`http://${home}/`} className="frame-logo">
          {logo}
        </Link>
        {tagline && <span className="frame-tagline">{tagline}</span>}
      </div>
      {nav && (
        <div className="frame-nav">
          {nav.map(([href, label], k) => (
            <span key={href}>
              {k > 0 && ' | '}
              <Link href={href}>{label}</Link>
            </span>
          ))}
        </div>
      )}
      <div className="frame-body">{children}</div>
      <p className="frame-footer">{footer}</p>
    </div>
  );
}

/** Runs a worker action and shows its error, if any, in a message box. Resolves true when it went through. */
export const act = (p: Promise<string | undefined>): Promise<boolean> =>
  p.then((e) => {
    if (e) showError(e);
    return !e;
  });
