import { ceoName, encodeCeo, randomCeo } from '../world/ceo';
import { INDUSTRIES } from '../world/industries';
import { Rng } from '../world/rng';
import { DAY_MINUTES, dayOf, weekday, type GameTime } from './calendar';
import { ALL_OUTLETS, BEATS, type Cadence, type CoverageRule, type Outlet } from './data/outlets';
import type { NewsItem, NewsKind } from './news';

/**
 * The press (spec §14.1): outlets, their journalists, and which outlet runs which story when. Shared by the worker and
 * the web pages, so articles are worked out from the archive rather than stored.
 */
export interface Journalist {
  id: number;
  name: string;
  outlet: string;
  /** Industry indices covered; empty for a generalist ("Markets"). */
  beats: number[];
  beat: string;
  /** −1 bearish … +1 bullish. */
  bias: number;
  /** 0–1: how hard to bribe (Phase 9). */
  integrity: number;
  /** Portrait, as a CEO code (spec §14.1: generated with the portrait system). */
  face: string;
}

/** Every outlet's writers. Generated once per game and saved: bylines, and later bribes, refer to them. */
export function hireJournalists(seed: string): Journalist[] {
  const rng = Rng.stream(seed, 'press');
  const names = new Set<string>();
  const staff: Journalist[] = [];
  const beatIndex = (ids: readonly string[]) => ids.map((id) => INDUSTRIES.findIndex((i) => i.id === id));
  for (const outlet of ALL_OUTLETS) {
    const beats: { beat: string; beats: number[] }[] = outlet.industry
      ? [{ beat: INDUSTRIES.find((i) => i.id === outlet.industry)!.name, beats: beatIndex([outlet.industry]) }]
      : [{ beat: 'Markets', beats: [] }];
    const offset = rng.int(0, BEATS.length - 1);
    for (let k = 1; k < outlet.staff; k++) {
      // The rest of the newsroom splits the industries between them, some writers taking two beats.
      const per = Math.ceil(BEATS.length / (outlet.staff - 1));
      const mine = Array.from({ length: per }, (_, j) => BEATS[(offset + (k - 1) * per + j) % BEATS.length]);
      const unique = [...new Set(mine)];
      const beat = unique.length > 2 ? 'General Assignment' : unique.map((b) => b.name).join(' & ');
      beats.push({ beat, beats: beatIndex(unique.flatMap((b) => b.industries)) });
    }
    for (const b of beats) {
      let ceo = randomCeo(rng);
      while (names.has(ceoName(ceo))) ceo = randomCeo(rng);
      names.add(ceoName(ceo));
      const tabloid = outlet.credibility < 0.4;
      staff.push({
        id: staff.length,
        name: ceoName(ceo),
        outlet: outlet.id,
        ...b,
        bias: rng.range(-1, 1) * (tabloid ? 1 : 0.5),
        integrity: rng.range(...outlet.integrity),
        face: encodeCeo(ceo),
      });
    }
  }
  return staff;
}

/** What coverage rules need to know about a company. */
export interface CompanyFacts {
  /** Market cap at the start. */
  cap: number;
  industry: number;
  foreign: boolean;
}

/** Kinds only outlets that name them run: the TV and newsletter picks, and news of the player's firm. */
const OWN_KINDS = new Set<NewsKind>(['tvPick', 'fowlPick', 'firmQuarter', 'mandate']);

function matches(rule: CoverageRule, item: NewsItem, facts?: CompanyFacts): boolean {
  if (rule.kinds ? !rule.kinds.includes(item.kind) : OWN_KINDS.has(item.kind)) return false;
  if (rule.minMove !== undefined && Math.abs(item.move ?? 0) < rule.minMove) return false;
  const about = rule.minCap !== undefined || rule.maxCap !== undefined || rule.industries || rule.foreign;
  if (!about) return true;
  if (!facts) return false;
  if (rule.minCap !== undefined && facts.cap < rule.minCap) return false;
  if (rule.maxCap !== undefined && facts.cap >= rule.maxCap) return false;
  if (rule.industries && !rule.industries.includes(INDUSTRIES[facts.industry].id)) return false;
  if (rule.foreign && !facts.foreign) return false;
  return true;
}

export const covers = (outlet: Outlet, item: NewsItem, facts?: CompanyFacts) => outlet.rules.some((r) => matches(r, item, facts));

/**
 * When an outlet runs a story that broke at `time` (spec §11.7): the Newswire at once, MoneyTV within the next bar, the
 * trade press within the hour, the dailies at 6 the next morning, the weeklies on the Saturday after.
 */
export function publishTime(cadence: Cadence, time: GameTime): GameTime {
  const day = dayOf(time);
  switch (cadence) {
    case 'instant':
      return time;
    case 'bar':
      return time + 5;
    case 'hour':
      return time + 60;
    case 'morning':
      return (day + 1) * DAY_MINUTES + 6 * 60;
    case 'weekly':
      return (day + ((6 - weekday(day) + 7) % 7 || 7)) * DAY_MINUTES + 8 * 60;
  }
}

/** One outlet's article about a piece of news. */
export interface Article {
  /** "<news id>-<outlet id>" */
  id: string;
  item: NewsItem;
  outlet: Outlet;
  time: GameTime;
  journalist?: Journalist;
}

/** A small deterministic hash, for picking bylines without a random stream. */
export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('\u0000')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Who writes an outlet's story: a writer whose beat covers the industry, else a generalist. */
export function byline(item: NewsItem, outlet: Outlet, journalists: readonly Journalist[], facts?: CompanyFacts): Journalist | undefined {
  const own = journalists.filter((j) => j.outlet === outlet.id);
  const beat = facts ? own.filter((j) => j.beats.includes(facts.industry)) : [];
  const pool = beat.length ? beat : own.filter((j) => !j.beats.length).length ? own.filter((j) => !j.beats.length) : own;
  return pool.length ? pool[hash(item.id, outlet.id) % pool.length] : undefined;
}

/** Every outlet's article about a piece of news, first published first. */
export function coverage(item: NewsItem, journalists: readonly Journalist[], facts?: CompanyFacts): Article[] {
  return ALL_OUTLETS.filter((o) => covers(o, item, facts))
    .map((outlet) => ({
      id: `${item.id}-${outlet.id}`,
      item,
      outlet,
      time: publishTime(outlet.cadence, item.time),
      journalist: byline(item, outlet, journalists, facts),
    }))
    .sort((a, b) => a.time - b.time);
}
