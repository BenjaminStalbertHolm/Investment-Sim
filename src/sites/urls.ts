import type { Directory } from '../sim/types';

/** Web addresses of the 90s web (spec §14): every site lives at a fake domain; pages are rendered from data. */

export const YEEHAW = 'www.yeehaw.com';
export const QUOTEZONE = 'www.quotezone.com';
export const NEWSWIRE = 'newswire.majorsoft.com';
export const JOTTINGS = 'www.wsjottings.com';
export const BARRENS = 'www.barrens.com';

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

const RESERVED = new Set([YEEHAW, QUOTEZONE, NEWSWIRE, JOTTINGS, BARRENS, 'www.majorsoft.com']);

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
    if (url.hostname.split('.').length === 2) url.hostname = `www.${url.hostname}`;
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
