// @vitest-environment happy-dom
import { readFileSync } from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { agedCeo } from '../src/art/portrait/variants';
import { Portrait } from '../src/art/portrait/Portrait';
import { CLOSE, START_DAY, addTradingDays, at, dayOf } from '../src/sim/calendar';
import { COUNTRIES } from '../src/sim/data/countries';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { STORIES } from '../src/sites/data/articles';
import { writeArticle } from '../src/sites/news/articles';
import { coverage } from '../src/sim/press';
import { OUTLET } from '../src/sim/data/outlets';
import { PIZZA, WEATHER, companyUrl, sites } from '../src/sites/urls';
import { writeLetter } from '../src/apps/mail/letters';
import { decodeCeo, randomCeo } from '../src/world/ceo';
import { Rng } from '../src/world/rng';
import { generateWorld } from '../src/world/generator';
import { button, clean, click, connect, render, site, unmount } from './harness';

// Phase 10B (spec §16C): the fun modules on screen — Encarter 98, the switches in My Computer, the tension meter, the
// horoscope, the pizza page, El Niño, the goat, the greying CEO, the Tamagotcha — and every story they tell.

vi.mock('../src/sim/client', async () => (await import('./worker')).client);

const FIRM = 'Module Capital';
const ALL = { geopolitics: true, periodEvents: true, gags: true };
let engine: Engine;

beforeAll(() => {
  const world = generateWorld({ seed: 'phase 10b ui', companyCount: 800 });
  engine = Engine.create(world, { settings: { ...DIFFICULTIES.medium, modules: ALL }, firmName: FIRM });
  // Into 1999: the mania under way, LTCM and COMDEXX behind us, a year of the world's news.
  engine.advanceTo(at(Date.UTC(1999, 1, 1) / 86_400_000, CLOSE));
  // A pair at odds, for the meters; a goat, for the leadership page; El Niño, for the weather.
  engine.s.modules.geo!.tensions['usga-mexico'] = { rung: 3, since: dayOf(engine.time) };
  engine.s.modules.gags!.goat = { company: 77, since: dayOf(engine.time), until: dayOf(engine.time) + 100 };
  engine.s.modules.period!.elNino = { from: dayOf(engine.time), to: dayOf(engine.time) + 60 };
  connect(engine, FIRM);
}, 120_000);

afterEach(unmount);

describe('the modules’ stories (spec §16C)', () => {
  it('has copy for every story the modules can tell', () => {
    const told = new Set<string>();
    for (const [file, prefix] of [['src/sim/geo.ts', 'geo'], ['src/sim/period.ts', 'period'], ['src/sim/gags.ts', 'gags']] as const) {
      for (const m of readFileSync(file, 'utf8').matchAll(/story\(sim, '(\w+)'/g)) told.add(`${prefix}.${m[1]}`);
    }
    for (let r = 1; r <= 5; r++) told.add(`geo.rung${r}`);
    for (const t of ['geo.calm', 'geo.ceasefire', 'geo.letter', 'geo.rhetoricOnly', 'geo.referendumYes', 'geo.referendumNo', 'geo.coup', 'geo.election', 'geo.regionalUp', 'geo.regionalDown', 'period.neverSplit']) told.add(t);
    expect(told.size).toBeGreaterThan(45);
    for (const t of told) expect(STORIES[t], t).toBeDefined();
  });

  it('writes every module story in the game without gaps, in every outlet that runs it', () => {
    const directory = engine.directory();
    const items = engine.s.events.news.filter((n) => n.kind === 'story' && /^(geo|period|gags)\./.test(n.text ?? ''));
    expect(new Set(items.map((n) => n.text)).size).toBeGreaterThan(20);
    for (const item of items) {
      const outlets = coverage(item, engine.journalists(), undefined).map((a) => a.outlet.id);
      expect(outlets.length, item.text).toBeGreaterThan(0);
      for (const outlet of outlets) {
        const a = writeArticle(item, outlet, directory, FIRM, engine.seed, engine.journalists());
        const text = [a.headline, ...a.paragraphs].join(' ');
        expect(text, `${item.text} ${outlet}`).not.toMatch(/undefined|NaN|\{(?!c:)\w+\}|\[object/);
      }
    }
  });
});

describe('Encarter 98 (spec §16C.1)', () => {
  it('draws the world from Natural Earth, merged into the module’s countries, with Nope greyed out', async () => {
    const { default: Encarter } = await import('../src/apps/encarter/Encarter');
    const el = await render(<Encarter windowId="w-encarter" appId="encarter" />);
    // The atlas loads on first use.
    for (let k = 0; k < 20 && !el.querySelector('svg[aria-label="World map"]'); k++) await new Promise((r) => setTimeout(r, 50));
    const shapes = el.querySelectorAll('[data-country]');
    const ids = new Set([...shapes].map((s) => s.getAttribute('data-country')));
    for (const c of COUNTRIES) expect(ids.has(c.id), c.id).toBe(true);
    expect(el.querySelector('[data-country="nope"]')!.getAttribute('fill')).toBe('#9a9a9a');
    // Hover: the name, the line, the leader.
    const usga = el.querySelector('[data-country="usga"]')!;
    usga.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 80 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.textContent).toMatch(/Annexed Canada and Greenland/);
    expect(el.textContent).toMatch(/President Chuck Hardwell|President \w+/);
    // Click: the country's page, and the pair at odds.
    await click(usga);
    expect(el.textContent).toMatch(/Stability/);
    expect(el.textContent).toMatch(/Mexico/);
    expect(el.textContent).toMatch(/sanctions since/);
    // Nope can't be opened.
    await click(el.querySelector('[data-country="nope"]')!);
    expect(el.querySelector('.encarter-page h3')!.textContent).toBe('United States of Greater America');
    const nope = el.querySelector('[data-country="nope"]')!;
    nope.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 100 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(el.textContent).toMatch(/We’re not doing this part/);
    clean(el);
  });

  it('draws the gag leaders as the table says: a penguin, a silhouette, a censor’s blur', () => {
    const ceo = randomCeo(Rng.stream('x', 'y'));
    expect(renderToStaticMarkup(<Portrait ceo={ceo} variant="penguin" />)).toMatch(/<svg/);
    expect(renderToStaticMarkup(<Portrait ceo={ceo} variant="goat" />)).toMatch(/<svg/);
    expect(renderToStaticMarkup(<Portrait ceo={ceo} variant="silhouette" />)).toMatch(/\?/);
    expect(renderToStaticMarkup(<Portrait ceo={ceo} variant="blur" />)).toMatch(/portrait-censored/);
    expect(COUNTRIES.find((c) => c.id === 'antarctica')!.leader.portrait).toBe('penguin');
    expect(COUNTRIES.find((c) => c.id === 'nope')!.leader.portrait).toBe('blur');
    // No leader wears a toothbrush moustache.
    for (const l of Object.values(engine.modules().geo!.leaders)) expect(decodeCeo(l.ceo).facialHair).not.toBe(11);
  });
});

describe('the modules elsewhere on screen (spec §16C)', () => {
  it('switches modules on and off in My Computer → Game', async () => {
    const { GamePanel } = await import('../src/apps/mycomputer/GamePanel');
    const el = await render(<GamePanel />);
    const box = [...el.querySelectorAll('label')].find((l) => /Recurring gags/.test(l.textContent ?? ''))!;
    const input = el.querySelector<HTMLInputElement>(`#${CSS.escape(box.htmlFor)}`)!;
    expect(input.checked).toBe(true);
    await click(input);
    expect(engine.settings.modules.gags).toBe(false);
    await click(input);
    expect(engine.settings.modules.gags).toBe(true);
    expect(engine.s.modules.gags).toBeDefined();
  });

  it('puts a tension meter on the news sites, a horoscope in the Daily Scoop and El Niño on the Weather Bureau', async () => {
    let el = await site('http://newswire.majorsoft.com/');
    expect(el.textContent).toMatch(/World Tension Meter/);
    expect(el.textContent).toMatch(/sanctions/);
    el = await site(`http://${OUTLET.dailyscoop.host}/`);
    expect(el.textContent).toMatch(/STOCK HOROSCOPE/);
    expect(el.textContent).toMatch(/HEMLINE INDEX/);
    clean(el);
    el = await site(`http://${WEATHER}/`);
    expect(el.textContent).toMatch(/EL NIÑO ADVISORY/);
  });

  it('shows the pizza chain’s delivery hotspots only with the gags module on', async () => {
    let el = await site(`http://${PIZZA}/`);
    expect(el.textContent).toMatch(/Securities Oversight Bureau/);
    clean(el);
    engine.setModules({ ...ALL, gags: false });
    connect(engine, FIRM);
    el = await site(`http://${PIZZA}/`);
    expect(el.textContent).toMatch(/cannot be displayed/);
    engine.setModules(ALL);
    connect(engine, FIRM);
  });

  it('shows the goat on its company’s leadership page', async () => {
    const s = sites(engine.directory(), FIRM);
    const el = await site(companyUrl(s, 77, 'about.html'));
    expect(el.textContent).toMatch(/Billy G\. Oat/);
  });

  it('greys the chief executive in drawdowns', () => {
    const ceo = randomCeo(Rng.stream('ceo', 'grey'));
    const old = agedCeo(ceo, 0.9);
    expect(old.ceoAge).toBeGreaterThan(ceo.ceoAge);
    expect(old.customHair).toBeDefined();
    expect(agedCeo(ceo, 0)).toBe(ceo);
    expect(renderToStaticMarkup(<Portrait ceo={old} />)).not.toBe(renderToStaticMarkup(<Portrait ceo={ceo} />));
  });

  it('writes Mom’s club letters, and runs the Tamagotcha', async () => {
    const ctx = { directory: engine.directory(), firmName: FIRM, ceoName: engine.player.ceoName, seed: engine.seed, clients: new Map(), news: new Map() };
    const mom = engine.mail().messages.filter((m) => m.kind === 'momClub');
    expect(mom.length).toBeGreaterThan(5);
    for (const m of mom) {
      const letter = writeLetter(m, ctx);
      expect(letter.from).toMatch(/Mom/);
      expect(JSON.stringify(letter)).not.toMatch(/undefined|NaN/);
    }
    const { default: Tamagotcha } = await import('../src/apps/tamagotcha/Tamagotcha');
    const el = await render(<Tamagotcha windowId="w-t" appId="tamagotcha" />);
    await click(button(el, 'Hatch'));
    expect(engine.modules().period!.tamagotcha!.alive).toBe(true);
    expect(el.textContent).toMatch(/Feed/);
    engine.advanceTo(at(addTradingDays(dayOf(engine.time), 1), CLOSE));
    expect(START_DAY).toBeLessThan(dayOf(engine.time));
  });
});
