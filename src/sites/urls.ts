import { ALL_OUTLETS, OUTLET } from '../sim/data/outlets';
import type { NewsItem } from '../sim/news';
import type { Directory } from '../sim/types';

/** Web addresses of the 90s web (spec §14): every site lives at a fake domain; pages are rendered from data. */

export const YEEHAW = 'www.yeehaw.com';
export const QUOTEZONE = 'www.quotezone.com';
export const NEWSWIRE = 'newswire.majorsoft.com';
export const JOTTINGS = 'www.wsjottings.com';
export const BARRENS = 'www.barrens.com';
export const RAGINGBEAR = 'www.ragingbear.com';
// Phase 7: the futures exchange, the weather, OPEK, the central bank, the firm's bank and its credit bureau.
export const EXCHANGE = 'www.murkantile.com';
export const WEATHER = 'www.nwb.gov';
export const OPEK = 'www.opek.org';
export const FED = 'www.federalreservoir.gov';
export const BANK = 'www.firstcontinental.com';
export const EQUIFACTS = 'www.equifacts.com';
/** Ask Reeves (spec §14.2): the butler who answers questions, and the game's help. */
export const REEVES = 'www.askreeves.com';
/** Phase 8: the Securities Oversight Bureau. */
export const SOB = 'www.sob.gov';
/** Phase 9: Tucats Downloads, where the Garlic Browser (and later the optional apps) are downloaded (spec §4A, §14A). */
export const TUCATS = 'www.tucats.com';
// Phase 10 (spec §14.2): the ratings agencies, the short seller, IPOs, jobs, offices, luxuries, auctions, conferences,
// the lotto, the millennium, the OS maker, amateur home pages and pure flavour.
export const STANDARD_POURS = 'www.standardandpours.com';
export const MOODY = 'www.moodyblues.com';
export const HINDSIGHT = 'www.hindsightresearch.com';
export const IPO_HOTLINE = 'www.ipohotline.com';
export const MONSTROUS = 'www.monstrous.com';
export const GREGSLIST = 'www.gregslist.org';
export const LIFESTYLES = 'www.lifestylescatalogue.com';
export const EBUY = 'www.ebuy.com';
export const DAVOZ = 'www.davoz.org';
export const LOTTO = 'www.statelotto.gov';
export const Y2K = 'www.y2kcountdown.com';
export const MAJORSOFT = 'www.majorsoft.com';
export const HOMECITIES = 'www.homecities.com';
export const HAMSTERS = 'www.hamsterprance.com';
export const DANCING_BABY = 'www.dancingbaby.net';
/** The player's intranet (spec §14.2): intranet.<firm>.com. */
export const intranetHost = (firmName: string) => `intranet.${slugOf(firmName) || 'firm'}.com`;

/** "Alphabeta (Goggle)" → "alphabeta", "Ridgepine Timber Co." → "ridgepinetimber", "Clickzilla.com" → "clickzilla". */
export function slugOf(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/\.com$/i, '')
    .replace(/\s(Co|Inc|Corp|Ltd|PLC|Company|Corporation)\.?$/i, '')
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

export type SiteTarget = { kind: 'company'; id: number } | { kind: 'firm'; id: number } | { kind: 'player' };

export interface Sites {
  /** Host → whose site it is. */
  byHost: Map<string, SiteTarget>;
  company: string[];
  firm: string[];
  player: string;
}

const built = new WeakMap<Directory, Map<string, Sites>>();

/**
 * Every company's and firm's host name. Names are unique but slugs can collide ("A.B. Foods" and "AB Foods"), so a
 * later company falls back to its ticker. Firms come before companies, and the player's firm before both.
 */
export function sites(directory: Directory, firmName: string): Sites {
  const cache = built.get(directory) ?? built.set(directory, new Map()).get(directory)!;
  const hit = cache.get(firmName);
  if (hit) return hit;
  const byHost = new Map<string, SiteTarget>();
  const claim = (slug: string, target: SiteTarget) => {
    const host = `www.${slug}.com`;
    if (!slug || byHost.has(host) || RESERVED.has(host)) return undefined;
    byHost.set(host, target);
    return host;
  };
  const player = claim(slugOf(firmName), { kind: 'player' }) ?? claim(`${slugOf(firmName)}online`, { kind: 'player' })!;
  const firm = directory.firms.map((f, id) => claim(slugOf(f.name), { kind: 'firm', id }) ?? claim(`${f.id}funds`, { kind: 'firm', id })!);
  const company = directory.names.map(
    (name, id) =>
      claim(slugOf(name), { kind: 'company', id }) ??
      claim(`${slugOf(name)}${directory.tickers[id].toLowerCase()}`, { kind: 'company', id }) ??
      claim(`ticker${directory.tickers[id].toLowerCase()}`, { kind: 'company', id })!,
  );
  const result = { byHost, company, firm, player };
  cache.set(firmName, result);
  return result;
}

const RESERVED = new Set([
  YEEHAW, QUOTEZONE, RAGINGBEAR, EXCHANGE, WEATHER, OPEK, FED, BANK, EQUIFACTS, REEVES, SOB, TUCATS, MAJORSOFT, ...ALL_OUTLETS.map((o) => o.host),
  STANDARD_POURS, MOODY, HINDSIGHT, IPO_HOTLINE, MONSTROUS, GREGSLIST, LIFESTYLES, EBUY, DAVOZ, LOTTO, Y2K, HOMECITIES, HAMSTERS, DANCING_BABY,
]);

/**
 * What the address bar makes of typed text: a URL gets "http://" (and a trailing slash), a bare domain gets "www."
 * when it has only one dot, and anything that isn't an address is searched on Yeehaw!, as Internet Explorer 4 did.
 */
export function normalizeUrl(input: string): string {
  const text = input.trim();
  if (!text) return `http://${YEEHAW}/`;
  const scheme = /^[a-z]+:\/\//i.test(text);
  if (!scheme && (/\s/.test(text) || !/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(text))) {
    return `http://${YEEHAW}/search?q=${encodeURIComponent(text)}`;
  }
  try {
    const url = new URL(scheme ? text : `http://${text}`);
    if (url.hostname.split('.').length === 2 && !url.hostname.endsWith('.garlic')) url.hostname = `www.${url.hostname}`;
    return url.href;
  } catch {
    return `http://${YEEHAW}/search?q=${encodeURIComponent(text)}`;
  }
}

export const companyUrl = (s: Sites, id: number, page = '') => `http://${s.company[id]}/${page}`;
export const firmUrl = (s: Sites, id: number, page = '') => `http://${s.firm[id]}/${page}`;
export const playerUrl = (s: Sites, page = '') => `http://${s.player}/${page}`;
export const quoteUrl = (ticker: string) => `http://${QUOTEZONE}/quote?s=${ticker}`;
export const searchUrl = (query: string) => `http://${YEEHAW}/search?q=${encodeURIComponent(query)}`;
/** A news item's story: on the Newswire, or in the one paper that ran a bought article (spec §14A). */
export function storyUrl(item: Pick<NewsItem, 'id' | 'outlets'>): string {
  const outlet = !item.outlets || item.outlets.includes('newswire') ? 'newswire' : item.outlets[0];
  return `http://${OUTLET[outlet].host}/story?id=${item.id}-${outlet}`;
}

/** An Ask Reeves guide, or its front page. */
export const helpUrl = (topic = '') => `http://${REEVES}/${topic ? `guide?t=${topic}` : ''}`;
