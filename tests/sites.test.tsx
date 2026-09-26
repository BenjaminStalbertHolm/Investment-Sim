import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadingDelay } from '../src/apps/browser/Browser';
import { PALETTES } from '../src/art/logo/options';
import { START_DAY } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import type { CompanyDetails, Directory } from '../src/sim/types';
import { CompanyPages, PAGES } from '../src/sites/company/CompanySite';
import { companySite, plural } from '../src/sites/company/content';
import { PRODUCT_KINDS } from '../src/sites/data/products';
import { THEMES } from '../src/sites/data/themes';
import { firmProfile } from '../src/sites/firm/FirmSite';
import { dailyStories, marketStats, weeklyStories } from '../src/sites/news/stories';
import { companyUrl, firmUrl, normalizeUrl, sites, slugOf, type Sites } from '../src/sites/urls';
import { INDUSTRIES } from '../src/world/industries';

let engine: Engine;
let directory: Directory;
let s: Sites;
const FIRM = 'Garage Capital';

beforeAll(() => {
  engine = Engine.newGame({ seed: 'websites', settings: DIFFICULTIES.medium, firmName: FIRM });
  directory = engine.directory();
  s = sites(directory, FIRM);
}, 60_000);

describe('web addresses (spec §14)', () => {
  it('gives every company and firm its own www.<slug>.com', () => {
    const hosts = [...s.company, ...s.firm, s.player];
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const host of hosts) expect(host).toMatch(/^www\.[a-z0-9]+\.com$/);
    s.company.forEach((host, id) => expect(s.byHost.get(host)).toEqual({ kind: 'company', id }));
    expect(companyUrl(s, 0)).toBe('http://www.mvidea.com/');
    expect(firmUrl(s, directory.firms.findIndex((f) => f.id === 'whiterock'))).toBe('http://www.whiterock.com/');
    expect(s.player).toBe('www.garagecapital.com');
  });

  it('turns company names into slugs', () => {
    expect(slugOf('Ridgepine Timber Co.')).toBe('ridgepinetimber');
    expect(slugOf('Alphabeta (Goggle)')).toBe('alphabeta');
    expect(slugOf('Clickzilla.com')).toBe('clickzilla');
    expect(slugOf('Moët Hennessy Louis Button')).toBe('moethennessylouisbutton');
    expect(slugOf('Hallvard & Birch')).toBe('hallvardbirch');
  });

  it('reads the address bar like Internet Explorer 4', () => {
    expect(normalizeUrl('mvidea.com')).toBe('http://www.mvidea.com/');
    expect(normalizeUrl('www.mvidea.com/investor.html')).toBe('http://www.mvidea.com/investor.html');
    expect(normalizeUrl('http://newswire.majorsoft.com')).toBe('http://newswire.majorsoft.com/');
    expect(normalizeUrl('logging stocks')).toBe('http://www.yeehaw.com/search?q=logging%20stocks');
    expect(normalizeUrl('MVDA')).toBe('http://www.yeehaw.com/search?q=MVDA');
  });

  it('takes the same dial-up time for the same page, and none when switched off', () => {
    expect(loadingDelay('http://www.mvidea.com/', 'short')).toBe(loadingDelay('http://www.mvidea.com/', 'short'));
    expect(loadingDelay('http://www.mvidea.com/', 'off')).toBe(0);
    for (const url of s.company.slice(0, 200)) {
      const ms = loadingDelay(url, 'authentic');
      expect(ms).toBeGreaterThanOrEqual(1500);
      expect(ms).toBeLessThan(4500);
    }
  });
});

describe('company websites (spec §14)', () => {
  it('generates a coherent site for each of the 10,000 companies, the same every time', () => {
    expect(engine.companies).toHaveLength(10_000);
    for (const c of engine.companies) {
      const site = companySite(c);
      const kinds = PRODUCT_KINDS[c.industry.id];
      expect(kinds, c.industry.id).toBeDefined();
      for (const p of site.products) {
        expect(kinds).toContain(p.kind);
        expect(c.industry.motifs).toContain(p.motif);
        expect(p.blurb).not.toMatch(/\{\w+\}/);
      }
      expect(THEMES[c.industry.id].tiles).toContain(site.tile);
      expect(site.logo.palette).toBe(PALETTES[c.genes.logoPalette]);
      for (const text of [site.slogan, site.welcome, ...site.history, ...site.bio, ...site.guestbook.map((g) => g.text)]) {
        expect(text, c.name).not.toMatch(/\{\w+\}|undefined|NaN/);
      }
    }
    // Pure: generating it again gives the same site.
    expect(companySite(engine.companies[4321])).toEqual(companySite(engine.companies[4321]));
  }, 60_000);

  it('has a theme and products for every industry', () => {
    for (const industry of INDUSTRIES) {
      expect(THEMES[industry.id], industry.id).toBeDefined();
      expect(PRODUCT_KINDS[industry.id]?.length, industry.id).toBeGreaterThanOrEqual(6);
    }
    expect(plural('Desktop PC')).toBe('Desktop PCs');
    expect(plural('Premium 2x4 Lumber')).toBe('Premium 2x4 Lumber');
    expect(plural('Pacemaker')).toBe('Pacemakers');
  });

  it('lets the guestbook hint at quality', () => {
    const share = (good: boolean) => {
      const group = engine.companies.filter((c) => (good ? c.quality > 0.8 : c.quality < 0.2));
      const entries = group.flatMap((c) => companySite(c).guestbook).filter((g) => g.tone !== 'neutral');
      return entries.filter((g) => g.tone === 'good').length / entries.length;
    };
    expect(share(true)).toBeGreaterThan(0.7);
    expect(share(false)).toBeLessThan(0.35);
  }, 60_000);

  it('renders every page instantly, with live stats and holders on the IR page', () => {
    const render = (id: number, page: string, details?: CompanyDetails) =>
      renderToString(
        <CompanyPages id={id} company={engine.companies[id]} page={page} directory={directory} sites={s} firmName={FIRM} live={{ details, held: 0, day: START_DAY }} />,
      );
    // Every company's home page, then all pages for every tenth company (all 5 pages with details for 10,000 take a minute).
    render(0, 'index.html');
    let start = performance.now();
    for (let id = 0; id < 10_000; id++) render(id, 'index.html');
    expect((performance.now() - start) / 10_000).toBeLessThan(10);
    const times: number[] = [];
    for (let id = 0; id < 10_000; id += 10) {
      const details = engine.details(id);
      for (const [page] of PAGES) {
        start = performance.now();
        const html = render(id, page, details);
        times.push(performance.now() - start);
        if (page === 'investor.html') {
          expect(html).toContain('Key Statistics');
          expect(html).toContain(engine.companies[id].genome);
          expect(html).toContain('Officers and directors');
          for (const h of details.holders) expect(html).toContain(directory.firms[h.firm].name.replace('&', '&amp;'));
          expect(html).toContain('Quarterly Results');
        }
      }
    }
    times.sort((a, b) => a - b);
    // A frame is 16 ms: a page renders well inside one.
    expect(times[Math.floor(times.length * 0.99)]).toBeLessThan(16);
  }, 120_000);
});

describe('market data for the web', () => {
  it('reports eight quarters, oldest first, and updates them as companies report', () => {
    const e = Engine.newGame({ seed: 'quarters', companyCount: 1000, settings: DIFFICULTIES.medium, firmName: FIRM });
    const before = e.details(7).quarters;
    expect(before).toHaveLength(8);
    before.slice(1).forEach((q, k) => expect(q.quarter).toBe(before[k].quarter + 1));
    // Before the game, the latest quarter is the third of 1997 (reported in October).
    expect(before.at(-1)!.quarter).toBe(1997 * 4 + 2);
    expect(before.every((q) => q.reported < START_DAY)).toBe(true);
    e.runSessions(50);
    const after = e.details(7).quarters;
    expect(after.at(-1)!.quarter).toBe(1997 * 4 + 3);
    expect(after.at(-1)!.reported).toBe(e.details(7).lastEarnings);
    expect(after.slice(0, 7)).toEqual(before.slice(1));
  }, 60_000);

  it('lists holders and firm books that agree with each other', () => {
    const f = directory.firms.findIndex((x) => x.strategy === 'index');
    const view = engine.firm(f);
    expect(view.holdings.length).toBeGreaterThan(100);
    expect(view.aum).toBeCloseTo(view.holdings.reduce((a, h) => a + h.value, 0), 0);
    const top = view.holdings[0];
    expect(engine.details(top.company).holders).toContainEqual({ firm: f, shares: top.shares });
    expect(view.history[0][0]).toBe(START_DAY);
    for (let i = 0; i < 10_000; i += 97) {
      const d = engine.details(i);
      expect(d.holders.reduce((a, h) => a + h.shares, 0) + d.insiderPct * d.shares).toBeLessThanOrEqual(d.shares * 0.951);
    }
  }, 60_000);

  it('writes the news from the market', () => {
    const e = Engine.newGame({ seed: 'news', companyCount: 1000, settings: DIFFICULTIES.medium, firmName: FIRM });
    e.runSessions(12);
    const table = e.table();
    const stats = marketStats(table);
    const session = { day: Math.floor(e.time / 1440), open: false, index: e.indexQuote() };
    const d = e.directory();
    const stories = dailyStories(table, stats, d, e.seed, session);
    expect(stories.map((x) => x.kind)).toContain('wrap');
    expect(dailyStories(table, stats, d, e.seed, session)).toEqual(stories);
    const weekly = weeklyStories(table, stats);
    expect(weekly.map((x) => x.kind)).toEqual(['week', 'picks']);
    for (const story of [...stories, ...weekly]) {
      expect(story.headline).not.toMatch(/undefined|NaN/);
      for (const text of story.paragraphs) {
        expect(text).not.toMatch(/undefined|NaN/);
        for (const [, id] of text.matchAll(/\{c:(\d+)\}/g)) expect(Number(id)).toBeLessThan(1000);
      }
    }
    expect(stats.sectors.reduce((a, x) => a + x.count, 0)).toBe(1000);
  }, 60_000);

  it('gives every firm a logo and invented leadership', () => {
    for (const firm of directory.firms) {
      const p = firmProfile(engine.seed, firm);
      expect(p.logo.palette).toBeDefined();
      expect(p.ceo).toMatch(/^\S+ \S+/);
      expect(firmProfile(engine.seed, firm)).toEqual(p);
    }
  });
});
