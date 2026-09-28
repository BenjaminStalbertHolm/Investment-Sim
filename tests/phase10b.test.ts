import { beforeAll, describe, expect, it } from 'vitest';
import { CLOSE, OPEN, START_DAY, addTradingDays, at, dayOf } from '../src/sim/calendar';
import { COUNTRIES, COUNTRY, COUNTRY_OF_CITY, PAIRS } from '../src/sim/data/countries';
import { Engine, type SimState } from '../src/sim/engine';
import { homeCountries } from '../src/sim/geo';
import { DIFFICULTIES, changeSettings, type GameSettings } from '../src/sim/settings';
import { SAVE_VERSION, migrate } from '../src/state/migrations';
import { SAVE_FORMAT, packSave, unpackSave } from '../src/state/saveFile';
import { CITIES } from '../src/world/cities';
import { generateWorld, type World } from '../src/world/generator';
import { digest, fingerprintRun, withoutModules } from './fingerprint';
import { difference } from './util';

// Phase 10B (spec §19): "With all modules off, a seeded run is identical to one built without them; each module toggles
// cleanly mid-game and its state is saved."

/** Digests of the fingerprint scenario, recorded on the Phase 10 build (commit 489273d), before any module existed. */
const PHASE_10 = {
  medium: '9cf9becfd2f811f8e207975c1cb314ebd53fb4b13490362cfd1b283f83332631',
  hard: '50ac067c2b7f59c02551e09f566b8f3fc822f13d8d73a4bcf988fd75d795c69c',
};

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'phase 10b fingerprint', companyCount: 1000 });
});

const ALL = { geopolitics: true, periodEvents: true, gags: true };
const NONE = { geopolitics: false, periodEvents: false, gags: false };
const withModules = (base: GameSettings, modules: GameSettings['modules']) => ({ ...base, modules });
const saveAndLoad = (e: Engine): Engine => {
  const manifest = { format: SAVE_FORMAT, version: SAVE_VERSION, name: 'T', firmName: 'T', gameTime: 0, netWorth: 0, savedAt: 0 } as const;
  return Engine.restore(migrate(unpackSave(packSave({ manifest, sim: e.exportState() }))).sim as SimState);
};

describe('fun modules off (spec §16C: "with a module off, the simulation behaves exactly as if it didn’t exist")', () => {
  it('plays the fingerprint scenario exactly as the build without modules did', () => {
    expect(digest(withoutModules(fingerprintRun(world).exportState()))).toBe(PHASE_10.medium);
    expect(digest(withoutModules(fingerprintRun(world, DIFFICULTIES.hard).exportState()))).toBe(PHASE_10.hard);
  });

  it('adds nothing but empty module state and unused streams', () => {
    const e = fingerprintRun(world);
    const s = e.exportState();
    expect(s.modules).toEqual({});
    const fresh = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Fingerprint Capital' }).exportState();
    for (const k of ['geo', 'period', 'gags'] as const) expect(s.rng[k]).toEqual(fresh.rng[k]);
  });
});

const dayAt = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 86_400_000;
const game = (modules: GameSettings['modules'] = ALL, base: GameSettings = DIFFICULTIES.medium) => Engine.create(world, { settings: withModules(base, modules), firmName: 'Module Capital' });
const stories = (e: Engine, prefix: string) => e.s.events.news.filter((n) => n.kind === 'story' && n.text?.startsWith(prefix));
const until = (e: Engine, day: number) => e.advanceTo(at(day, CLOSE));

/** A long game with every module on, shared by the tests that only look at what happened. */
let long: Engine;
beforeAll(() => {
  long = game();
  until(long, dayAt(2000, 5, 30));
}, 120_000);

describe('Geopolitics (spec §16C.1)', () => {
  it('maps every HQ city to a country of the module’s world, or to a region for the unlisted', async () => {
    const { REGIONS } = await import('../src/sim/data/countries');
    for (const c of CITIES) expect(COUNTRY_OF_CITY[c.country] ?? REGIONS[c.country], c.country).toBeDefined();
    // Every listed country but the uninhabited and the greyed out has an HQ city; the table's markets are covered.
    for (const c of COUNTRIES) if (!['nope', 'antarctica'].includes(c.id)) expect(CITIES.some((x) => COUNTRY_OF_CITY[x.country] === c.id), c.id).toBe(true);
    expect(homeCountries(long).filter((x) => x === 'usga').length).toBeGreaterThan(300);
    const tops = long.companies.filter((c) => c.curated);
    expect(tops.find((c) => c.ticker === 'RTC')!.hq.country).toBe('Rhodesia');
    expect(COUNTRY_OF_CITY[tops.find((c) => c.ticker === 'TOSC')!.hq.country]).toBe('taiwan');
  });

  it('draws each country from Natural Earth shapes that exist, or a marker', async () => {
    const atlas = (await import('world-atlas/countries-110m.json')).default as { objects: { countries: { geometries: { id?: string }[] } } };
    const ids = new Set(atlas.objects.countries.geometries.map((g) => g.id));
    for (const c of COUNTRIES) {
      expect(c.shapes.length || c.marker, c.id).toBeTruthy();
      for (const s of c.shapes) expect(ids.has(s), `${c.id} ${s}`).toBe(true);
    }
    const shapes = COUNTRIES.flatMap((c) => c.shapes);
    expect(new Set(shapes).size).toBe(shapes.length);
    expect(COUNTRY.nope.shapes).toEqual(['376', '275']);
  });

  it('escalates pairs one rung at a time, to ceasefires, and moves their companies', () => {
    const news = stories(long, 'geo.');
    expect(news.length).toBeGreaterThan(60);
    const rungs = news.filter((n) => n.args?.[0] === 'usga' && n.args?.[1] === 'mexico').map((n) => n.text!);
    let rung = 0;
    for (const t of rungs) {
      const next = t.startsWith('geo.rung') ? Number(t.slice(8)) : 0;
      if (next) expect(next, rungs.join(' ')).toBe(rung + 1);
      else expect(['geo.ceasefire', 'geo.calm']).toContain(t);
      rung = next;
    }
    // Rhetoric-only pairs never pass harsh words; the Union's dispute never passes a sternly worded letter.
    for (const n of news.filter((x) => x.args?.[0] === 'germany' || x.args?.[0] === 'swedenNorway')) {
      expect(['geo.rhetoricOnly', 'geo.letter', 'geo.calm', 'geo.election']).toContain(n.text);
    }
  });

  it('never references Nope, keeps the dry countries dry and the gag leaders fixed', () => {
    const news = stories(long, 'geo.');
    expect(news.some((n) => n.args?.includes('nope'))).toBe(false);
    const DRY = new Set(['geo.sanctions', 'geo.grain', 'geo.strait', 'geo.exportControls', 'geo.tariffsChina', 'geo.chips', 'geo.oilSupply', 'geo.mines', 'geo.feud', 'geo.election', 'geo.canal']);
    for (const n of news) {
      const dry = n.args?.some((a) => COUNTRY[a]?.dry);
      if (dry) expect(DRY.has(n.text!), `${n.text} ${n.args}`).toBe(true);
    }
    const g = long.s.modules.geo!;
    for (const c of COUNTRIES.filter((x) => x.leader.fixed)) expect(g.leaders[c.id].since, c.id).toBe(START_DAY);
    expect(long.modules().geo!.leaders.antarctica).toMatchObject({ name: 'Pengu I', title: 'Emperor' });
    expect(long.modules().geo!.leaders.swedenNorway.name).toBe('Oscar III');
    // Italy has had several governments.
    expect(news.filter((n) => n.text === 'geo.italy').length).toBeGreaterThan(5);
  });

  it('makes Irish shell companies cheaper', () => {
    const quote = (e: Engine) => e.darkweb().listings.find((l) => l.service === 'shell')!.terms!.price;
    // 60% of the price, rounded as vendors round their prices.
    const ratio = quote(game({ ...NONE, geopolitics: true })) / quote(game(NONE));
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
  });

  it('runs French strikes twice as often', () => {
    const on = long.s.events.news.filter((n) => n.kind === 'strike' && homeCountries(long)[n.company] === 'france').length;
    const off = game(NONE);
    until(off, dayAt(2000, 5, 30));
    const base = off.s.events.news.filter((n) => n.kind === 'strike' && homeCountries(off)[n.company] === 'france').length;
    expect(on).toBeGreaterThan(base * 1.4);
  }, 60_000);
});

describe('1998-era events (spec §16C.2)', () => {
  it('Birkshire Hatchaway never splits, and climbs past its marks', () => {
    const b = long.companies.findIndex((c) => c.ticker === 'BRKH');
    const fresh = game();
    expect(fresh.market.price[b]).toBeGreaterThan(150_000);
    expect(fresh.market.price[b]).toBeLessThan(400_000);
    expect(long.market.price[b]).toBeGreaterThan(fresh.market.price[b]);
    // Its only split is the one that undid all the others.
    expect(long.s.world.splits[b]).toBe(fresh.s.world.splits[b]);
    expect(stories(long, 'period.birkshire').length).toBeGreaterThan(0);
  });

  it('dot-com mania: ".com" renames jump 20–60% from mid-1998, the bubble builds across tech and pops', () => {
    const renames = stories(long, 'period.dotcom');
    expect(renames.length).toBeGreaterThan(20);
    for (const n of renames) {
      expect(dayOf(n.time)).toBeGreaterThanOrEqual(dayAt(1998, 6, 1));
      expect(n.move).toBeGreaterThanOrEqual(0.2);
      expect(n.move).toBeLessThanOrEqual(0.6);
      expect(n.args![0]).toMatch(/\.com$/);
    }
    const p = long.s.modules.period!;
    expect(stories(long, 'period.pop')).toHaveLength(p.popped !== undefined ? 1 : 0);
    // The pop: forced where it hasn't happened, with a stretched bubble in 2000.
    const e = game();
    until(e, dayAt(1998, 6, 3));
    const tech = e.companies.findIndex((c, i) => c.industry.id === 'internet' && !e.market.state.status[i]);
    e.s.modules.period!.bubble = 3;
    e.s.modules.period!.popped = undefined;
    e.advanceTo(at(dayAt(2000, 0, 3), OPEN));
    e.s.modules.period!.bubble = 3;
    const before = e.market.price[tech];
    for (let k = 0; k < 40 && e.s.modules.period!.popped === undefined; k++) until(e, addTradingDays(dayOf(e.time), 5));
    expect(e.s.modules.period!.popped).toBeDefined();
    until(e, addTradingDays(dayOf(e.time), 5));
    expect(e.market.price[tech]).toBeLessThan(before);
  }, 60_000);

  it('LTCM blows up in 1998, the Reservoir bails it out three trading days later', () => {
    const [blowUp] = stories(long, 'period.ltcm');
    const [bailout] = stories(long, 'period.ltcmBailout');
    expect(dayOf(blowUp.time)).toBeLessThan(dayAt(1999, 0, 1));
    expect(dayOf(bailout.time)).toBe(addTradingDays(dayOf(blowUp.time), 3));
  });

  it('mad cow, El Niño and Doors crashing on stage at COMDEXX', async () => {
    const { conferenceDay } = await import('../src/sim/lifestyle');
    expect(stories(long, 'period.madCow')).toHaveLength(1);
    expect(stories(long, 'period.elNino')).toHaveLength(1);
    const [crash] = stories(long, 'period.demoCrash');
    expect(dayOf(crash.time)).toBe(conferenceDay('comdexx', 1998));
    expect(long.companies[crash.company].ticker).toBe('MJSF');
    // The player's screen fakes a blue screen: an event for the UI.
    const e = game({ ...NONE, periodEvents: true });
    until(e, conferenceDay('comdexx', 1998) - 1);
    e.drainEvents();
    e.advanceTo(at(conferenceDay('comdexx', 1998), OPEN));
    expect(e.drainEvents().some((x) => x.kind === 'demoCrash')).toBe(true);
  });

  it('Tamagotcha dies if ignored for two game weeks; resurrection costs $1', () => {
    const e = game({ ...NONE, periodEvents: true });
    expect(e.tamagotcha({ do: 'adopt', name: 'Lucky' })).toBeUndefined();
    until(e, addTradingDays(START_DAY, 5));
    expect(e.tamagotcha({ do: 'feed' })).toBeUndefined();
    until(e, addTradingDays(START_DAY, 12));
    expect(e.modules().period!.tamagotcha!.alive).toBe(true);
    until(e, addTradingDays(START_DAY, 18));
    expect(e.modules().period!.tamagotcha).toMatchObject({ alive: false, deaths: 1 });
    expect(e.tamagotcha({ do: 'feed' })).toMatch(/died/);
    const cash = e.account().cash;
    expect(e.tamagotcha({ do: 'resurrect' })).toBeUndefined();
    expect(e.account().cash).toBeCloseTo(cash - 1, 6);
    expect(e.ledger().at(-1)).toMatchObject({ kind: 'pet', amount: -1 });
    expect(game(NONE).tamagotcha({ do: 'adopt' })).toMatch(/module/);
  });

  it('undoes Birkshire’s splits for a holder: whole shares, cash for the fraction, the books balanced', () => {
    const e = game(NONE);
    const b = e.companies.findIndex((c) => c.ticker === 'BRKH');
    e.advanceTo(at(START_DAY, OPEN + 30));
    e.placeOrder({ company: b, side: 'buy', type: 'market', shares: 2_345, tif: 'day' });
    e.advanceTo(at(START_DAY, OPEN + 60));
    const value = e.positions()[0].value;
    e.setModules({ ...NONE, periodEvents: true });
    const p = e.positions()[0];
    expect(Number.isInteger(p.shares)).toBe(true);
    expect(p.value + (e.ledger().find((l) => l.kind === 'cashInLieu')?.amount ?? 0)).toBeCloseTo(value, 4);
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 3);
  });
});

describe('Recurring gags and storylines (spec §16C.3)', () => {
  it('ages the chief executive in drawdowns', () => {
    const e = game({ ...NONE, gags: true });
    until(e, addTradingDays(START_DAY, 3));
    e.s.modules.gags!.peak = 10;
    until(e, addTradingDays(START_DAY, 20));
    expect(e.modules().gags!.stress).toBeGreaterThan(0.3);
  });

  it('Enrun: clues for months, then −95% and bankruptcy; one fraud at a time', () => {
    const texts = stories(long, 'gags.enrun').map((n) => n.text);
    const e = game({ ...NONE, gags: true });
    until(e, addTradingDays(START_DAY, 25));
    const g = e.s.modules.gags!;
    const energy = e.companies.map((c, i) => [c, i] as const).filter(([c]) => c.industry.id === 'oilGas').sort((a, b) => b[0].marketCap - a[0].marketCap)[0][1];
    g.fraud = { company: energy, stage: 0, next: dayOf(e.time) + 1 };
    const price = e.market.price[energy];
    until(e, addTradingDays(dayOf(e.time), 120));
    const told = stories(e, 'gags.enrun').map((n) => n.text);
    expect(told).toEqual(['gags.enrunCfo', 'gags.enrunAuditor', 'gags.enrunFilings', 'gags.enrunCollapse']);
    expect(e.market.state.status[energy]).toBe(2);
    expect(e.market.price[energy]).toBeLessThan(price * 0.1);
    expect(g.fraud).toBeUndefined();
    expect(texts.filter((t) => t === 'gags.enrunCollapse').length).toBeLessThanOrEqual(2);
  });

  it('Darts Capital beats the firm now and then, and Barren’s says so', () => {
    const d = long.s.modules.gags!.darts;
    expect(d.wins + d.losses).toBeGreaterThanOrEqual(8);
    const told = stories(long, 'gags.darts');
    expect(told.length).toBe(d.wins);
    expect(told.every((n) => n.outlets?.includes('barrens'))).toBe(true);
  });

  it('pizza deliveries know the audit: decided two weeks ahead, and the SOB follows it', () => {
    const e = game({ ...NONE, gags: true });
    e.s.regulator.heat = 100;
    const month = dayAt(1998, 2, 2);
    until(e, month - 10);
    const pizza = e.modules().gags!.pizza!;
    expect(pizza.month).toBe(1998 * 12 + 2);
    expect(pizza.decided).toBeLessThan(month);
    e.s.modules.gags!.pizza!.audit = false;
    e.s.regulator.heat = 100;
    until(e, month);
    expect(e.s.regulator.audit).toBeUndefined();
  });

  it('Mom’s club takes a tip, and stops writing after a bad one', () => {
    const e = game({ ...NONE, gags: true });
    e.advanceTo(at(START_DAY, OPEN + 30));
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 500, tif: 'day' });
    until(e, dayAt(1998, 1, 3));
    const ask = e.mail().messages.find((m) => m.kind === 'momClub')!;
    expect(ask.options).toContain(3);
    expect(e.mailAction(ask.id, `tip${ask.options!.indexOf(3)}` as 'tip0')).toBeUndefined();
    expect(e.s.modules.gags!.mom.tip!.company).toBe(3);
    // The stock she bought falls hard.
    e.s.modules.gags!.mom.tip!.price = e.market.price[3] * 2;
    until(e, dayAt(1998, 2, 3));
    const upset = e.mail().messages.filter((m) => m.kind === 'momClub').at(-1)!;
    expect(upset.variant).toBe(1);
    // Three months of silence, then she writes again.
    until(e, dayAt(1998, 4, 29));
    expect(e.mail().messages.filter((m) => m.kind === 'momClub').length).toBe(2);
    until(e, dayAt(1998, 5, 5));
    expect(e.mail().messages.filter((m) => m.kind === 'momClub').length).toBe(3);
  });

  it('a mystery buyer files through shells, then bids; a goat CEO does suspiciously well', () => {
    const e = game({ ...NONE, gags: true });
    until(e, addTradingDays(START_DAY, 3));
    const g = e.s.modules.gags!;
    g.mystery = { target: 40, stake: 0, filings: 3, next: dayOf(e.time) + 1, shell: 'Pelican Holdings Ltd.' };
    until(e, addTradingDays(dayOf(e.time), 80));
    expect(stories(e, 'gags.mystery').length).toBe(3);
    expect(e.s.events.plans.some((p) => p.kind === 'takeover' && p.company === 40) || e.s.events.news.some((n) => n.kind === 'takeover' && n.company === 40)).toBe(true);
    expect(stories(long, 'gags.goat').length).toBeLessThanOrEqual(1);
  });

  it('the stars and the hemlines are right a little more often than not', () => {
    // Measured over four worlds and a hundred weeks each: 54% (spec: ~55%). Here, the long game's hundred-odd weeks.
    const level = new Map(long.s.stats.map(([day, , index]) => [day, index]));
    const calls = long.s.modules.gags!.calls;
    let agree = 0;
    for (let k = 0; k + 1 < calls.length; k++) {
      const move = level.get(calls[k + 1][0])! - level.get(calls[k][0])!;
      if (Math.sign(move) === calls[k][1]) agree++;
    }
    expect(calls.length).toBeGreaterThan(100);
    const share = agree / (calls.length - 1);
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.65);
  });
});

describe('switching modules mid-game, and saving them (spec §16C, §18)', () => {
  it('each module toggles cleanly: state made once, kept while off, nothing happens while off, storylines wrap up', () => {
    const e = game(NONE);
    until(e, addTradingDays(START_DAY, 20));
    e.setModules(ALL);
    expect(Object.keys(e.s.modules).sort()).toEqual(['gags', 'geo', 'period']);
    until(e, addTradingDays(START_DAY, 80));
    const g = e.s.modules.gags!;
    g.fraud = { company: 1, stage: 1, next: dayOf(e.time) + 1 };
    e.s.modules.geo!.tensions[PAIRS[0].id] = { rung: 3, since: dayOf(e.time) };
    e.setModules(NONE);
    const leaders = structuredClone(e.s.modules.geo!.leaders);
    // Wrapped up quietly: no collapse to come, no tension left, no story told.
    expect(g.fraud).toBeUndefined();
    expect(e.s.modules.geo!.tensions).toEqual({});
    const told = e.s.events.news.length;
    const rng = structuredClone(e.exportState().rng);
    until(e, addTradingDays(START_DAY, 140));
    expect(e.s.events.news.slice(told).filter((n) => n.kind === 'story' && /^(geo|period|gags)\./.test(n.text ?? ''))).toEqual([]);
    const after = e.exportState().rng;
    for (const k of ['geo', 'period', 'gags'] as const) expect(after[k]).toEqual(rng[k]);
    // Back on: the same world, not a new one.
    e.setModules({ ...NONE, geopolitics: true });
    expect(e.s.modules.geo!.leaders).toEqual(leaders);
    until(e, addTradingDays(START_DAY, 220));
    expect(stories(e, 'geo.').some((n) => dayOf(n.time) > addTradingDays(START_DAY, 140))).toBe(true);
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 3);
  });

  it('save test: 60 days, save, load, 60 more with modules on and switched = 120 days without saving', () => {
    const settings = withModules(changeSettings(DIFFICULTIES.hard, { startingCapital: 5_000_000 }), { geopolitics: true, periodEvents: false, gags: true });
    const straight = Engine.create(world, { settings, firmName: 'Saved' });
    let saved = Engine.create(world, { settings, firmName: 'Saved' });
    let day = START_DAY;
    for (let s = 0; s < 120; s++, day = addTradingDays(day, 1)) {
      for (const e of [straight, saved]) {
        e.advanceTo(at(day, 10 * 60 + 30));
        if (s % 4 === 0) e.placeOrder({ company: (s * 29) % 900, side: 'buy', type: 'market', shares: 200, tif: 'day' });
        if (s === 5) e.setModules({ geopolitics: true, periodEvents: true, gags: true });
        if (s === 6) e.tamagotcha({ do: 'adopt', name: 'Saved' });
        if (s === 30) e.tamagotcha({ do: 'feed' });
        if (s === 70) e.setModules({ geopolitics: false, periodEvents: true, gags: true });
        if (s === 90) e.setModules({ geopolitics: true, periodEvents: true, gags: true });
        for (const m of e.mail().messages) if (m.kind === 'momClub' && !m.answer) e.mailAction(m.id, m.options?.length ? 'tip0' : 'noTip');
      }
      if (s === 60) {
        saved.advanceTo(at(day, 11 * 60));
        saved = saveAndLoad(saved);
      }
      for (const e of [straight, saved]) e.advanceTo(at(day, CLOSE));
    }
    expect(difference(saved.exportState(), straight.exportState())).toBeUndefined();
    const s = saved.exportState();
    expect(s.settings.modules).toEqual(ALL);
    expect(s.modules.period!.tamagotcha).toMatchObject({ name: 'Saved' });
    expect(s.mail.messages.some((m) => m.kind === 'momClub' && m.answer === 'done')).toBe(true);
    expect(s.events.news.filter((n) => n.kind === 'story' && /^(geo|period|gags)\./.test(n.text ?? '')).length).toBeGreaterThan(10);
  }, 60_000);

  it('upgrades a version 8 save: module state and streams where the game stands, modules switched on in Setup started', () => {
    const e = game(NONE);
    until(e, addTradingDays(START_DAY, 10));
    const state = e.exportState() as SimState & { modules?: unknown };
    delete (state as { modules?: unknown }).modules;
    for (const k of ['geo', 'period', 'gags'] as const) delete (state.rng as Partial<SimState['rng']>)[k];
    // A Phase 10 game whose Setup had the Geopolitics box ticked, when it did nothing yet.
    state.settings.modules = { ...NONE, geopolitics: true };
    const manifest = { format: SAVE_FORMAT, version: 8, name: 'Old', firmName: 'Old', gameTime: 0, netWorth: 0, savedAt: 0 } as const;
    const loaded = Engine.restore(migrate(unpackSave(packSave({ manifest, sim: state }))).sim as SimState);
    expect(Object.keys(loaded.s.modules)).toEqual(['geo']);
    expect(loaded.s.rng.gags).toEqual(game(NONE).exportState().rng.gags);
    until(loaded, addTradingDays(START_DAY, 120));
    expect(stories(loaded, 'geo.').length).toBeGreaterThan(0);
  });
});
