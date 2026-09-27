import 'fake-indexeddb/auto';
import { createStore, keys, set } from 'idb-keyval';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLOSE, START_DAY, at, dayOf, nextTradingDay } from '../src/sim/calendar';
import { chain } from '../src/sim/commodities';
import { CONTRACT_INDEX } from '../src/sim/data/commodities';
import { Engine, type SimState } from '../src/sim/engine';
import { DEFAULT_LOGO as PLAYER_LOGO, decodeLogo, encodeLogo } from '../src/art/logo/code';
import { defaultPlayer } from '../src/sim/player';
import { DIFFICULTIES, changeSettings } from '../src/sim/settings';
import { decodeCeo } from '../src/world/ceo';
import { newBrowserState } from '../src/state/browser';
import { SAVE_VERSION, migrate } from '../src/state/migrations';
import { SAVE_FORMAT, packSave, unpackSave, type Manifest } from '../src/state/saveFile';
import { newDarkWeb, type DarkRequest } from '../src/sim/darkweb';
import type { ServiceId } from '../src/sim/data/darkweb';
import { cleanUp, deleteSave, listSaves, nextAutosave, readSave, writeSave, type SaveSlot } from '../src/state/saves';
import { generateWorld, type World } from '../src/world/generator';
import { difference } from './util';

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'save test', companyCount: 1000 });
});

const manifest = (extra: Partial<Manifest> = {}): Manifest => ({
  format: SAVE_FORMAT, version: SAVE_VERSION, name: 'Test', firmName: 'Test', gameTime: 0, netWorth: 0, savedAt: 0, ...extra,
});

/** The trading days of the first `n` sessions. */
const sessions = (n: number) => {
  const days = [START_DAY];
  while (days.length < n) days.push(nextTradingDay(days.at(-1)!));
  return days;
};

/** The player's actions in session `s`, placed at 10:30: the same in every run. */
function trade(e: Engine, s: number): void {
  const i = (s * 37) % 1000;
  if (s % 3 === 0 && e.held(i) >= 0) e.placeOrder({ company: i, side: 'buy', type: 'market', shares: 100, tif: 'day' });
  if (s % 5 === 0) {
    const j = (i + 1) % 1000;
    if (e.held(j) >= 0) e.placeOrder({ company: j, side: 'buy', type: 'limit', limit: e.market.price[j] * 0.97, shares: 200, tif: 'gtc' });
  }
  if (s % 7 === 0) {
    const p = e.positions().find((x) => x.shares > 0);
    if (p) e.placeOrder({ company: p.company, side: 'sell', type: 'market', shares: Math.ceil(p.shares / 2), tif: 'day' });
  }
  // Phase 7: short sales covered by trailing stops, futures (some rolled, some held to expiry), bank loans, and a corn
  // contract bought before the save and delivered after it.
  if (s % 4 === 1) {
    const k = (s * 53) % 100;
    if (e.held(k) <= 0 && e.placeOrder({ company: k, side: 'short', type: 'market', shares: 50, tif: 'day' })) {
      e.placeOrder({ company: k, side: 'cover', type: 'trailingStop', trail: 0.04, shares: 50, tif: 'gtc' });
    }
  }
  if (s === 3) e.takeLoan(250_000, 'amortising', 24);
  if (s === 20) e.takeLoan(100_000, 'interestOnly', 12);
  const day = dayOf(e.time);
  if (s % 13 === 4) e.tradeFuture(chain(s % 22, day)[0].key, s % 2 ? 1 : -1);
  const roll = e.futures().positions.find((p) => !p.contract.startsWith('ZC:'));
  if (s % 13 === 9 && roll) e.rollFuture(roll.contract);
  if (s === 45) e.tradeFuture(chain(CONTRACT_INDEX.ZC, day).find((c) => c.expiry > day + 20)!.key, 1);
  if (s === 110) e.sellGoods('ZC');
  // Phase 8: index fund units bought and sold, and a stake of more than 5% in a small company, filed with the SOB.
  if (s % 6 === 2) e.tradeFund((s * 7) % 41, 25 + s);
  const fund = e.funds().positions[0];
  if (s % 9 === 5 && fund) e.tradeFund(fund.fund, -Math.ceil(fund.units / 2));
  if (s === 12 || s === 75) {
    const small = e.companies.findIndex((_, i) => i > 400 && !e.market.state.status[i] && e.market.price[i] * e.model.shares[i] < 4e6 && e.market.price[i] > 1);
    e.placeOrder({ company: small, side: 'buy', type: 'market', shares: Math.ceil(0.06 * e.model.shares[small]), tif: 'day' });
  }
  // Phase 9: the dark web — a shell, a bribe, a bot farm, a loan shark across the save, and purchases still in transit
  // when the game is saved (a pump-and-dump and stolen trading plans), whose outcomes were decided before the save.
  const dark = (service: ServiceId, extra: Partial<DarkRequest> = {}) => {
    // From honest vendors: an SOB sting's enforcement action would empty the client list this test counts on.
    const listing = e.darkweb().listings.find((l) => l.service === service && e.s.darkweb.vendors[l.vendor].nature === 'honest')!;
    const request = { ...listing.request, ...extra };
    const terms = e.darkQuote(request);
    if (!('error' in terms)) e.darkBuy(request, terms);
  };
  if (s === 8) dark('shell');
  if (s === 16) dark('puffFirm');
  if (s === 22) dark('botHype');
  if (s === 50) dark('rumour', { company: 30, viaShell: true });
  if (s === 55) dark('shark', { amount: 5_000_000 });
  if (s === 58) dark('pump', { amount: 20_000 });
  if (s === 60) dark('leakEarnings');
  if (s === 60) dark('spyTrades', { firm: 1 });
  if (s === 70) e.closeShell();
  if (s === 65) e.repayShark();
  if (s === 80) dark('forgery');
}

/** A state without what Phase 9 added. */
function beforePhase9(state: SimState) {
  const { darkweb: _d, ...rest } = state;
  const { darkweb: _rd, ...rng } = state.rng;
  return { ...rest, rng };
}

/** A state without what Phases 8 and 9 added. */
function beforePhase8(full: SimState) {
  const state = beforePhase9(full) as unknown as SimState;
  const { funds: _f, competitors: _c, governance: _g, regulator: _r, scoring: _s, ...rest } = state;
  const { rivals: _rr, governance: _rg, regulator: _rreg, ...rng } = state.rng;
  const { funds: _af, ...account } = state.account;
  const { fundFees: _ff, ...settings } = state.settings;
  return { ...rest, rng, account, settings };
}

/** A state without what Phases 7 and 8 added. */
function beforePhase7(full: SimState) {
  const state = beforePhase8(full) as unknown as SimState;
  const { commodities: _c, loans: _l, bankruptcy: _b, ...rest } = state;
  const { commodities: _rc, broker: _rb, ...rng } = state.rng;
  const { shortInterest: _si, ...market } = state.market;
  const { futures: _f, goods: _g, charges: _ch, call: _call, ...account } = state.account;
  return { ...rest, rng, market, account };
}

/** A state without what Phases 6 and 7 added. */
function beforePhase6(state: SimState) {
  const { macro: _m, events: _e, journalists: _j, clients: _c, mail: _mail, ...rest } = beforePhase7(state);
  const { events: _re, macro: _rm, clients: _rc, mail: _rmail, ...rng } = rest.rng as SimState['rng'];
  const { dividend: _d, ...fundamentals } = rest.fundamentals;
  return { ...rest, rng, fundamentals };
}

const saveAndLoad = (e: Engine): Engine => {
  const bytes = packSave({ manifest: manifest(), sim: e.exportState() });
  return Engine.restore(migrate(unpackSave(bytes)).sim as SimState);
};

describe('save system (spec §18)', () => {
  it('save test: 60 days, save, load, 60 more days = 120 days without saving', () => {
    const days = sessions(120);
    // Phase 5: a Custom game with its own logo and CEO, renamed and redesigned along the way.
    const settings = changeSettings(DIFFICULTIES.hard, { startingCapital: 2_500_000, startYear: 2001 });
    const player = { logoCode: encodeLogo(PLAYER_LOGO), ceoName: 'Pat Doe', ceoCode: 'BJaA2pIrBgMQEws' };
    const straight = Engine.create(world, { settings, firmName: 'Test', player });
    let saved = Engine.create(world, { settings, firmName: 'Test', player });
    days.forEach((day, s) => {
      for (const e of [straight, saved]) {
        e.advanceTo(at(day, 10 * 60 + 30));
        trade(e, s);
        if (s === 30) e.setPlayer({ firmName: 'Renamed Capital', logoCode: encodeLogo({ ...PLAYER_LOGO, effect: 'bevel' }) });
        if (s === 90) e.setPlayer({ ceoName: 'Pat Doe-Ray' });
        // Phase 6: answer the mail — take mandates, report a tip, read and flag letters.
        if (s % 20 === 10) {
          const offer = e.mail().messages.find((m) => m.kind === 'offer' && !m.answer);
          if (offer) e.mailAction(offer.id, 'accept');
        }
        // Phase 8: proxies voted as they come.
        for (const m of e.mail().messages) if (m.kind === 'proxy' && !m.answer) e.mailAction(m.id, s % 2 ? 'for' : 'against');
        if (s === 45) {
          const tip = e.mail().messages.find((m) => m.kind === 'tip' && !m.answer);
          if (tip) e.mailAction(tip.id, 'report');
          e.markMail([1, 2, 3], { read: true, flagged: true });
          e.setAlerts(false);
        }
      }
      if (s === 60) {
        // Save at any moment: mid-session, with open orders.
        saved.advanceTo(at(day, 11 * 60));
        expect(saved.openOrders().length).toBeGreaterThan(0);
        expect(saved.phase).toBe('open');
        saved = saveAndLoad(saved);
      }
      for (const e of [straight, saved]) e.advanceTo(at(day, CLOSE));
    });
    expect(saved.orders().length).toBeGreaterThan(50);
    expect(difference(saved.exportState(), straight.exportState())).toBeUndefined();
    // Phase 6: mail, news, rumours, clients and the economy all carried over, answers included.
    const state = saved.exportState();
    expect(state.mail.messages.length).toBeGreaterThan(100);
    expect(state.mail.messages.some((m) => m.answer === 'accepted')).toBe(true);
    expect(state.events.news.length).toBeGreaterThan(500);
    expect(state.events.rumours.length).toBeGreaterThan(20);
    // Clients who joined (Phase 9's dark web can cost the firm some of them again).
    expect(state.clients.clients.filter((c) => c.joined !== undefined).length).toBeGreaterThan(2);
    expect(state.events.queue.length).toBeGreaterThan(0);
    // Phase 4: the quarterly results the IR pages show carry over, including reports made after loading.
    const quarters = saved.details(5).quarters;
    expect(quarters.at(-1)!.reported).toBeGreaterThan(START_DAY);
    expect(quarters).toEqual(straight.details(5).quarters);
    // Phase 7: shorts and their stops, futures and their settlements, a delivery after the save, loans and commodities.
    const ledger = state.account.ledger;
    expect(ledger.filter((l) => l.kind === 'short').length).toBeGreaterThan(10);
    expect(state.account.orders.filter((o) => o.type === 'trailingStop' && o.triggered).length).toBeGreaterThan(0);
    expect(ledger.filter((l) => l.kind === 'variation').length).toBeGreaterThan(20);
    expect(ledger.filter((l) => l.kind === 'borrowFee').length).toBeGreaterThan(50);
    expect(ledger.some((l) => l.kind === 'delivery' && l.contract?.startsWith('ZC:') && dayOf(l.time) > days[60])).toBe(true);
    expect(ledger.some((l) => l.kind === 'goods' && l.contract === 'ZC')).toBe(true);
    expect(state.loans.loans.map((l) => l.status)).toEqual(['active', 'active']);
    expect(state.loans.loans[0].paid).toBeGreaterThanOrEqual(5);
    expect(state.commodities.outlooks.length).toBeGreaterThan(3);
    expect(state.commodities.days).toHaveLength(120);
    const a = saved.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 3);
    // Phase 8: funds and their units, competitors' weekly books, the SOB filings, the firm's time-weighted record.
    expect(state.funds.days).toHaveLength(120);
    expect(ledger.filter((l) => l.kind === 'fund').length).toBeGreaterThan(20);
    expect(ledger.some((l) => l.kind === 'fund' && dayOf(l.time) > days[60])).toBe(true);
    expect(state.competitors.books.every((b) => b.history.length >= 24)).toBe(true);
    expect(state.competitors.books.every((b) => b.filings.length === 2)).toBe(true);
    expect(state.governance.filings.filter((f) => f.firm === -1).length).toBeGreaterThanOrEqual(2);
    expect(state.scoring.growth).toHaveLength(120);
    expect(state.scoring.achievements.fund).toBeDefined();
    // Phase 9: dark web purchases on both sides of the save, some still in transit when it was saved.
    const purchases = state.darkweb.purchases;
    expect(purchases.map((p) => p.request.service)).toEqual(['shell', 'puffFirm', 'botHype', 'rumour', 'shark', 'pump', 'leakEarnings', 'spyTrades', 'forgery']);
    expect(purchases.filter((p) => p.time < at(days[60], 11 * 60) && (p.done ?? Infinity) > at(days[60], 11 * 60)).length).toBeGreaterThanOrEqual(2);
    // The shell hid the stake bought on day 12 until it was wound up on day 70, when the stake was filed, late.
    expect(state.darkweb.shells).toMatchObject([{ closed: days[70] }]);
    expect(state.darkweb.shark).toBeUndefined();
    expect(ledger.some((l) => l.kind === 'offshore')).toBe(true);
    expect(ledger.filter((l) => l.kind === 'sharkInterest').length).toBeGreaterThanOrEqual(2);
    expect(state.mail.messages.some((m) => m.kind === 'garlicInvite')).toBe(true);
    // Phase 5: the firm, its logo and CEO, and the Custom settings carry over.
    expect(saved.player).toMatchObject({ firmName: 'Renamed Capital', ceoName: 'Pat Doe-Ray', ceoCode: player.ceoCode });
    expect(decodeLogo(saved.player.logoCode).effect).toBe('bevel');
    expect(saved.settings).toEqual(settings);
    expect(saved.settings.difficulty).toBe('custom');
  }, 60_000);

  it('upgrades a version 6 save: the dark web opens where the game stands', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Old Firm' });
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    e.runSessions(20);
    const old = beforePhase9(e.exportState());
    const upgraded = migrate(unpackSave(packSave({ manifest: manifest({ version: 6 }), sim: old, game: { shell: { iconPositions: {}, speed: 1, tickerTape: false } } })));
    const loaded = Engine.restore(upgraded.sim as SimState);
    const state = loaded.exportState();
    expect(difference(beforePhase9(state), old)).toBeUndefined();
    expect(difference(state.darkweb, newDarkWeb(world.seed, dayOf(e.time)))).toBeUndefined();
    loaded.runSessions(20);
    expect(loaded.mail().messages.some((m) => m.kind === 'garlicInvite')).toBe(true);
    const listing = loaded.darkweb().listings.find((l) => l.service === 'watch')!;
    expect('purchase' in loaded.darkBuy(listing.request, listing.terms!)).toBe(true);
    const a = loaded.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  });

  it('upgrades a version 5 save: funds launched, competitors’ books opened and the firm’s record worked out where the game stands', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Old Firm' });
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    e.runSessions(6);
    const old = beforePhase8(e.exportState());
    const upgraded = migrate(unpackSave(packSave({ manifest: manifest({ version: 5 }), sim: old, game: {} })));
    const loaded = Engine.restore(upgraded.sim as SimState);
    const state = loaded.exportState();
    // Nothing that was there changes (fund fees come from the difficulty); what Phase 8 adds starts where the game stands.
    expect(difference(beforePhase8(state), old)).toBeUndefined();
    expect(state.settings.fundFees).toEqual(DIFFICULTIES.medium.fundFees);
    expect(state.account.funds).toEqual([]);
    expect(loaded.funds().list[0]).toMatchObject({ members: 500 });
    expect(loaded.fundPrice(0)).toBeCloseTo(100, 6);
    expect(state.competitors.books.map((b) => b.history.length)).toEqual(state.world.firms.map(() => 1));
    expect(state.scoring.growth).toHaveLength(6);
    expect(state.scoring.growth[5]).toBeCloseTo(state.stats[5][1] / 2_500_000, 9);
    loaded.runSessions(10);
    expect(loaded.exportState().competitors.books[0].history.length).toBeGreaterThan(1);
    const a = loaded.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  });

  it('upgrades a version 4 save: a margin account, commodities at their 1998 levels, short interest and no loans', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Old Firm' });
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    e.runSessions(4);
    const old = beforePhase7(e.exportState());
    const upgraded = migrate(unpackSave(packSave({ manifest: manifest({ version: 4 }), sim: old, game: {} })));
    const loaded = Engine.restore(upgraded.sim as SimState);
    const state = loaded.exportState();
    // Nothing that was there changes; what Phase 7 adds starts empty, or as a new game has it.
    expect(difference(beforePhase7(state), old)).toBeUndefined();
    expect(state.account).toMatchObject({ futures: [], goods: [], charges: 0 });
    expect(state.loans.loans).toEqual([]);
    const fresh = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Old Firm' }).exportState();
    expect(difference(state.market.shortInterest, fresh.market.shortInterest)).toBeUndefined();
    expect(difference(state.commodities, fresh.commodities)).toBeUndefined();
    expect(state.rng.commodities).toEqual(fresh.rng.commodities);
    loaded.runSessions(5);
    expect(loaded.futures().chains.every((c) => c.length >= 4)).toBe(true);
    const a = loaded.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  });

  it('upgrades a version 3 save: mail, news, clients and the economy start where the game stands', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Old Firm' });
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    e.runSessions(4);
    const sim = e.exportState() as Partial<SimState> & SimState;
    const nav = e.nav();
    const { macro: _m, events: _e, journalists: _j, clients: _c, mail: _mail, ...v3 } = sim;
    const { events: _re, macro: _rm, clients: _rc, mail: _rmail, ...rng } = sim.rng;
    const { status: _s, ...market } = sim.market;
    const { members: _members, ...index } = sim.market.index;
    const { dividend: _d, ...fundamentals } = sim.fundamentals;
    const old = { ...v3, rng, market: { ...market, index }, fundamentals };
    const upgraded = migrate(unpackSave(packSave({ manifest: manifest({ version: 3 }), sim: old, game: {} })));
    const loaded = Engine.restore(upgraded.sim as SimState);
    expect(loaded.mail().messages.map((m) => m.kind)).toEqual(['welcome']);
    const clients = loaded.clients();
    expect(clients.clients.map((c) => c.kind)).toEqual(['founder', 'founder']);
    expect(clients.unit).toBeCloseTo(1, 9);
    expect(clients.clientAssets).toBeCloseTo(nav, 4);
    expect(loaded.journalists().length).toBeGreaterThan(40);
    expect(Array.from(loaded.exportState().market.index.members)).toEqual(Array.from(sim.market.index.members));
    loaded.runSessions(3);
    expect(loaded.newsCount).toBeGreaterThan(10);
    expect(loaded.mail().messages.some((m) => m.kind === 'briefing')).toBe(true);
  });

  it('upgrades a version 2 save: default logo, a CEO from the seed, and the advanced settings', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.hard, firmName: 'Old Firm' });
    const sim = e.exportState();
    const { commission, spread, smallCapSpread, volatility, crashes, impact, startingCapital } = DIFFICULTIES.hard;
    const old = {
      ...sim,
      player: { firmName: 'Old Firm' },
      settings: { difficulty: 'hard', startingCapital, commission, spread, smallCapSpread, volatility, crashes, impact },
    };
    const upgraded = migrate(unpackSave(packSave({ manifest: manifest({ version: 2 }), sim: old, game: {} })));
    const loaded = Engine.restore(upgraded.sim as SimState);
    expect(loaded.settings).toEqual(DIFFICULTIES.hard);
    expect(loaded.player).toEqual(defaultPlayer(world.seed, 'Old Firm'));
    expect(decodeLogo(loaded.player.logoCode)).toMatchObject({ motif: 'bull', shape: 'circle' });
    expect(() => decodeCeo(loaded.player.ceoCode)).not.toThrow();
  });

  it('upgrades a version 1 save: quarterly results backfilled, browser favourites and history added', () => {
    const e = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Test' });
    e.runSessions(3);
    const sim = e.exportState();
    const old = { ...sim, fundamentals: { ...sim.fundamentals } } as Record<string, unknown> & SimState;
    delete (old.fundamentals as Partial<SimState['fundamentals']>).quarterRevenue;
    delete (old.fundamentals as Partial<SimState['fundamentals']>).quarterIncome;
    const v1 = unpackSave(packSave({ manifest: manifest({ version: 1 }), sim: old, game: { trade: {} } }));
    const upgraded = migrate(v1);
    expect(upgraded.manifest.version).toBe(SAVE_VERSION);
    expect(upgraded.game).toMatchObject({ trade: {}, browser: newBrowserState() });
    const loaded = Engine.restore(upgraded.sim as SimState);
    // Everything before Phase 6 is as it was; Phase 6 starts afresh (its own test below).
    expect(difference(beforePhase6(loaded.exportState()), beforePhase6(sim))).toBeUndefined();
  });

  it('packs documents with every kind of typed array into a zip and back', () => {
    const documents = {
      manifest: manifest({ name: 'Round trip' }),
      game: { windows: [{ id: 'w1', bounds: { x: 1, y: 2 } }], nested: { list: [1, 'two', null, true] } },
      sim: {
        f64: Float64Array.of(Math.PI, -0, Number.NaN, Infinity),
        f32: Float32Array.of(1.5, -2.25),
        i32: Int32Array.of(-2147483648, 2147483647),
        i16: Int16Array.of(-32768, 32767),
        u16: Uint16Array.of(0, 65535),
        u8: Uint8Array.of(0, 255),
        view: new Int32Array(new Int32Array([9, 8, 7, 6]).buffer, 4, 2),
        empty: new Float64Array(0),
      },
    };
    const back = unpackSave(packSave(documents));
    expect(back).toEqual(documents);
    expect((back.sim as { i32: Int32Array }).i32).toBeInstanceOf(Int32Array);
    expect(unpackSave(packSave(documents), true)).toEqual({ manifest: documents.manifest });
  });

  it('rejects files that are not saves, and saves from a newer version', () => {
    expect(() => unpackSave(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => migrate({ manifest: { ...manifest(), format: 'nope' as typeof SAVE_FORMAT } })).toThrow(/not a Majorsoft/);
    expect(() => migrate({ manifest: manifest({ version: SAVE_VERSION + 1 }) })).toThrow(/newer version/);
  });

  it('upgrades old saves through each migration in turn', () => {
    const steps = { 1: (d: { manifest: Manifest; log?: string[] }) => ({ ...d, log: ['1→2'] }), 2: (d: { manifest: Manifest; log?: string[] }) => ({ ...d, log: [...d.log!, '2→3'] }) };
    const upgraded = migrate({ manifest: manifest({ version: 1 }) }, steps, 3);
    expect(upgraded).toMatchObject({ manifest: { version: 3 }, log: ['1→2', '2→3'] });
  });
});

describe('save slots in IndexedDB (spec §17–18)', () => {
  const slot = (id: string, savedAt: number, auto = false): Omit<SaveSlot, 'file' | 'size'> => ({
    id, name: id, auto, savedAt, gameTime: 0, firmName: 'Test', netWorth: 0,
  });
  const files = () => keys<string>(createStore('majorsoft-doors-98', 'saves')).then((k) => k.filter((x) => x !== 'index'));

  beforeEach(async () => {
    for (const s of await listSaves()) await deleteSave(s.id);
    await cleanUp();
  });

  it('writes, lists, reads and deletes slots', async () => {
    await writeSave(slot('one', 1), Uint8Array.of(1));
    await writeSave(slot('two', 2), Uint8Array.of(2, 2));
    expect((await listSaves()).map((s) => [s.id, s.size])).toEqual([['one', 1], ['two', 2]]);
    expect(await readSave('two')).toEqual(Uint8Array.of(2, 2));
    await deleteSave('one');
    expect((await listSaves()).map((s) => s.id)).toEqual(['two']);
    await expect(readSave('one')).rejects.toThrow(/could not be found/);
    expect(await files()).toHaveLength(1);
  });

  it('overwrites a slot by switching to a new file, leaving nothing behind', async () => {
    const first = await writeSave(slot('game', 1), Uint8Array.of(1));
    const second = await writeSave(slot('game', 2), Uint8Array.of(9, 9));
    expect(second.file).not.toBe(first.file);
    expect(await readSave('game')).toEqual(Uint8Array.of(9, 9));
    expect(await files()).toEqual([second.file]);
  });

  it('sweeps away files a crash left behind', async () => {
    await writeSave(slot('game', 1), Uint8Array.of(1));
    await set('file:game:half-written', Uint8Array.of(0), createStore('majorsoft-doors-98', 'saves'));
    await cleanUp();
    expect(await files()).toHaveLength(1);
    expect(await readSave('game')).toEqual(Uint8Array.of(1));
  });

  it('rotates three autosaves', async () => {
    const ids: string[] = [];
    for (let k = 0; k < 5; k++) {
      const id = nextAutosave(await listSaves());
      ids.push(id);
      await writeSave(slot(id, 100 + k, true), Uint8Array.of(k));
    }
    expect(ids).toEqual(['autosave-1', 'autosave-2', 'autosave-3', 'autosave-1', 'autosave-2']);
    expect((await listSaves()).filter((s) => s.auto)).toHaveLength(3);
  });
});
