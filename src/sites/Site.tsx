import type { ComponentType } from 'react';
import { useGame } from '../state/game';
import Company from './company/CompanySite';
import { FirmWebsite as Firm, PlayerWebsite as Player } from './firm/FirmSite';
import { Barrens, Jottings, Newswire } from './news/NewsSites';
import Yeehaw from './portal/Yeehaw';
import QuoteZone from './quotezone/QuoteZone';
import { BARRENS, JOTTINGS, NEWSWIRE, QUOTEZONE, YEEHAW, sites } from './urls';
import { useTitle } from './web';

type SiteComponent = ComponentType<{ url: URL }>;

const STATIC: Record<string, SiteComponent> = {
  [YEEHAW]: Yeehaw,
  [QUOTEZONE]: QuoteZone,
  [NEWSWIRE]: Newswire,
  [JOTTINGS]: Jottings,
  [BARRENS]: Barrens,
};

/** The company a URL is about, if any: its own site or its QuoteZone quote. The browser watches it for live quotes. */
export function companyAt(url: URL, directory: ReturnType<typeof useGame.getState>['directory'], firmName: string): number | undefined {
  if (url.hostname === QUOTEZONE && url.pathname === '/quote') {
    const i = directory.tickers.indexOf((url.searchParams.get('s') ?? '').toUpperCase());
    return i < 0 ? undefined : i;
  }
  const target = sites(directory, firmName).byHost.get(url.hostname);
  return target?.kind === 'company' ? target.id : undefined;
}

/** Renders whatever lives at a URL (spec §14: pages are React components rendered from data, never stored HTML). */
export function Site({ url }: { url: URL }) {
  const directory = useGame((s) => s.directory);
  const firmName = useGame((s) => s.firmName);
  const page = url.pathname.replace(/^\//, '');
  const Static = STATIC[url.hostname];
  const target = Static ? undefined : sites(directory, firmName).byHost.get(url.hostname);
  return Static ? (
    <Static url={url} />
  ) : target?.kind === 'company' ? (
    <Company id={target.id} page={page} />
  ) : target?.kind === 'firm' ? (
    <Firm id={target.id} page={page} />
  ) : target?.kind === 'player' ? (
    <Player page={page} />
  ) : (
    <CannotDisplay url={url} />
  );
}

/** Internet Explorer's error page, as every 1998 web user knew it. */
function CannotDisplay({ url }: { url: URL }) {
  useTitle('Cannot find server');
  return (
    <div className="cannot-display">
      <h1>The page cannot be displayed</h1>
      <p>
        The page you are looking for is currently unavailable. The Web site might be experiencing technical difficulties, or
        you may need to adjust your browser settings.
      </p>
      <hr />
      <p>Please try the following:</p>
      <ul>
        <li>Click the Refresh button, or try again later.</li>
        <li>
          If you typed the page address in the Address bar, make sure that it is spelled correctly: <b>{url.hostname}</b>
        </li>
        <li>Search for the company or firm on Yeehaw! by typing its name in the Address bar.</li>
      </ul>
      <p className="cannot-display-code">Cannot find server or DNS Error — Internet Exploiter</p>
    </div>
  );
}
