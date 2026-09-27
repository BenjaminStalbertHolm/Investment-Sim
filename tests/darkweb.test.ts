import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeLetter } from '../src/apps/mail/letters';
import { CLOSE, OPEN, addTradingDays, at, dayOf, nextTradingDay, previousTradingDay } from '../src/sim/calendar';
import { newDarkWeb, shellFound, weeklyDarkWeb, type DarkRequest, type Terms } from '../src/sim/darkweb';
import { CELLAR, MARKETS, SERVICES, SHARK_WEEKLY, type ServiceId } from '../src/sim/data/darkweb';
import { OUTLET } from '../src/sim/data/outlets';
import { Engine, type SimState } from '../src/sim/engine';
import { endsWeek } from '../src/sim/history';
import { coverage } from '../src/sim/press';
import { DIFFICULTIES, changeSettings, type GameSettings } from '../src/sim/settings';
import { cellarPosts, MarketPage } from '../src/sites/darkweb/DarkWeb';
import { stateTerms } from '../src/sites/darkweb/terms';
import { writeArticle } from '../src/sites/news/articles';
import { PageContext } from '../src/sites/web';
import { useGame } from '../src/state/game';
import { SAVE_VERSION } from '../src/state/migrations';
import { SAVE_FORMAT, packSave, unpackSave } from '../src/state/saveFile';
import { migrate } from '../src/state/migrations';
import { generateWorld, type World } from '../src/world/generator';
import { difference } from './util';

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'phase 9', companyCount: 1000 });
});
const game = (settings: GameSettings = DIFFICULTIES.medium) => Engine.create(world, { settings, firmName: 'Nine Capital' });
const balanced = (e: Engine) => {
  const a = e.account();
  expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 3);
};
const ok = <T,>(r: T | { error: string }): T => {
  if (r && typeof r === 'object' && 'error' in r) throw new Error(r.error);
  return r as T;
};
/** An honest vendor of a service (outcomes come from the dice, not the vendor's nature). */
const honest = (e: Engine, service: ServiceId) => {
  const market = SERVICES.find((s) => s.id === service)!.market;
  return e.s.darkweb.vendors.find((v) => v.market === market && v.left === undefined && v.nature === 'honest')!.id;
};
/** Buys on the quoted terms. */
const buy = (e: Engine, request: DarkRequest) => ok(e.darkBuy(request, ok(e.darkQuote(request)))).purchase;
const journalistAt = (e: Engine, outlet: string) => e.s.journalists.find((j) => j.outlet === outlet)!.id;
/** A listed company worth under `cap`. */
const small = (e: Engine, cap: number) => world.companies.findIndex((_, i) => !e.market.state.status[i] && e.market.price[i] * e.model.shares[i] < cap && e.market.price[i] > 1);
const noPlaceholders = (text: string) => expect(text).not.toMatch(/\{\w+\}|undefined|NaN|Infinity|[[\]|]/);
const saveAndLoad = (e: Engine) =>
  Engine.restore(
    migrate(unpackSave(packSave({ manifest: { format: SAVE_FORMAT, version: SAVE_VERSION, name: 't', firmName: 't', gameTime: 0, netWorth: 0, savedAt: 0 }, sim: e.exportState() })))
      .sim as SimState,
  );

describe('the dark web (spec §14A)', () => {
  it('shows every listing’s price, success chance, failure outcome and heat before purchase', () => {
    const e = game();
    e.runSessions(3);
    const view = e.darkweb();
    const directory = e.directory();
    const journalists = e.journalists();
    // Every market trades, and every vendor lists every service of its market with its terms.
    for (const m of MARKETS) expect(view.vendors.filter((v) => v.market === m.id && v.left === undefined)).toHaveLength(m.vendors);
    expect(view.listings).toHaveLength(MARKETS.reduce((a, m) => a + m.vendors * SERVICES.filter((s) => s.market === m.id).length, 0));
    for (const l of view.listings) {
      expect(l.error, `${l.service}: ${l.error}`).toBeUndefined();
      const t = l.terms!;
      expect(t.price).toBeGreaterThanOrEqual(0);
      expect(t.chance).toBeGreaterThan(0);
      expect(t.chance).toBeLessThanOrEqual(1);
      expect(t.heat + t.failHeat).toBeGreaterThanOrEqual(0);
      const stated = stateTerms(l.request, t, directory, journalists);
      for (const text of Object.values(stated)) {
        expect(text.length).toBeGreaterThan(2);
        noPlaceholders(text);
      }
      expect(stated.chance).toMatch(/^\d+%$|^Always$/);
      expect(stated.price).toMatch(/\$\d/);
    }
    // And the market pages show them, before anything is bought. (Rendered on the server, the page sees the store's
    // initial state: no names, which the page then says as "the company" and "the firm".)
    const blank = useGame.getInitialState().directory;
    for (const market of MARKETS) {
      const html = renderToString(
        createElement(
          PageContext.Provider,
          { value: { url: new URL(`http://${market.host}/`), navigate: () => undefined, status: () => undefined, setTitle: () => undefined, garlic: true } },
          createElement(MarketPage, { market, view }),
        ),
      ).replace(/<!-- -->/g, '');
      for (const l of view.listings.filter((x) => SERVICES.find((s) => s.id === x.service)!.market === market.id)) {
        const stated = stateTerms(l.request, l.terms!, blank, []);
        for (const text of [stated.price, stated.chance, stated.failure, stated.heat]) expect(html, `${market.id} ${l.service}`).toContain(escape(text));
      }
    }
  });

  it('decides an outcome when it is bought, from the saved stream: reloading does not re-roll it', () => {
    const e = game();
    e.runSessions(2);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    const before = saveAndLoad(e);
    const requests: DarkRequest[] = [
      { service: 'puffFirm', vendor: honest(e, 'puffFirm'), journalist: journalistAt(e, 'moneytv') },
      { service: 'botHype', vendor: honest(e, 'botHype'), company: small(e, 1e9) },
      { service: 'rumour', vendor: honest(e, 'rumour'), company: 5 },
      { service: 'spyHoldings', vendor: honest(e, 'spyHoldings'), firm: 1 },
      { service: 'deface', vendor: honest(e, 'deface'), company: 7 },
    ];
    const outcomes = requests.map((r) => buy(e, r)).map((p) => e.s.darkweb.purchases.find((x) => x.id === p.id)!.outcome);
    // Loaded from before the purchases, the same purchases come out the same way.
    const again = requests.map((r) => buy(before, r)).map((p) => before.s.darkweb.purchases.find((x) => x.id === p.id)!.outcome);
    expect(again).toEqual(outcomes);
    // Saved with the outcomes pending, they land the same as in a game that was never saved.
    const loaded = saveAndLoad(e);
    expect(e.darkweb().purchases.every((p) => p.result === undefined)).toBe(true);
    e.runSessions(6);
    loaded.runSessions(6);
    expect(difference(loaded.exportState(), e.exportState())).toBeUndefined();
    expect(e.darkweb().purchases.every((p) => p.result !== undefined)).toBe(true);
    balanced(e);
  });

  it('prices and odds bribes by the outlet and the journalist, and runs a bought article only where it was bought', () => {
    const e = game();
    e.runSessions(1);
    const vendor = honest(e, 'puffStock');
    const terms = (outlet: string) =>
      e.s.journalists.filter((j) => j.outlet === outlet).map((j) => ok(e.darkQuote({ service: 'puffStock', vendor, journalist: j.id, company: 3 })) as Terms);
    const scoop = terms('dailyscoop');
    const journal = terms('nyjournal');
    // Spec §14A: about 85% at a tabloid, about 35% at the New York Journal; $15k to $500k.
    for (const t of scoop) expect(t.chance).toBeGreaterThan(0.7);
    for (const t of journal) expect(t.chance).toBeLessThan(0.45);
    expect(Math.max(...scoop.map((t) => t.price))).toBeLessThan(25_000);
    expect(Math.min(...journal.map((t) => t.price))).toBeGreaterThan(400_000);
    // Heat makes everyone nervous.
    e.s.regulator.heat = 60;
    expect((ok(e.darkQuote({ service: 'puffStock', vendor, journalist: e.s.journalists.find((j) => j.outlet === 'dailyscoop')!.id, company: 3 })) as Terms).chance).toBeLessThan(scoop[0].chance);
    e.s.regulator.heat = 0;

    // A success: the article runs in the journalist's paper alone, and the price rises.
    const writer = e.s.journalists.find((j) => j.outlet === 'wyred')!;
    const p = buy(e, { service: 'puffStock', vendor, journalist: writer.id, company: 3 });
    e.s.darkweb.purchases.find((x) => x.id === p.id)!.outcome = 'success';
    const price = e.market.price[3];
    e.runSessions(2);
    const puff = e.s.events.news.find((n) => n.kind === 'puff')!;
    expect(puff).toMatchObject({ company: 3, outlets: ['wyred'], journalist: writer.id });
    const articles = coverage(puff, e.s.journalists);
    expect(articles.map((a) => a.outlet.id)).toEqual(['wyred']);
    expect(articles[0].journalist?.id).toBe(writer.id);
    const text = writeArticle(puff, 'wyred', e.directory(), e.firmName, e.seed, e.s.journalists);
    noPlaceholders([text.headline, ...text.paragraphs].join('\n').replace(/\{c:\d+\}/g, ''));
    expect(e.s.darkweb.bribed).toEqual([{ journalist: writer.id, bribes: 1, last: p.terms.price }]);
    expect(e.market.price[3]).not.toBe(price);
    // The same journalist is cheaper and likelier the second time.
    const repeat = ok(e.darkQuote({ service: 'puffStock', vendor, journalist: writer.id, company: 3 })) as Terms;
    expect(repeat.price).toBeLessThan(p.terms.price);
    expect(repeat.chance).toBeGreaterThanOrEqual(p.terms.chance);
    balanced(e);
  });

  it('turns a failed bribe into an exposé naming the firm, with its reputation, heat and clients at stake', () => {
    const e = game();
    e.runSessions(1);
    const writer = e.s.journalists.find((j) => j.outlet === 'nyjournal')!;
    const reputation = e.s.clients.reputation;
    const p = buy(e, { service: 'hitFirm', vendor: honest(e, 'hitFirm'), journalist: writer.id, firm: 2 });
    e.s.darkweb.purchases.find((x) => x.id === p.id)!.outcome = 'failure';
    const heat = e.s.regulator.heat;
    e.runSessions(2);
    const expose = e.s.events.news.find((n) => n.kind === 'expose')!;
    expect(expose).toMatchObject({ text: 'bribe', journalist: writer.id });
    expect(expose.outlets).toEqual(['nyjournal', 'newswire', 'dailyscoop']);
    expect(e.s.clients.reputation).toBeLessThanOrEqual(Math.max(0, reputation - p.terms.reputation!) + 1);
    expect(e.s.regulator.heat).toBeGreaterThan(heat + p.terms.failHeat - 2);
    // The competitor sued.
    expect(e.s.account.ledger.some((l) => l.kind === 'lawsuit' && Math.abs(l.amount) === p.terms.damages)).toBe(true);
    for (const outlet of expose.outlets!) {
      const text = writeArticle(expose, outlet, e.directory(), e.firmName, e.seed, e.s.journalists);
      expect(text.headline + text.paragraphs.join(' ')).toContain('Nine Capital');
      noPlaceholders([text.headline, ...text.paragraphs].join('\n'));
    }
    const nyj = writeArticle(expose, 'nyjournal', e.directory(), e.firmName, e.seed, e.s.journalists);
    expect(nyj.byline).toBe(`By ${writer.name}`);
    balanced(e);
  });

  it('has exit scams and SOB stings, whose ratings and account age give them away more often than not', () => {
    const e = game();
    e.runSessions(1);
    const vendors = e.s.darkweb.vendors;
    const scammer = vendors.find((v) => v.market === 'bots')!;
    const sting = vendors.find((v) => v.market === 'rumours')!;
    scammer.nature = 'scam';
    sting.nature = 'sting';
    const cash = e.s.account.cash;
    const a = buy(e, { service: 'botFud', vendor: scammer.id, company: small(e, 1e9) });
    const b = buy(e, { service: 'rumour', vendor: sting.id, company: 9 });
    expect(e.s.account.cash).toBeCloseTo(cash - a.terms.price - b.terms.price, 6);
    e.runSessions(1);
    const view = e.darkweb();
    expect(view.purchases.map((p) => p.result)).toEqual(['sting', 'scam']);
    // The scammer is gone, a new vendor has taken its stall, and The Cellar warns everyone.
    expect(scammer.left).toBeDefined();
    expect(view.vendors.filter((v) => v.market === 'bots' && v.left === undefined)).toHaveLength(2);
    expect(view.cellar.map((c) => c.kind)).toEqual(expect.arrayContaining(['scam', 'sting']));
    // The sting: evidence, heat and an examination.
    expect(e.s.regulator.evidence.some((x) => x.kind === 'sting')).toBe(true);
    expect(e.s.regulator.heat).toBeGreaterThanOrEqual(35);
    expect(e.s.regulator.audit).toBeDefined();
    const kinds = e.mail().messages.map((m) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(['darkweb', 'audit']));
    // Over many worlds, honest vendors have older accounts and more reviews.
    const all = Array.from({ length: 40 }, (_, k) => newDarkWeb(`seed ${k}`, 10_000).vendors).flat();
    const mean = (nature: string, f: (v: (typeof all)[number]) => number) => {
      const xs = all.filter((v) => v.nature === nature).map(f);
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    };
    for (const bad of ['scam', 'sting']) {
      expect(mean('honest', (v) => 10_000 - v.joined)).toBeGreaterThan(2 * mean(bad, (v) => 10_000 - v.joined));
      expect(mean('honest', (v) => v.reviews)).toBeGreaterThan(mean(bad, (v) => v.reviews));
    }
    expect(all.filter((v) => ['shells', 'sharks'].includes(v.market)).every((v) => v.nature === 'honest')).toBe(true);
    balanced(e);
  });

  it('sells earnings surprises that come true as often as the listing says, and flags trading on them', () => {
    const e = game();
    e.runSessions(3);
    const company = e.darkweb().reporting.find((i) => e.market.price[i] > 5)!;
    const p = buy(e, { service: 'leakEarnings', vendor: honest(e, 'leakEarnings'), company });
    const stored = e.s.darkweb.purchases.find((x) => x.id === p.id)!;
    e.advance(60);
    const letter = e.mail().messages.find((m) => m.kind === 'darkweb' && m.purchase === p.id)!;
    expect(letter).toMatchObject({ company, day: p.terms.day, result: 'success' });
    // The surprise comes out the way the leak said if the information was right, the other way if not.
    const truth = stored.outcome === 'success' ? letter.direction! : -letter.direction!;
    // Trade on the truth the day before the report: the SOB flags it as insider trading.
    const eve = at(Math.max(dayOf(e.time), previousTradingDay(p.terms.day!)), 10 * 60);
    if (eve > e.time) e.advanceTo(eve);
    ok(e.placeOrder({ company, side: truth > 0 ? 'buy' : 'short', type: 'market', shares: 5000, tif: 'day' }));
    e.advanceTo(at(p.terms.day!, OPEN - 1));
    const price = e.market.price[company];
    e.advanceTo(at(p.terms.day!, OPEN + 30));
    expect(Math.sign(e.market.price[company] - price)).toBe(truth);
    expect(e.s.regulator.evidence.some((x) => x.company === company && x.kind === 'insider')).toBe(true);
    expect(e.darkweb().purchases[0].result).toBe('success');
    balanced(e);
  });

  it('hides stakes in an offshore shell until it is discovered, then files them with a fine and a scandal', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { startingCapital: 50e6 }));
    e.runSessions(1);
    buy(e, { service: 'shell', vendor: honest(e, 'shell') });
    e.advance(120);
    const shell = e.darkweb().shell!;
    expect(shell.name).toMatch(/\w/);
    const target = small(e, 40e6);
    e.placeOrder({ company: target, side: 'buy', type: 'market', shares: Math.ceil(0.07 * e.model.shares[target]), tif: 'day' });
    e.runSessions(1);
    expect(e.s.governance.stakes.find((s) => s.company === target)).toMatchObject({ level: 5, hidden: true });
    expect(e.s.governance.filings.some((f) => f.firm === -1)).toBe(false);
    expect(e.details(target).shell).toBe(shell.name);
    expect(e.mail().messages.some((m) => m.kind === 'stakeFiled')).toBe(false);
    // Paid through the shell: a 10% fee, half the heat.
    const via = ok(e.darkQuote({ service: 'rumour', vendor: honest(e, 'rumour'), company: 4, viaShell: true })) as Terms;
    const direct = ok(e.darkQuote({ service: 'rumour', vendor: honest(e, 'rumour'), company: 4 })) as Terms;
    expect(via.fee).toBe(Math.round(direct.price * 0.1));
    expect(via.heat).toBeLessThan(direct.heat);
    shellFound(e, e.s.darkweb.shells[0]);
    expect(e.s.governance.stakes.find((s) => s.company === target)?.hidden).toBeUndefined();
    expect(e.s.governance.filings.some((f) => f.firm === -1 && f.company === target)).toBe(true);
    expect(e.s.regulator.fine!.amount).toBeGreaterThan(0);
    expect(e.s.events.news.some((n) => n.kind === 'expose' && n.text === 'shell')).toBe(true);
    expect(e.mail().messages.some((m) => m.kind === 'shellFound' && m.companies?.includes(target))).toBe(true);
    expect(e.darkweb().shell).toBeUndefined();
    balanced(e);
  });

  it('lends beyond the bank’s limits at 4% a week, and sends the collectors for a missed Friday', () => {
    const e = game();
    e.runSessions(1);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    const worth = e.netWorth();
    buy(e, { service: 'shark', vendor: honest(e, 'shark'), amount: 5_000_000 });
    expect(e.netWorth()).toBeCloseTo(worth, 6);
    expect(e.account().sharks).toBe(5_000_000);
    balanced(e);
    // A week's interest, paid on Friday.
    let day = dayOf(e.time);
    while (!endsWeek(day)) day = nextTradingDay(day);
    e.advanceTo(at(day, CLOSE));
    const paid = e.s.account.ledger.filter((l) => l.kind === 'sharkInterest');
    expect(paid.length).toBe(1);
    expect(-paid[0].amount).toBeGreaterThan(0);
    expect(-paid[0].amount).toBeLessThanOrEqual(5_000_000 * SHARK_WEEKLY * (10 / 7));
    balanced(e);
    // Spend the cash, and miss the next Friday.
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    const i = 0;
    const shares = Math.floor((e.account().buyingPower - 50_000) / (e.market.price[i] * 1.01));
    ok(e.placeOrder({ company: i, side: 'buy', type: 'market', shares, tif: 'day' }));
    day = dayOf(e.time);
    while (!endsWeek(day)) day = nextTradingDay(day);
    e.advanceTo(at(day, CLOSE));
    const call = e.mail().messages.find((m) => m.kind === 'sharkCall')!;
    expect(call.lines![0]).toMatchObject({ company: i, side: 'sell' });
    // Seized at 30% below market.
    expect(call.lines![0].amount / call.lines![0].shares).toBeCloseTo(e.market.price[i] * 0.7, 6);
    // The missed interest and the penalty are collected; the loan runs on.
    expect(call.amount).toBeGreaterThan(5_000_000 * 0.1);
    expect(e.account().sharks).toBe(5_000_000);
    expect(e.darkwebStatus().repossessed).toBe(addTradingDays(day, 5));
    expect(e.bankrupt).toBe(false);
    balanced(e);
  });

  it('lets a bribed journalist try blackmail, paid or refused', () => {
    const e = game();
    e.runSessions(1);
    const writer = journalistAt(e, 'dailyscoop');
    e.s.darkweb.bribed.push({ journalist: writer, bribes: 1, last: 20_000 });
    e.s.regulator.heat = 100;
    const day = dayOf(e.time);
    for (let k = 0; k < 500 && !e.s.darkweb.bribed[0].blackmail; k++) weeklyDarkWeb(e, day);
    const letter = e.mail().messages.find((m) => m.kind === 'blackmail')!;
    expect(letter).toMatchObject({ journalist: writer, amount: 40_000 });
    expect(e.mailAction(letter.id, 'pay')).toBeUndefined();
    expect(e.s.account.ledger.at(-1)).toMatchObject({ kind: 'consulting', amount: -40_000 });
    expect(e.mailAction(letter.id, 'refuse')).toMatch(/already answered/);
    balanced(e);
  });

  it('doctors client statements, and the forgery may come out later', () => {
    const e = game();
    e.runSessions(50);
    const p = buy(e, { service: 'forgery', vendor: honest(e, 'forgery') });
    e.s.darkweb.purchases.find((x) => x.id === p.id)!.outcome = 'failure';
    const statements = () => e.mail().messages.filter((m) => m.kind === 'statement');
    const before = statements().length;
    e.advanceTo(p.due + 1);
    const sent = statements().slice(before);
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) expect(s.returns![0]).toBeGreaterThan(s.returns![1]);
    e.runSessions(65);
    expect(e.mail().messages.some((m) => m.kind === 'forgeryFound')).toBe(true);
    expect(e.s.events.news.some((n) => n.kind === 'expose' && n.text === 'forgery')).toBe(true);
    expect(e.s.regulator.record.some((r) => r.outcome === 'fine')).toBe(true);
    balanced(e);
  });

  it('runs the other markets: bot farms, rumours, pump-and-dumps, hacking and espionage', () => {
    const e = game();
    e.runSessions(2);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    const bot = small(e, 1e9);
    const buys = [
      buy(e, { service: 'botHype', vendor: honest(e, 'botHype'), company: bot }),
      buy(e, { service: 'rumour', vendor: honest(e, 'rumour'), company: 12 }),
      buy(e, { service: 'pump', vendor: honest(e, 'pump'), amount: 50_000 }),
      buy(e, { service: 'ddos', vendor: honest(e, 'ddos'), firm: 0 }),
      buy(e, { service: 'deface', vendor: honest(e, 'deface'), company: 3 }),
      buy(e, { service: 'spyTrades', vendor: honest(e, 'spyTrades'), firm: 1 }),
      buy(e, { service: 'leakDeal', vendor: honest(e, 'leakDeal') }),
      buy(e, { service: 'watch', vendor: honest(e, 'watch') }),
    ];
    for (const p of buys) e.s.darkweb.purchases.find((x) => x.id === p.id)!.outcome = 'success';
    e.advance(90);
    expect(e.darkwebStatus().outages).toEqual(expect.arrayContaining([expect.objectContaining({ firm: 0 }), expect.objectContaining({ company: 3 })]));
    expect(e.s.events.rumours.filter((r) => r.company === bot && r.kind === 'pump').length).toBeGreaterThanOrEqual(4);
    expect(e.s.events.news.some((n) => n.kind === 'hack' && n.company === 3)).toBe(true);
    e.runSessions(6);
    const view = e.darkweb();
    expect(view.purchases.every((p) => p.result)).toBe(true);
    const spy = e.mail().messages.find((m) => m.kind === 'darkweb' && m.service === 'spyTrades')!;
    expect(spy.lines!.length).toBeGreaterThan(0);
    const pump = e.mail().messages.find((m) => m.kind === 'darkweb' && m.service === 'pump')!;
    expect(pump.amount!).toBeGreaterThan(50_000 * 1.29);
    expect(e.darkwebStatus().outages).toEqual([]);
    balanced(e);
  });

  it('sends the invitation and opens The Cellar only when the dark web is on', () => {
    const on = game();
    on.runSessions(40);
    expect(on.mail().messages.filter((m) => m.kind === 'garlicInvite')).toHaveLength(1);
    const view = on.darkweb();
    expect(view.cellar.length).toBeGreaterThan(0);
    const posts = cellarPosts(view, on.directory(), on.seed, dayOf(on.time));
    expect(posts.length).toBeGreaterThan(10);
    for (const p of posts) noPlaceholders(p.text);
    expect(CELLAR).toMatch(/\.garlic$/);
    const off = game(changeSettings(DIFFICULTIES.medium, { darkWeb: false }));
    off.runSessions(40);
    expect(off.mail().messages.some((m) => m.kind === 'garlicInvite')).toBe(false);
    expect(off.darkweb().enabled).toBe(false);
    expect(off.darkQuote({ service: 'watch', vendor: honest(off, 'watch') })).toMatchObject({ error: expect.stringMatching(/switched off/) });
  });

  it('writes every dark web letter in full', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { startingCapital: 50e6 }));
    e.runSessions(20);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    const vendorsOf = (service: ServiceId) => e.s.darkweb.vendors.filter((v) => v.market === SERVICES.find((s) => s.id === service)!.market && v.left === undefined);
    const requests: DarkRequest[] = [
      { service: 'puffFirm', vendor: 0, journalist: journalistAt(e, 'barrens') },
      { service: 'puffStock', vendor: 0, journalist: journalistAt(e, 'wyred'), company: 2 },
      { service: 'hitCompany', vendor: 0, journalist: journalistAt(e, 'dailyscoop'), company: 4 },
      { service: 'leakEarnings', vendor: 0, company: e.darkweb().reporting[0] },
      { service: 'leakDeal', vendor: 0 },
      { service: 'botFud', vendor: 0, company: small(e, 1e9) },
      { service: 'spyHoldings', vendor: 0, firm: 3 },
      { service: 'ddos', vendor: 0, firm: 2 },
      { service: 'shell', vendor: 0 },
      { service: 'pump', vendor: 0, amount: 20_000 },
      { service: 'rumour', vendor: 0, company: 20 },
      { service: 'forgery', vendor: 0 },
      { service: 'software', vendor: 0 },
      { service: 'meanie', vendor: 0 },
      { service: 'newsletter', vendor: 0 },
    ];
    // Every vendor of each: honest, scam or sting, success or failure.
    let k = 0;
    for (const r of requests) {
      for (const v of vendorsOf(r.service)) {
        const quote = e.darkQuote({ ...r, vendor: v.id });
        if ('error' in quote) continue;
        const p = ok(e.darkBuy({ ...r, vendor: v.id }, quote)).purchase;
        const stored = e.s.darkweb.purchases.find((x) => x.id === p.id)!;
        if (v.nature === 'honest') stored.outcome = k++ % 2 ? 'failure' : 'success';
      }
    }
    buy(e, { service: 'shark', vendor: vendorsOf('shark')[0].id, amount: 5_000_000 });
    e.runSessions(70);
    const state = e.exportState();
    const ctx = {
      directory: e.directory(), firmName: e.firmName, ceoName: e.player.ceoName, seed: e.seed, journalists: e.journalists(),
      clients: new Map(state.clients.clients.map((c) => [c.id, c])), news: new Map(state.events.news.map((n) => [n.id, n])),
    };
    const dark = e.mail().messages.filter((m) => ['garlicInvite', 'darkweb', 'blackmail', 'sharkCall', 'shellFound', 'forgeryFound'].includes(m.kind));
    expect(new Set(dark.map((m) => `${m.service}:${m.result}`)).size).toBeGreaterThan(15);
    for (const m of dark) {
      const letter = writeLetter(m, ctx);
      expect(letter.body.length, m.kind).toBeGreaterThan(0);
      const blocks = letter.body.flatMap((b) => ('p' in b ? [b.p] : 'list' in b ? b.list : 'link' in b ? [b.link, b.url] : b.table.rows.flat()));
      const text = [letter.from, letter.to, letter.subject, ...blocks].join('\n').replace(/\{c:\d+\}/g, '');
      expect(text, `${m.kind} ${m.service} ${m.result}: ${text}`).not.toMatch(/\{\w+\}|undefined|NaN|Infinity|[[\]|]/);
    }
    // The articles too.
    for (const n of state.events.news.filter((x) => x.kind === 'puff' || x.kind === 'hitPiece' || x.kind === 'expose')) {
      for (const outlet of n.outlets!) {
        expect(OUTLET[outlet]).toBeDefined();
        const a = writeArticle(n, outlet, e.directory(), e.firmName, e.seed, e.s.journalists);
        noPlaceholders([a.headline, ...a.paragraphs].join('\n').replace(/\{c:\d+\}/g, ''));
      }
    }
    balanced(e);
  }, 30_000);
});

/** HTML-escapes text as React does. */
function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
