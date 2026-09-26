import { beforeAll, describe, expect, it } from 'vitest';
import { CLOSE, OPEN, START_DAY, at, dayOf, formatDate, nextTradingDay } from '../src/sim/calendar';
import { EVENT_TYPES } from '../src/sim/data/events';
import { MACRO_START } from '../src/sim/data/macro';
import { Engine } from '../src/sim/engine';
import { releasesOn } from '../src/sim/macro';
import { LISTING } from '../src/sim/market';
import type { NewsItem } from '../src/sim/news';
import { DIFFICULTIES } from '../src/sim/settings';
import { generateWorld, type World } from '../src/world/generator';

let world: World;
let year: Engine;
let news: NewsItem[];
beforeAll(() => {
  world = generateWorld({ seed: 'events', companyCount: 1000 });
  year = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Test' });
  year.runSessions(252);
  news = year.exportState().events.news;
}, 120_000);
const game = () => Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Test' });

describe('corporate events (spec §11.6–11.7)', () => {
  it('happen at a plausible rate, across most kinds', () => {
    const corporate = news.filter((n) => EVENT_TYPES.some((t) => t.kind === n.kind));
    // About 0.65 events per company a year (DECISIONS.md), give or take.
    expect(corporate.length).toBeGreaterThan(400);
    expect(corporate.length).toBeLessThan(1200);
    const kinds = new Set(corporate.map((n) => n.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(17);
  });

  it('move prices by the magnitudes of the table, scaled by size', () => {
    for (const n of news) {
      const type = EVENT_TYPES.find((t) => t.kind === n.kind);
      if (!type || n.kind === 'takeover' || n.move === undefined) continue;
      const [lo, hi] = type.move;
      const size = Math.abs(n.move);
      expect(size, `${n.kind} ${n.move}`).toBeGreaterThanOrEqual(n.kind === 'bankruptcy' ? lo : lo * 0.6 - 1e-9);
      const most = n.kind === 'bankruptcy' ? hi : Math.min(n.move < 0 ? 0.97 : Infinity, hi * 1.5);
      expect(size, `${n.kind} ${n.move}`).toBeLessThanOrEqual(most + 1e-9);
      if (type.sign) expect(Math.sign(n.move)).toBe(type.sign);
    }
    // Takeover bids jump to 70–95% of a 20–60% premium over the undisturbed price.
    for (const n of news.filter((x) => x.kind === 'takeover')) {
      const premium = n.level! / n.prev! - 1;
      expect(premium).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(premium).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(n.move! / premium).toBeGreaterThanOrEqual(0.7 - 1e-9);
      expect(n.move! / premium).toBeLessThanOrEqual(0.95 + 1e-9);
      expect(n.other ?? n.firm).toBeDefined();
    }
  });

  it('leak some stories as rumours first, and follow some up the next morning', () => {
    const leaked = news.filter((n) => n.rumour !== undefined);
    expect(leaked.length).toBeGreaterThan(20);
    const rumours = year.rumours(undefined, 10_000);
    for (const n of leaked) {
      expect(n.rumour!).toBeLessThan(n.time);
      expect(rumours.some((r) => r.company === n.company && r.time === n.rumour)).toBe(true);
    }
    const followed = news.filter((n) => n.follow !== undefined);
    expect(followed.length).toBeGreaterThan(20);
  });

  it('delists companies that are taken over or go bust, and replaces them in the MAJOR 500', () => {
    const state = year.exportState();
    const done = news.filter((n) => n.kind === 'takeoverDone');
    const bust = news.filter((n) => n.kind === 'bankruptcy');
    expect(done.length + bust.length).toBeGreaterThan(0);
    for (const n of done) expect(state.market.status[n.company]).toBe(LISTING.acquired);
    for (const n of bust) expect(state.market.status[n.company]).toBe(LISTING.bankrupt);
    const members = Array.from(state.market.index.members);
    expect(new Set(members).size).toBe(500);
    for (const i of members) expect(state.market.status[i]).toBe(0);
  });

  it('gives new chief executives when CEOs change', () => {
    const changes = news.filter((n) => n.kind === 'ceoChange');
    expect(changes.length).toBeGreaterThan(0);
    const last = changes.at(-1)!;
    const d = year.details(last.company);
    expect(d.ceoCode).toBeDefined();
    expect(d.ceo).not.toBe(`${world.companies[last.company].ceo.firstName} ${world.companies[last.company].ceo.lastName}`);
  });
});

describe('delisting (spec §11.6)', () => {
  it('pays out a takeover at the offer price and writes off a bankruptcy', () => {
    const e = game();
    const [a, b] = [120, 130];
    for (const company of [a, b]) e.placeOrder({ company, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    e.placeOrder({ company: a, side: 'sell', type: 'limit', shares: 50, limit: e.market.price[a] * 10, tif: 'gtc' });
    const index = e.indexQuote().last;
    const cost = e.positions().find((p) => p.company === b)!.cost;
    e.delist(a, LISTING.acquired, 12.5);
    e.delist(b, LISTING.bankrupt, e.market.price[b]);
    expect(e.indexQuote().last).toBeCloseTo(index, 2);
    expect(e.positions()).toHaveLength(0);
    expect(e.openOrders()).toHaveLength(0);
    const ledger = e.ledger();
    expect(ledger.find((l) => l.kind === 'acquisition')).toMatchObject({ company: a, shares: 100, amount: 1250 });
    expect(ledger.find((l) => l.kind === 'writeoff')).toMatchObject({ company: b, shares: 100, amount: 0 });
    expect(e.closedPositions().find((c) => c.company === b)!.realized).toBeCloseTo(-cost, 6);
    expect(e.mail().messages.filter((m) => m.kind === 'delisted')).toHaveLength(2);
    expect('error' in e.placeOrder({ company: a, side: 'buy', type: 'market', shares: 1, tif: 'day' })).toBe(true);
    const frozen = e.market.price[a];
    e.runSessions(2);
    expect(e.market.price[a]).toBe(frozen);
  });
});

describe('dividends (spec §15.2)', () => {
  it('pays a quarter of the annual dividend to holders on the report day', () => {
    const e = game();
    const f = e.exportState().fundamentals;
    const payer = world.companies.findIndex((_, i) => i >= 100 && f.dividend[i] > 0.5);
    const report = e.details(payer).nextEarnings;
    e.placeOrder({ company: payer, side: 'buy', type: 'market', shares: 200, tif: 'day' });
    const perShare = e.exportState().fundamentals.dividend[payer] / 4;
    e.advanceTo(at(report, OPEN + 5));
    const entry = e.ledger().find((l) => l.kind === 'dividend');
    expect(entry).toMatchObject({ company: payer, shares: 200 });
    // A dividend change may have come first; the amount is whatever the dividend was that morning.
    expect(entry!.amount).toBeGreaterThan(0);
    if (!news.some((n) => n.kind === 'dividendChange' && n.company === payer)) expect(entry!.amount).toBeCloseTo(200 * perShare, 6);
    expect(e.mail().messages.some((m) => m.kind === 'dividend')).toBe(true);
  });
});

describe('the economy (spec §11.4)', () => {
  it('releases on the calendar', () => {
    const on = (y: number, m: number, d: number) => releasesOn(Date.UTC(y, m - 1, d) / 86_400_000).map((r) => r.kind);
    expect(on(1998, 1, 2)).toContain('jobs'); // first Friday
    expect(on(1998, 1, 15)).toContain('cpi');
    expect(on(1998, 1, 20)).toContain('fed'); // third Tuesday
    expect(on(1998, 1, 27)).toContain('confidence'); // last Tuesday
    expect(on(1998, 1, 29)).toContain('gdp'); // last Thursday after a quarter
    expect(on(1998, 2, 18)).toEqual([]);
    let meetings = 0;
    for (let d = START_DAY; d < START_DAY + 365; d = nextTradingDay(d)) meetings += releasesOn(d).filter((r) => r.kind === 'fed').length;
    expect(meetings).toBe(8);
  });

  it('moves the policy rate in quarter points at Federal Reservoir meetings, and reports each release', () => {
    const macro = year.exportState().macro;
    expect(Math.round(macro.rate / 0.0025) * 0.0025).toBeCloseTo(macro.rate, 12);
    const feds = news.filter((n) => n.kind === 'fed');
    expect(feds).toHaveLength(8);
    for (const n of feds) expect(Math.abs(n.level! - n.prev!)).toBeLessThanOrEqual(0.005 + 1e-12);
    expect(news.filter((n) => n.kind === 'jobs')).toHaveLength(12);
    expect(news.filter((n) => n.kind === 'cpi').length).toBeGreaterThanOrEqual(11);
    expect(macro.inflation).not.toBe(MACRO_START.inflation);
    for (const n of feds) expect(formatDate(dayOf(n.time))).toMatch(/1998/);
  });

  it('keeps the market independent of the news reader: the archive only grows', () => {
    const e = game();
    e.runSessions(3);
    const before = e.newsCount;
    e.news({ limit: 5 });
    e.rumours();
    e.advanceTo(at(dayOf(e.time) + 1, CLOSE));
    expect(e.newsCount).toBeGreaterThanOrEqual(before);
  });
});
