import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../art/icons';
import { dialUp } from '../../audio/sounds';
import { companyAt, Site } from '../../sites/Site';
import { CELLAR, CLOVE, MARKETS } from '../../sim/data/darkweb';
import { BARRENS, JOTTINGS, NEWSWIRE, QUOTEZONE, normalizeUrl } from '../../sites/urls';
import { PageContext, type Page } from '../../sites/web';
import { HOME_PAGE, useBrowser, type Dialup } from '../../state/browser';
import { useGame } from '../../state/game';
import { useWindows } from '../../state/windows';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import '../../sites/web.css';

/** Fake dial-up delay per page, in ms: the same page always takes the same time (no randomness involved). */
export function loadingDelay(url: string, dialup: Dialup): number {
  if (dialup === 'off') return 0;
  let hash = 0;
  for (const ch of url) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [lo, hi] = dialup === 'short' ? [250, 750] : [1500, 4500];
  return lo + (hash % (hi - lo));
}

/** The Garlic Browser's route through the network: three hops, each slower than the web (spec §14A: multi-hop loading). */
export const HOPS = 3;
export function garlicDelay(url: string, dialup: Dialup): number {
  return HOPS * (dialup === 'off' ? 150 : 300 + loadingDelay(url, dialup) / 2);
}

/** The Garlic Browser's home page and bookmarks: the directory, the forum and the markets (spec §14A). */
export const GARLIC_HOME = `http://${CLOVE}/`;
const GARLIC_BOOKMARKS = [
  { url: GARLIC_HOME, title: 'The Clove (directory)' },
  { url: `http://${CELLAR}/`, title: 'The Cellar (forum)' },
  ...MARKETS.map((m) => ({ url: `http://${m.host}/`, title: m.name })),
];

type Move = 'go' | 'back' | 'forward' | 'reload';
const forget = () => undefined;

/** Internet Exploiter 4.0 (spec §14). */
export default function Browser(props: AppProps) {
  return <BrowserWindow {...props} />;
}

/**
 * Internet Exploiter 4.0 (spec §14): back, forward, stop, refresh, home, favourites, history, an address bar with
 * fake domains, a status bar and a spinning logo while the (optional) dial-up delay runs. The same chrome, dark and
 * slow and without history, is the Garlic Browser (spec §14A).
 */
export function BrowserWindow({ windowId, garlic = false }: AppProps & { garlic?: boolean }) {
  const home = garlic ? GARLIC_HOME : HOME_PAGE;
  const url = useWindows((s) => s.windows.find((w) => w.id === windowId)?.params?.url) ?? home;
  const { setParams, setTitle } = useWindows.getState();
  const { history, dialup, addFavourite, removeFavourite, clearHistory, setDialup } = useBrowser();
  const favourites = useBrowser((s) => (garlic ? GARLIC_BOOKMARKS : s.favourites));
  // The Garlic Browser keeps no history.
  const visit = garlic ? forget : useBrowser.getState().visit;
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [pending, setPending] = useState<{ url: string; move: Move; ms: number }>();
  const [typed, setTyped] = useState<string>();
  const [hover, setHover] = useState<string>();
  const [title, setPageTitle] = useState('');
  const [panel, setPanel] = useState<'history' | 'favourites'>();
  const [reloads, setReloads] = useState(0);
  const [layer, setLayer] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dialled = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => new URL(url), [url]);

  const commit = useCallback(
    (target: string, move: Move) => {
      setPending(undefined);
      setTyped(undefined);
      setHover(undefined);
      if (move === 'reload') {
        setReloads((n) => n + 1);
        return;
      }
      if (move === 'go' && target !== url) {
        setBack((b) => [...b, url]);
        setForward([]);
      } else if (move === 'back') {
        setBack((b) => b.slice(0, -1));
        setForward((f) => [url, ...f]);
      } else if (move === 'forward') {
        setForward((f) => f.slice(1));
        setBack((b) => [...b, url]);
      }
      const { directory, firmName } = useGame.getState();
      setParams(windowId, { url: target, company: companyAt(new URL(target), directory, firmName) });
      visit(target);
      scroller.current?.scrollTo(0, 0);
    },
    [url, windowId, setParams, visit],
  );

  const go = useCallback(
    (target: string, move: Move = 'go') => {
      clearTimeout(timer.current);
      const next = move === 'go' ? normalizeUrl(target) : target;
      const ms = (garlic ? garlicDelay : loadingDelay)(next, useBrowser.getState().dialup);
      if (!ms) return commit(next, move);
      // The modem answers the first page of a window that has not connected yet (spec §17: dial-up noise).
      if (!garlic && !dialled.current && useBrowser.getState().dialup === 'authentic') {
        dialled.current = true;
        dialUp(ms / 1000);
      }
      setPending({ url: next, move, ms });
      timer.current = setTimeout(() => commit(next, move), ms);
    },
    [commit, garlic],
  );

  // "Peeling layer 2 of 3…": which hop a Garlic page has reached.
  useEffect(() => {
    if (!garlic || !pending) return;
    const start = performance.now();
    setLayer(1);
    const timer = setInterval(() => setLayer(Math.min(HOPS, 1 + Math.floor(((performance.now() - start) / pending.ms) * HOPS))), 50);
    return () => clearInterval(timer);
  }, [garlic, pending]);

  const stop = () => {
    clearTimeout(timer.current);
    setPending(undefined);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // The first page of a new window counts as visited, and a company page gets watched for live quotes.
  useEffect(() => {
    const { directory, firmName } = useGame.getState();
    setParams(windowId, { url, company: companyAt(parsed, directory, firmName) });
    visit(url);
    // Only on opening: navigation takes care of itself afterwards.
  }, []);

  useEffect(() => {
    setTitle(windowId, `${title || parsed.hostname} - ${garlic ? 'Garlic Browser 0.9 beta' : 'Internet Exploiter'}`);
  }, [title, parsed, windowId, setTitle, garlic]);

  const page: Page = useMemo(
    () => ({ url: parsed, navigate: (href) => go(new URL(href, parsed).href), status: setHover, setTitle: setPageTitle, garlic }),
    [parsed, go, garlic],
  );

  const loading = pending !== undefined;
  const menus = garlic
    ? [
        {
          label: 'View',
          items: [
            { label: 'Refresh', shortcut: 'F5', onClick: () => go(url, 'reload') },
            { label: 'Stop', disabled: !loading, onClick: stop },
          ],
        },
        {
          label: 'Bookmarks',
          items: GARLIC_BOOKMARKS.map((f) => ({ label: f.title, onClick: () => go(f.url) })),
        },
      ]
    : [
    {
      label: 'View',
      items: [
        { label: 'Refresh', shortcut: 'F5', onClick: () => go(url, 'reload') },
        { label: 'Stop', disabled: !loading, onClick: stop },
        { label: 'History Bar', checked: panel === 'history', onClick: () => setPanel(panel === 'history' ? undefined : 'history') },
        ...(['off', 'short', 'authentic'] as const).map((d) => ({
          label: `Dial-up delay: ${d[0].toUpperCase()}${d.slice(1)}`,
          checked: dialup === d,
          onClick: () => setDialup(d),
        })),
      ],
    },
    {
      label: 'Go',
      items: [
        { label: 'Back', disabled: !back.length, onClick: () => go(back.at(-1)!, 'back') },
        { label: 'Forward', disabled: !forward.length, onClick: () => go(forward[0], 'forward') },
        { label: 'Home Page', onClick: () => go(HOME_PAGE) },
        { label: 'QuoteZone', onClick: () => go(`http://${QUOTEZONE}/`) },
        { label: 'Majorsoft Newswire', onClick: () => go(`http://${NEWSWIRE}/`) },
        { label: 'The Wall Street Jottings', onClick: () => go(`http://${JOTTINGS}/`) },
        { label: 'Barren’s Weekly', onClick: () => go(`http://${BARRENS}/`) },
      ],
    },
    {
      label: 'Favorites',
      items: [
        { label: 'Add to Favorites…', onClick: () => addFavourite({ url, title: title || url }) },
        { label: 'Remove This Page', disabled: !favourites.some((f) => f.url === url), onClick: () => removeFavourite(url) },
        ...favourites.map((f) => ({ label: f.title, onClick: () => go(f.url) })),
      ],
    },
  ];

  return (
    <div className={`app browser${garlic ? ' garlic' : ''}`}>
      <AppMenuBar windowId={windowId} menus={menus} />
      <div className="browser-toolbar">
        <button disabled={!back.length} onClick={() => go(back.at(-1)!, 'back')} title="Back">
          <span className="tb-glyph">◀</span>Back
        </button>
        <button disabled={!forward.length} onClick={() => go(forward[0], 'forward')} title="Forward">
          <span className="tb-glyph">▶</span>Forward
        </button>
        <button disabled={!loading} onClick={stop} title="Stop">
          <span className="tb-glyph stop">✕</span>Stop
        </button>
        <button onClick={() => go(url, 'reload')} title="Refresh">
          <span className="tb-glyph">↻</span>Refresh
        </button>
        <button onClick={() => go(home)} title="Home">
          <span className="tb-glyph">⌂</span>Home
        </button>
        <button className={panel === 'favourites' ? 'pressed' : ''} onClick={() => setPanel(panel === 'favourites' ? undefined : 'favourites')}>
          <span className="tb-glyph">★</span>Favorites
        </button>
        {!garlic && (
          <button className={panel === 'history' ? 'pressed' : ''} onClick={() => setPanel(panel === 'history' ? undefined : 'history')}>
            <span className="tb-glyph">◷</span>History
          </button>
        )}
        <span className={`browser-throbber${loading ? ' spinning' : ''}`}>
          <Icon name={garlic ? 'garlic' : 'browser'} size={32} />
        </span>
      </div>
      <form
        className="browser-address"
        onSubmit={(e) => {
          e.preventDefault();
          go(typed ?? url);
        }}
      >
        <label htmlFor={`${windowId}-address`}>Address</label>
        <input type="text"
          id={`${windowId}-address`}
          value={typed ?? pending?.url ?? url}
          onChange={(e) => setTyped(e.target.value)}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
        />
        <button type="submit">Go</button>
      </form>
      <div className="browser-main">
        {panel && (
          <div className="browser-panel sunken-panel">
            <div className="browser-panel-title">
              <b>{panel === 'history' ? 'History' : garlic ? 'Bookmarks' : 'Favorites'}</b>
              {panel === 'history' && <button onClick={clearHistory}>Clear</button>}
            </div>
            <ul>
              {(panel === 'history' ? [...history].reverse().map((u) => ({ url: u, title: u.replace(/^http:\/\//, '') })) : favourites).map((f) => (
                <li key={f.url} className={f.url === url ? 'current' : ''} onClick={() => go(f.url)} title={f.url}>
                  {f.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="browser-page sunken-panel" ref={scroller}>
          <PageContext.Provider value={page}>
            <div className="web-page" key={`${url}#${reloads}`}>
              <Site url={parsed} />
            </div>
          </PageContext.Provider>
        </div>
      </div>
      <div className="status-bar browser-status">
        <p className="status-bar-field">
          {loading ? (garlic ? `Peeling layer ${layer} of ${HOPS}… ${pending.url}` : `Opening page ${pending.url}…`) : (hover ?? 'Done')}
        </p>
        <p className="status-bar-field browser-progress">
          {loading && <span className="browser-progress-bar" style={{ animationDuration: `${pending.ms}ms` }} />}
        </p>
        <p className="status-bar-field browser-zone">{garlic ? 'Garlic network (3 hops)' : 'Internet zone'}</p>
      </div>
    </div>
  );
}
