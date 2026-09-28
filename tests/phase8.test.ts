import { beforeAll, describe, expect, it } from 'vitest';
import { CLOSE, OPEN, addTradingDays, at, dayOf, nextTradingDay } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { FUNDS, SECTOR_SIZE } from '../src/sim/data/funds';
import { plan } from '../src/sim/events';
import { investmentOffer, weeklyGovernance } from '../src/sim/governance';
import { monthlyAudit } from '../src/sim/regulator';
import { growthSeries, performance } from '../src/sim/scoring';
import { DIFFICULTIES, changeSettings, type GameSettings } from '../src/sim/settings';
import { generateWorld, type World } from '../src/world/generator';
import { writeLetter } from '../src/apps/mail/letters';
import { ALL_OUTLETS } from '../src/sim/data/outlets';
import type { NewsItem } from '../src/sim/news';
import { writeArticle } from '../src/sites/news/articles';

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'phase 8', companyCount: 1000 });
});
const game = (settings: GameSettings = DIFFICULTIES.medium) => Engine.create(world, { settings, firmName: 'Eight Capital' });
const balanced = (e: Engine) => {
  const a = e.account();
  expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 3);
};
const ok = <T,>(r: T | { error: string }): T => {
  if (r && typeof r === 'object' && 'error' in r) throw new Error(r.error);
  return r as T;
};
/** Every letter reads as a letter, with no template left unfilled. */
function checkLetters(e: Engine): void {
  const state = e.exportState();
  const ctx = {
    directory: e.directory(), firmName: e.firmName, ceoName: e.player.ceoName, seed: e.seed,
    clients: new Map(state.clients.clients.map((c) => [c.id, c])), news: new Map(state.events.news.map((n) => [n.id, n])),
  };
  for (const m of e.mail().messages) {
    const letter = writeLetter(m, ctx);
    expect(letter.body.length, m.kind).toBeGreaterThan(0);
    const blocks = letter.body.flatMap((b) => ('p' in b ? [b.p] : 'list' in b ? b.list : 'link' in b ? [b.link, b.url] : b.table.rows.flat()));
    const text = [letter.from, letter.to, letter.subject, ...blocks].join('\n').replace(/\{c:\d+\}/g, '');
    expect(text, `${m.kind}: ${text}`).not.toMatch(/\{\w+\}|undefined|NaN|Infinity|[[\]|]/);
  }
}

/** A listed company worth under `cap`, cheap enough to buy a large stake in. */
const small = (e: Engine, cap: number) =>
  world.companies.findIndex((_, i) => !e.market.state.status[i] && e.market.price[i] * e.model.shares[i] < cap && e.market.price[i] > 1);

describe('index funds (spec §11.5)', () => {
  it('launches MJR on the MAJOR 500 and a fund of the 50 largest companies of each industry', () => {
    const e = game();
    const view = e.funds();
    expect(view.list).toHaveLength(1 + 40);
    expect(view.list[0]).toMatchObject({ nav: 100, members: 500, fee: DIFFICULTIES.medium.fundFees.index });
    expect(new Set(FUNDS.map((f) => f.ticker)).size).toBe(FUNDS.length);
    for (const t of FUNDS.map((f) => f.ticker)) expect(world.companies.some((c) => c.ticker === t)).toBe(false);
    FUNDS.slice(1).forEach((spec, k) => {
      const f = k + 1;
      expect(view.list[f].nav).toBeCloseTo(25, 9);
      const members = e.s.funds.members[f];
      expect(members.length).toBeLessThanOrEqual(SECTOR_SIZE);
      expect(members.every((i) => e.model.sector[i] === spec.industry)).toBe(true);
      // The largest of the industry, by market value.
      const cap = (i: number) => e.market.price[i] * e.model.shares[i];
      const others = world.companies.map((_, i) => i).filter((i) => e.model.sector[i] === spec.industry && !members.includes(i));
      if (others.length) expect(Math.max(...others.map(cap))).toBeLessThanOrEqual(Math.min(...members.map(cap)));
    });
    const weights = e.fundHoldings(0);
    expect(weights[0].weight).toBeGreaterThan(weights[9].weight);
  });

  it('tracks the index’s total return less its fee, day by day', () => {
    const free = game(changeSettings(DIFFICULTIES.medium, { fundFees: { index: 0, sector: 0 } }));
    const dear = game(changeSettings(DIFFICULTIES.medium, { fundFees: { index: 0.02, sector: 0.05 } }));
    free.runSessions(80);
    dear.runSessions(80);
    const index = free.market.indexLevel / 1000;
    const mjr = free.fundPrice(0) / 100;
    // Dividends reinvested: a little ahead of the price index, never behind.
    expect(mjr).toBeGreaterThanOrEqual(index);
    expect(mjr / index).toBeLessThan(1.03);
    // The fee comes out every night: 2% a year over the calendar days.
    const days = Math.floor(free.time / 1440) - Math.floor(Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'x' }).time / 1440);
    expect(dear.fundPrice(0) / free.fundPrice(0)).toBeCloseTo((1 - 0.02 / 365) ** days, 3);
    expect(dear.fundPrice(5) / free.fundPrice(5)).toBeCloseTo((1 - 0.05 / 365) ** days, 3);
    expect(free.funds().list[0].prevClose).toBeGreaterThan(0);
    expect(free.bars(-100, '1Y').length).toBe(80);
  }, 60_000);

  it('buys and sells units at their value with the commission, keeping the books balanced', () => {
    const e = game();
    const nav = e.fundPrice(0);
    const bought = ok(e.tradeFund(0, 1000));
    expect(bought.price).toBeCloseTo(nav * (1 + 0.0003), 9);
    expect(e.account().cash).toBeCloseTo(2_500_000 - 1000 * bought.price - 19.95, 6);
    expect(e.account().fundsValue).toBeCloseTo(1000 * nav, 6);
    expect(e.funds().positions[0]).toMatchObject({ fund: 0, units: 1000 });
    e.runSessions(10);
    balanced(e);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), OPEN + 5));
    ok(e.tradeFund(0, -400));
    balanced(e);
    expect(e.tradeFund(0, -601)).toEqual({ error: 'You can sell at most 600 units.' });
    ok(e.tradeFund(0, -600));
    expect(e.funds().positions).toEqual([]);
    expect(e.closedPositions().some((c) => c.fund === 0)).toBe(true);
    expect(e.ledger().filter((l) => l.kind === 'fund')).toHaveLength(3);
    balanced(e);
    // The day's confirmations list fund trades too.
    e.runSessions(1);
    const digest = e.mail().messages.filter((m) => m.kind === 'digest').at(-1)!;
    expect(digest.lines?.some((l) => l.fund === 0)).toBe(true);
  });

  it('needs buying power, the market open, and no shorting', () => {
    const e = game();
    // Leverage is off: $2.5M buys about $2.5M of units and no more.
    expect(e.tradeFund(3, Math.ceil(2_600_000 / e.fundPrice(3)))).toEqual({ error: 'Insufficient buying power.' });
    ok(e.tradeFund(3, Math.floor(2_400_000 / e.fundPrice(3))));
    expect(e.tradeFund(3, -1_000_000)).toMatchObject({ error: expect.stringMatching(/at most/) });
    expect(e.tradeFund(4, -1)).toEqual({ error: 'You hold no units of this fund.' });
    e.advanceTo(at(dayOf(e.time), CLOSE + 1));
    expect(e.tradeFund(3, 1)).toEqual({ error: 'The funds trade while the market is open, from 09:30 to 16:00.' });
  });

  it('keeps a unit’s value when a member is taken over, and reinvests the cash at the close', () => {
    const e = game();
    const member = e.s.funds.members[0][250];
    const before = e.fundPrice(0);
    e.delist(member, 1, e.market.price[member]);
    expect(e.fundPrice(0)).toBeCloseTo(before, 9);
    expect(e.s.funds.cash[0]).toBeGreaterThan(0);
    e.runSessions(1);
    expect(e.s.funds.cash[0]).toBe(0);
    expect(e.s.funds.members[0]).toHaveLength(500);
    expect(e.s.funds.members[0]).not.toContain(member);
  });
});

describe('stakes and governance (spec §15.5–15.6)', () => {
  it('files a 5% stake, brings a board seat at 20% and control at 50%', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { maxLeverage: 4 }));
    const i = small(e, 8e6);
    expect(i).toBeGreaterThan(0);
    const buy = (pct: number) => {
      if (!e.trading) e.advanceTo(at(nextTradingDay(dayOf(e.time)), OPEN + 5));
      const shares = Math.ceil(pct * e.model.shares[i]) - Math.max(0, e.held(i));
      ok(e.placeOrder({ company: i, side: 'buy', type: 'market', shares, tif: 'day' }));
      e.advanceTo(at(dayOf(e.time), CLOSE));
    };
    buy(0.06);
    const kinds = () => e.mail().messages.map((m) => m.kind);
    expect(kinds()).toEqual(expect.arrayContaining(['stakeFiled', 'ceoLetter']));
    expect(e.sob().filings[0]).toMatchObject({ firm: -1, company: i });
    expect(e.news({ kinds: ['stake'] })[0]).toMatchObject({ company: i });
    expect(e.record().achievements.find((a) => a.id === 'filed')!.day).toBeDefined();
    e.runSessions(1);
    buy(0.21);
    const seat = e.mail().messages.find((m) => m.kind === 'boardSeat')!;
    expect(e.mailAction(seat.id, 'accept')).toBeUndefined();
    expect(e.details(i).seat).toBe(true);
    e.runSessions(1);
    buy(0.51);
    const control = e.mail().messages.find((m) => m.kind === 'control')!;
    const news = e.newsCount;
    expect(e.mailAction(control.id, 'replaceCeo')).toBeUndefined();
    expect(e.mailAction(control.id, 'cutDividend')).toBe('You have already answered this message.');
    e.runSessions(1);
    expect(e.news({ kinds: ['ceoChange'], company: i }).some((n) => n.id >= news)).toBe(true);
    expect(e.s.scoring.achievements.outright).toBeDefined();
    balanced(e);
    checkLetters(e);
  }, 60_000);

  it('lets the player vote down a takeover of a company it controls', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { maxLeverage: 4 }));
    const i = small(e, 8e6);
    ok(e.placeOrder({ company: i, side: 'buy', type: 'market', shares: Math.ceil(0.55 * e.model.shares[i]), tif: 'day' }));
    const day = dayOf(e.time);
    plan(e, 'takeover', i, at(day, OPEN + 60), 0.4, 0);
    e.advanceTo(at(day, OPEN + 65));
    const proxy = e.mail().messages.find((m) => m.kind === 'proxy' && m.company === i)!;
    expect(proxy.variant).toBe(2);
    expect(e.mailAction(proxy.id, 'against')).toBeUndefined();
    e.runSessions(70);
    expect(e.news({ kinds: ['takeoverFail'], company: i })).toHaveLength(1);
    expect(e.news({ kinds: ['takeoverDone'], company: i })).toHaveLength(0);
    expect(e.mail().messages.find((m) => m.kind === 'voteResult' && m.company === i)!.amount).toBeLessThan(0.5);
    expect(e.s.scoring.achievements.proxy).toBeDefined();
    checkLetters(e);
  }, 60_000);

  it('sells a filed stake to a competitor’s bid at its price', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { aggression: 'high' }));
    const i = small(e, 20e6);
    ok(e.placeOrder({ company: i, side: 'buy', type: 'market', shares: Math.ceil(0.06 * e.model.shares[i]), tif: 'day' }));
    e.advanceTo(at(dayOf(e.time), CLOSE));
    for (let k = 0; k < 400 && !e.mail().messages.some((m) => m.kind === 'stakeBid'); k++) weeklyGovernance(e, dayOf(e.time));
    const bid = e.mail().messages.find((m) => m.kind === 'stakeBid')!;
    expect(bid.shares).toBe(e.held(i));
    const cash = e.account().cash;
    const firmBefore = e.s.world.holdings.find((h) => h.company === i && h.firm === bid.firm)?.shares ?? 0;
    expect(e.mailAction(bid.id, 'accept')).toBeUndefined();
    expect(e.held(i)).toBe(0);
    expect(e.account().cash).toBeCloseTo(cash + bid.amount! - 19.95, 4);
    expect(e.s.world.holdings.find((h) => h.company === i && h.firm === bid.firm)!.shares).toBe(firmBefore + bid.shares!);
    balanced(e);
  }, 60_000);

  it('takes a strategic investment for a share of future fees', () => {
    const e = game();
    e.s.clients.reputation = 50;
    investmentOffer(e, e.s.governance.nextInvestment);
    const offer = e.mail().messages.find((m) => m.kind === 'investmentOffer')!;
    const { cash, deposits } = e.account();
    expect(e.mailAction(offer.id, 'accept')).toBeUndefined();
    expect(e.account().cash).toBeCloseTo(cash + offer.amount!, 6);
    expect(e.account().deposits).toBeCloseTo(deposits + offer.amount!, 6);
    expect(e.clients().firmCapital).toBeCloseTo(offer.amount!, 3);
    e.runSessions(5);
    const paid = e.ledger().filter((l) => l.kind === 'feeShare');
    expect(paid.length).toBeGreaterThanOrEqual(5);
    // The investor's share of each day's fees.
    const fees = e.clients().feesEarned;
    expect(-paid.reduce((a, l) => a + l.amount, 0)).toBeCloseTo(fees * offer.rate!, 3);
    balanced(e);
  }, 60_000);
});

describe('heat and the SOB (spec §16B)', () => {
  it('turns trading on a genuine tip into evidence and heat, and cools week by week', () => {
    const e = game();
    const i = small(e, 2e9);
    const day = nextTradingDay(dayOf(e.time));
    const p = plan(e, 'approval', i, at(day, OPEN + 30), 0.4, 0);
    e.s.mail.tips.push({ id: 99, company: i, truth: 'genuine', claim: 'approval', direction: 1, plan: p.id, until: p.time });
    ok(e.placeOrder({ company: i, side: 'buy', type: 'market', shares: Math.floor(1_000_000 / e.market.price[i]), tif: 'day' }));
    e.advanceTo(at(day, OPEN + 40));
    const r = e.sob();
    expect(e.s.regulator.evidence[0]).toMatchObject({ company: i, kind: 'insider' });
    expect(r.heat).toBeGreaterThanOrEqual(10);
    expect(e.sobStatus().peak).toBe(r.heat);
    e.runSessions(15);
    expect(e.sob().heat).toBeLessThan(r.heat);
  }, 60_000);

  it('audits a hot firm and fines it, collecting the fine five trading days later', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { scrutiny: 'high', startingCapital: 20_000_000 }));
    const r = e.s.regulator;
    r.heat = 100;
    for (let k = 0; k < 4; k++) r.evidence.push({ time: e.time, company: k, kind: 'insider', gain: 400_000 });
    for (let k = 0; k < 50 && !r.audit; k++) monthlyAudit(e, dayOf(e.time));
    expect(e.mail().messages.some((m) => m.kind === 'audit')).toBe(true);
    const worth = e.netWorth();
    e.runSessions(11);
    const outcome = e.mail().messages.find((m) => m.kind === 'sobOutcome')!;
    expect(['fine', 'suspension', 'freeze', 'enforcement']).toContain(outcome.outcome);
    expect(outcome.amount).toBeGreaterThan(400_000);
    expect(e.sob().record).toHaveLength(1);
    expect(r.evidence.every((x) => x.audited)).toBe(true);
    expect(e.loans().factors.sob).toBeLessThan(0);
    balanced(e);
    e.runSessions(6);
    expect(e.mail().messages.some((m) => m.kind === 'finePaid')).toBe(true);
    expect(e.ledger().some((l) => l.kind === 'sobFine' && -l.amount === outcome.amount)).toBe(true);
    expect(e.netWorth()).toBeLessThan(worth - outcome.amount! + 50_000);
    balanced(e);
    checkLetters(e);
  }, 60_000);

  it('makes a fine the firm cannot pay, even after selling everything, a bankruptcy', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { startingCapital: 200_000 }));
    ok(e.tradeFund(0, 1000));
    const r = e.s.regulator;
    r.heat = 100;
    for (let k = 0; k < 6; k++) r.evidence.push({ time: e.time, company: k, kind: 'insider', gain: 2_000_000 });
    for (let k = 0; k < 50 && !r.audit; k++) monthlyAudit(e, dayOf(e.time));
    e.runSessions(20);
    expect(e.bankrupt).toBe(true);
    expect(e.bankruptcy()!.cause).toBe('fine');
    expect(e.funds().positions).toEqual([]);
    checkLetters(e);
  }, 60_000);

  it('suspends a firm to closing orders only', () => {
    const e = game();
    ok(e.placeOrder({ company: 0, side: 'buy', type: 'market', shares: 100, tif: 'day' }));
    e.s.regulator.suspended = addTradingDays(dayOf(e.time), 5);
    expect(e.placeOrder({ company: 0, side: 'buy', type: 'market', shares: 100, tif: 'day' })).toMatchObject({ error: expect.stringMatching(/suspended/) });
    expect(e.tradeFund(0, 10)).toMatchObject({ error: expect.stringMatching(/suspended/) });
    ok(e.placeOrder({ company: 0, side: 'sell', type: 'market', shares: 100, tif: 'day' }));
    e.s.regulator.frozen = e.s.regulator.suspended;
    expect(e.takeLoan(50_000, 'amortising', 12)).toMatchObject({ error: expect.stringMatching(/frozen/) });
  });
});

describe('the firm in the news (spec §14.1)', () => {
  it('writes stake filings, league tables and enforcement actions in every outlet that runs them', () => {
    const e = game();
    const directory = e.directory();
    const items: NewsItem[] = [
      { id: 1, kind: 'stake', time: e.time, company: 7, level: 0.063 },
      { id: 2, kind: 'league', time: e.time, company: -1, level: 12, amount: 17, prev: 1998, move: -0.04, expect: 0.61, firm: 3 },
      { id: 3, kind: 'league', time: e.time, company: -1, level: 1, amount: 17, prev: 1999, move: 0.4, expect: 0.4 },
      { id: 4, kind: 'enforcement', time: e.time, company: -1, amount: 1_250_000 },
    ];
    for (const n of items) {
      for (const outlet of ALL_OUTLETS) {
        const a = writeArticle(n, outlet.id, directory, 'Eight Capital', e.seed, e.journalists());
        const text = [a.headline, a.byline, ...a.paragraphs].join('\n').replace(/\{c:\d+\}/g, '');
        expect(text, `${n.kind} in ${outlet.id}: ${text}`).not.toMatch(/\{\w+\}|undefined|NaN|[[\]|]/);
      }
    }
    expect(writeArticle(items[1], 'barrens', directory, 'Eight Capital', e.seed, []).paragraphs[0]).toContain('12th');
  });
});

describe('the firm’s record (spec §16)', () => {
  it('measures returns time-weighted, so client money in and out is not performance', () => {
    const e = game();
    ok(e.tradeFund(0, 20_000));
    for (let s = 0; s < 60; s++) {
      e.runSessions(1);
      const offer = e.mail().messages.find((m) => m.kind === 'offer' && !m.answer);
      if (offer) e.mailAction(offer.id, 'accept');
      // New clients' money goes into MJR too, the next morning, so the book stays in the fund whatever it grows to.
      e.advanceTo(at(nextTradingDay(dayOf(e.time)), OPEN + 30));
      const units = Math.floor((0.97 * e.account().cash) / e.fundPrice(0));
      if (units > 0) ok(e.tradeFund(0, units));
    }
    expect(e.ledger().filter((l) => l.kind === 'deposit').length).toBeGreaterThan(1);
    const state = e.exportState();
    // Rebuilt from the closes and the ledger (a save from before Phase 8), the series is the same before the first deposit.
    const rebuilt = growthSeries(state.stats, state.account.ledger);
    const first = state.stats.findIndex(([day]) => state.account.ledger.some((l, k) => k && l.kind === 'deposit' && dayOf(l.time) === day));
    for (let k = 0; k < first; k++) expect(rebuilt[k]).toBeCloseTo(state.scoring.growth[k], 9);
    const p = performance(state.stats, state.scoring.growth, dayOf(e.time));
    // Most of the money sits in MJR: the firm's return is close to the fund's, whatever the deposits did to net worth.
    expect(Math.abs(1 + p.total - e.fundPrice(0) / 100)).toBeLessThan(0.05);
    expect(p.maxDrawdown).toBeGreaterThanOrEqual(p.drawdown);
    expect(p.years).toHaveLength(1);
    const record = e.record();
    expect(record.achievements.find((a) => a.id === 'fund')!.day).toBeDefined();
    expect(record.achievements.find((a) => a.id === 'mandate')!.day).toBeDefined();
  }, 60_000);
});
