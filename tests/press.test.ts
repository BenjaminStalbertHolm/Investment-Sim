import { beforeAll, describe, expect, it } from 'vitest';
import { DAY_MINUTES, OPEN, START_DAY, at, weekday } from '../src/sim/calendar';
import { ALL_OUTLETS, OUTLET } from '../src/sim/data/outlets';
import { EVENT_TYPES } from '../src/sim/data/events';
import { Engine } from '../src/sim/engine';
import { COMMODITY_KINDS, MACRO_KINDS, type NewsItem, type NewsKind } from '../src/sim/news';
import { HAZARDS } from '../src/sim/data/commodities';
import { coverage, hireJournalists, publishTime } from '../src/sim/press';
import { DIFFICULTIES } from '../src/sim/settings';
import type { Directory } from '../src/sim/types';
import { encodeCeo, randomCeo } from '../src/world/ceo';
import { Rng } from '../src/world/rng';
import * as ARTICLES from '../src/sites/data/articles';
import * as LETTERS from '../src/apps/mail/data';
import { factsOf, writeArticle } from '../src/sites/news/articles';

let directory: Directory;
let engine: Engine;
beforeAll(() => {
  engine = Engine.newGame({ seed: 'press', settings: DIFFICULTIES.medium, firmName: 'Garage Capital', companyCount: 1000 });
  directory = engine.directory();
}, 60_000);

const NOON = at(START_DAY + 1, 12 * 60);
const ceo = () => encodeCeo(randomCeo(Rng.stream('press test', 'ceo')));

/** A news item of any kind with every fact its articles might use. */
function item(kind: NewsKind, company: number, move = 0.12, id = 7): NewsItem {
  const macro = (MACRO_KINDS as readonly string[]).includes(kind);
  return {
    id, kind, time: NOON, company: macro || kind === 'firmQuarter' || kind === 'mandate' ? -1 : company, move,
    follow: -0.03, rumour: NOON - 2 * DAY_MINUTES, firm: 0, other: 1, amount: 4.2e8,
    level: kind === 'fed' ? 0.0525 : kind === 'confidence' ? 131.2 : kind === 'activist' ? 0.071 : kind === 'dividendChange' ? 1.2 : 0.047,
    prev: kind === 'fed' ? 0.055 : kind === 'confidence' ? 128 : kind === 'dividendChange' ? 1 : 0.045,
    expect: 0.046, ceo: ceo(), prevCeo: ceo(), text: 'Lumberton Mills Pension Fund',
  };
}

const KINDS: NewsKind[] = [
  ...EVENT_TYPES.map((t) => t.kind), ...MACRO_KINDS, 'earnings', 'takeoverDone', 'takeoverFail', 'tvPick', 'fowlPick', 'firmQuarter', 'mandate',
];

describe('news articles (spec §14.1)', () => {
  it('writes every kind of story in every outlet’s voice, with nothing left unfilled', () => {
    const journalists = engine.journalists();
    let written = 0;
    for (const kind of KINDS) {
      for (const move of [0.12, -0.3]) {
        const n = item(kind, 5, move);
        for (const outlet of ALL_OUTLETS.slice(0, 10)) {
          const a = writeArticle(n, outlet.id, directory, 'Garage Capital', 'press', journalists);
          const text = [a.headline, a.byline, ...a.paragraphs].join('\n').replace(/\{c:\d+\}/g, '');
          expect(text, `${kind} in ${outlet.id}: ${text}`).not.toMatch(/\{\w+\}|undefined|NaN|[[\]|]/);
          expect(a.headline.length).toBeGreaterThan(5);
          expect(a.paragraphs.length).toBeGreaterThan(0);
          written++;
        }
      }
    }
    expect(written).toBe(KINDS.length * 20);
  });

  it('keeps every template well formed: [choices] closed, one template per list entry', () => {
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(ARTICLES);
    walk(LETTERS);
    expect(strings.length).toBeGreaterThan(300);
    for (const t of strings) {
      let depth = 0;
      for (const ch of t) {
        if (ch === '[') depth++;
        if (ch === ']') depth--;
        expect(depth, t).toBeGreaterThanOrEqual(0);
        expect(depth, t).toBeLessThanOrEqual(1);
        if (ch === '|') expect(depth, `a stray | in: ${t}`).toBe(1);
      }
      expect(depth, t).toBe(0);
    }
  });

  it('writes every weather and OPEK story, whichever way it went, with nothing left unfilled (Phase 7)', () => {
    const journalists = engine.journalists();
    const stories: NewsItem[] = [];
    for (const kind of COMMODITY_KINDS) {
      const texts = kind === 'opek' || kind === 'opekHint' ? ['cut', 'hold', 'raise'] : HAZARDS.map((h) => h.id);
      for (const text of texts) {
        for (const move of [0.12, -0.08]) {
          const hazard = HAZARDS.find((h) => h.id === text);
          const commodity = hazard ? hazard.moves[0][0] : 'CL';
          stories.push({ id: stories.length, kind, time: NOON, company: -1, commodity, move, expect: move, text, level: START_DAY + 3, prev: START_DAY });
        }
      }
    }
    for (const n of stories) {
      const outlets = coverage(n, journalists).map((a) => a.outlet);
      expect(outlets.map((o) => o.id), n.kind).toContain('newswire');
      for (const outlet of outlets) {
        const a = writeArticle(n, outlet.id, directory, 'Garage Capital', 'press', journalists);
        const text = [a.headline, a.byline, ...a.paragraphs].join('\n');
        expect(text, `${n.kind} ${n.text} in ${outlet.id}: ${text}`).not.toMatch(/\{\w+\}|undefined|NaN|[[\]|]|Raging Bear/);
      }
    }
    // The trade papers of the industries a commodity moves cover its weather: the Harvest Herald has corn's drought.
    const drought = stories.find((n) => n.kind === 'weather' && n.text === 'cornDrought')!;
    expect(coverage(drought, journalists).map((a) => a.outlet.id)).toEqual(expect.arrayContaining(['newswire', 'ftimez', 'trade-agriculture']));
    const opek = stories.find((n) => n.kind === 'opek')!;
    expect(coverage(opek, journalists).map((a) => a.outlet.id)).toEqual(expect.arrayContaining(['moneytv', 'jottings', 'trade-oilGas', 'trade-airlines', 'trade-refining']));
  });

  it('writes the same article every time', () => {
    const n = item('scandal', 12, -0.2);
    const once = writeArticle(n, 'jottings', directory, 'Garage Capital', 'press', []);
    expect(writeArticle(n, 'jottings', directory, 'Garage Capital', 'press', [])).toEqual(once);
  });
});

describe('the publication cascade (spec §11.7)', () => {
  it('breaks on the Newswire, then TV, the trade press, the morning papers and the weekend magazine', () => {
    const journalists = engine.journalists();
    const big = 0; // Mvidea, the largest company
    const articles = coverage(item('takeover', big, 0.3), journalists, factsOf(directory, big));
    const at = (id: string) => articles.find((a) => a.outlet.id === id)?.time;
    expect(at('newswire')).toBe(NOON);
    expect(at('moneytv')).toBe(NOON + 5);
    expect(at('trade-semiconductors')).toBe(NOON + 60);
    expect(at('jottings')).toBe((START_DAY + 2) * DAY_MINUTES + 6 * 60);
    const saturday = at('barrens')!;
    expect(weekday(Math.floor(saturday / DAY_MINUTES))).toBe(6);
    expect(articles.map((a) => a.time)).toEqual([...articles.map((a) => a.time)].sort((x, y) => x - y));
    for (const a of articles) if (a.outlet.id !== 'barrens') expect(a.journalist?.outlet).toBe(a.outlet.id);
  });

  it('covers small companies only on the wire and in the trade press', () => {
    const small = directory.names.findIndex((_, i) => i > 900 && factsOf(directory, i)!.cap < 50e6 && factsOf(directory, i)!.cap > 0);
    const outlets = coverage(item('contract', small, 0.05), engine.journalists(), factsOf(directory, small)).map((a) => a.outlet.id);
    expect(outlets).toEqual(['newswire']);
    const macro = coverage(item('fed', -1, 0.5), engine.journalists()).map((a) => a.outlet.id);
    expect(macro).toEqual(expect.arrayContaining(['newswire', 'moneytv', 'jottings', 'ftimez', 'nyjournal']));
    expect(publishTime('weekly', at(START_DAY, OPEN)) % DAY_MINUTES).toBe(8 * 60);
  });

  it('staffs every outlet with named writers who have beats', () => {
    const staff = hireJournalists('press');
    expect(staff).toEqual(engine.journalists());
    for (const outlet of ALL_OUTLETS) expect(staff.filter((j) => j.outlet === outlet.id)).toHaveLength(outlet.staff);
    expect(new Set(staff.map((j) => j.name)).size).toBe(staff.length);
    for (const j of staff) {
      expect(j.integrity).toBeGreaterThanOrEqual(OUTLET[j.outlet].integrity[0]);
      expect(j.integrity).toBeLessThanOrEqual(OUTLET[j.outlet].integrity[1]);
    }
    // The tabloid is cheaper to bribe than the Journal (spec §14.1).
    const mean = (id: string) => staff.filter((j) => j.outlet === id).reduce((a, j) => a + j.integrity, 0) / OUTLET[id].staff;
    expect(mean('dailyscoop')).toBeLessThan(mean('nyjournal'));
  });
});
