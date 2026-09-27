import type { ReactNode } from 'react';
import { helpUrl } from '../sites/urls';
import { openUrl } from '../state/game';

/** A link from an app to an Ask Reeves guide, opened in Internet Exploiter. */
export function HelpLink({ topic, children }: { topic?: string; children: ReactNode }) {
  const open = () => openUrl(helpUrl(topic));
  return (
    <a role="link" tabIndex={0} className="help-link" onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
      {children}
    </a>
  );
}
