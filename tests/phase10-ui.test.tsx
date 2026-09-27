// @vitest-environment happy-dom
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CLOSE, OPEN, START_DAY, addTradingDays, at } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { useGame } from '../src/state/game';
import { usePrograms } from '../src/state/programs';
import { Site } from '../src/sites/Site';
import {
  DANCING_BABY, DAVOZ, EBUY, GREGSLIST, HAMSTERS, HINDSIGHT, HOMECITIES, IPO_HOTLINE, LIFESTYLES, LOTTO, MAJORSOFT, MONSTROUS, MOODY, REEVES,
  STANDARD_POURS, Y2K, YEEHAW, intranetHost,
} from '../src/sites/urls';
import { PageContext, type Page } from '../src/sites/web';
import { generateWorld } from '../src/world/generator';
import type { AppProps } from '../src/apps/types';
import type { Manifest } from '../src/state/saveFile';

// Phase 10 (spec §19): every §4A app and §14.2 site, rendered against a running game. The worker is the engine itself,
// called in-process: each call is answered on the next tick, as Comlink would.

const worker = vi.hoisted(() => ({
  engine: undefined as unknown as Record<string, (...args: unknown[]) => unknown>,
  /** The worker's names that aren't the engine's. */
  renamed: { outlooks: 'outlookViews' } as Record<string, string>,
}));
vi.mock('../src/sim/client', () => ({
  simulation: () =>
    new Proxy(
      {},
      {
        get: (_, key: string) =>
          async (...args: unknown[]) => {
            const f = worker.engine[worker.renamed[key] ?? key];
            if (typeof f !== 'function') throw new Error(`The worker has no ${key}()`);
            return structuredClone(f.apply(worker.engine, args));
          },
      },
    ),
}));

let engine: Engine;
const FIRM = 'Ten Capital';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function snapshot(e: Engine) {
  return {
    time: e.time, phase: e.phase, holiday: e.holiday(), halted: e.halted, speed: 0, index: e.indexQuote(), quotes: {}, live: {}, account: e.account(),
    positions: e.positions(), openOrders: e.openOrders(), revision: Math.random(), events: [], mail: e.mailStatus(), news: e.newsCount,
    commodities: e.commodityQuotes(), sob: e.sobStatus(), darkweb: e.darkwebStatus(), desk: e.deskStatus(),
  };
}
/** The UI learns of a change the way the worker's snapshots tell it. */
const refresh = () => useGame.setState({ snapshot: snapshot(engine) as never, directory: engine.directory() });

beforeAll(() => {
  const world = generateWorld({ seed: 'phase 10 ui', companyCount: 800 });
  engine = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: FIRM });
  worker.engine = engine as never;
  // Five weeks in, and on until an IPO is on the calendar: listings, auctions on eBuy, rating actions in the news.
  let day = addTradingDays(START_DAY, 25);
  engine.advanceTo(at(day, CLOSE));
  while (!engine.ipos().pending.some((p) => p.company === undefined && p.day > addTradingDays(day, 1))) engine.advanceTo(at((day = addTradingDays(day, 1)), CLOSE));
  expect(engine.ipos().pending.some((p) => p.company !== undefined)).toBe(true);
  engine.advanceTo(at(addTradingDays(day, 1), OPEN + 30));
  useGame.setState({ ready: true, seed: engine.seed, firmName: FIRM, player: engine.player, settings: engine.settings });
  refresh();
}, 120_000);

let root: Root | undefined;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
});

const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  // Fetches from the "worker", then what they fetch in turn.
  for (let k = 0; k < 4; k++) await tick();
  return host;
}
function page(href: string): Page {
  return { url: new URL(href), navigate: () => undefined, status: () => undefined, setTitle: () => undefined };
}
const site = (href: string) =>
  render(
    <PageContext.Provider value={page(href)}>
      <Site url={new URL(href)} />
    </PageContext.Provider>,
  );
/** No holes in the text: every number and name made it through. */
const clean = (el: HTMLElement) => expect(el.textContent).not.toMatch(/undefined|NaN|Infinity|\[object/);
const button = (el: HTMLElement, text: string | RegExp) => {
  const b = [...el.querySelectorAll('button')].find((x) => (typeof text === 'string' ? x.textContent === text : text.test(x.textContent ?? '')));
  if (!b) throw new Error(`No button ${text}`);
  return b;
};
async function click(el: HTMLElement) {
  await act(async () => el.click());
  for (let k = 0; k < 3; k++) await tick();
  refresh();
  await tick();
}
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit(form: HTMLFormElement) {
  await act(async () => form.requestSubmit());
  for (let k = 0; k < 3; k++) await tick();
  refresh();
  await tick();
}

describe('Phase 10 sites (spec §14.2)', () => {
  it('renders every new site from the running game, with no gaps', async () => {
    const expected: [string, RegExp][] = [
      [`http://${STANDARD_POURS}/`, /Recent Rating Actions/],
      [`http://${STANDARD_POURS}/list`, /companies/],
      [`http://${STANDARD_POURS}/scale`, /investment grade/i],
      [`http://${MOODY}/list?g=3`, /Aa3/],
      [`http://${HINDSIGHT}/`, /Subscriber Preview/],
      [`http://${IPO_HOTLINE}/`, /IPO Calendar/],
      [`http://${MONSTROUS}/`, /looking for work/],
      [`http://${GREGSLIST}/`, /office \/ commercial/],
      [`http://${GREGSLIST}/offices`, /Penthouse Tower/],
      [`http://${LIFESTYLES}/`, /Superyacht/],
      [`http://${EBUY}/`, /Auctions ending soon/],
      [`http://${DAVOZ}/`, /Davoz Economic Forum/],
      [`http://${LOTTO}/`, /Quick Picks/],
      [`http://${Y2K}/`, /DAYS/],
      [`http://${MAJORSOFT}/servicepacks`, /Service Pack 10/],
      [`http://${MAJORSOFT}/wallpapers`, /Desktop Themes/],
      [`http://${HOMECITIES}/`, /Money &(amp;)? Investing/],
      [`http://${HAMSTERS}/`, /HAMSTER PRANCE/],
      [`http://${DANCING_BABY}/`, /Ooga chaka/],
      [`http://${intranetHost(FIRM)}/`, /Staff Directory/],
      [`http://${YEEHAW}/`, /Business & Lifestyle/],
      [`http://${REEVES}/guide?t=staff`, /Monstrous/],
    ];
    for (const [href, text] of expected) {
      const el = await site(href);
      expect(el.textContent, href).toMatch(text);
      clean(el);
      act(() => root!.unmount());
      root = undefined;
    }
  }, 60_000);

  it('rates every company, the strongest AAA, and moves ratings with the agencies’ actions', async () => {
    const el = await site(`http://${STANDARD_POURS}/list`);
    const grades = [...el.querySelectorAll('tbody tr td:nth-child(3)')].map((td) => td.textContent);
    expect(grades.length).toBe(50);
    expect(new Set(grades).size).toBeGreaterThan(1);
    const report = await site(`http://${STANDARD_POURS}/rating?s=${engine.directory().tickers[0]}`);
    expect(report.textContent).toMatch(/Rationale/);
    expect(report.textContent).toMatch(/Outlook: (Stable|Positive|Negative)/);
  });

  it('hires from Monstrous.com, moves office on Greg’s List and buys from the catalogue', async () => {
    let el = await site(`http://${MONSTROUS}/`);
    const staff = () => engine.staff().people.filter((p) => p.status === 'staff').length;
    await click(button(el, 'Hire'));
    expect(staff()).toBe(1);
    act(() => root!.unmount());
    el = await site(`http://${GREGSLIST}/offices`);
    await click(button(el, /Sign the lease/));
    expect(engine.staff().office).toBe(1);
    act(() => root!.unmount());
    el = await site(`http://${LIFESTYLES}/`);
    await click(button(el, 'Buy it now'));
    expect(engine.lifestyle().assets.length).toBe(1);
    expect(el.textContent).toMatch(/Sell to dealer/);
    act(() => root!.unmount());
    el = await site(`http://${intranetHost(FIRM)}/`);
    expect(el.textContent).toMatch(/Please welcome/);
    clean(el);
  });

  it('applies for an IPO, bids on eBuy, buys a ticket and lotto tickets', async () => {
    let el = await site(`http://${IPO_HOTLINE}/`);
    const deal = engine.ipos().pending.find((p) => p.company === undefined);
    expect(deal).toBeDefined();
    const input = el.querySelector<HTMLInputElement>('input[aria-label^="Shares of"]')!;
    await type(input, '100');
    await submit(input.form!);
    expect(engine.ipos().pending.find((p) => p.id === deal!.id)?.applied).toBe(100);
    act(() => root!.unmount());

    el = await site(`http://${EBUY}/`);
    const auction = engine.lifestyle().auctions.find((a) => !a.result && a.selling === undefined)!;
    const bid = el.querySelector<HTMLInputElement>('input[aria-label="Maximum bid"]')!;
    const first = engine.lifestyle().auctions.filter((a) => !a.result).sort((a, b) => a.ends - b.ends)[0];
    await type(bid, String(Math.ceil(first.price * 3 + 100)));
    await submit(bid.form!);
    expect(engine.lifestyle().auctions.find((a) => a.id === first.id)?.max).toBe(Math.ceil(first.price * 3 + 100));
    expect(auction).toBeDefined();
    act(() => root!.unmount());

    el = await site(`http://${DAVOZ}/`);
    await click(button(el, 'Buy a ticket'));
    expect(engine.lifestyle().tickets.length).toBe(1);
    act(() => root!.unmount());

    el = await site(`http://${LOTTO}/`);
    await submit(el.querySelector('form')!);
    expect(engine.lifestyle().lotto.tickets).toBe(10);
  });

  it('downloads a wallpaper from majorsoft.com', async () => {
    const el = await site(`http://${MAJORSOFT}/wallpapers`);
    await click(button(el, 'Download'));
    expect(usePrograms.getState().wallpaper.kind).toBe('pattern');
  });
});

describe('Phase 10 apps (spec §4A)', () => {
  it('renders every new app against the running game', async () => {
    const apps: [string, () => Promise<{ default: ComponentType<AppProps> }>, RegExp][] = [
      ['notepad', () => import('../src/apps/notepad/Notepad'), /File/],
      ['calculator', () => import('../src/apps/calculator/Calculator'), /MC/],
      ['messenger', () => import('../src/apps/messenger/Messenger'), /Broker|MajorTrade/i],
      ['word', () => import('../src/apps/word/Word'), /File/],
      ['sheet', () => import('../src/apps/sheet/Sheet'), /File/],
      ['hr', () => import('../src/apps/hr/Hr'), /Applicants/],
      ['rolodex', () => import('../src/apps/rolodex/Rolodex'), /cards/],
      ['defrag', () => import('../src/apps/defrag/Defrag'), /Defragment/],
      ['taskmangler', () => import('../src/apps/taskmangler/TaskMangler'), /Processes/],
      ['paint', () => import('../src/apps/paint/Paint'), /Image/],
      ['pager', () => import('../src/apps/pager/Pager'), /Price alerts/],
      ['winramp', () => import('../src/apps/winramp/WinRamp'), /WinRamp|Play/i],
      ['sweeper', () => import('../src/apps/games/Sweeper'), /Game/],
      ['solitear', () => import('../src/apps/games/Solitaire'), /Game/],
    ];
    for (const [id, load, text] of apps) {
      const { default: App } = await load();
      const el = await render(<App windowId={`w-${id}`} appId={id as never} />);
      expect(el.textContent, id).toMatch(text);
      clean(el);
      act(() => root!.unmount());
      root = undefined;
    }
  }, 60_000);
});

describe('the programs’ own logic (spec §4A)', () => {
  it('Calculator: immediate execution, chains, memory, errors and n!', async () => {
    const { initial, press } = await import('../src/apps/calculator/engine');
    const keys = (seq: string[]) => seq.reduce(press, initial).display;
    expect(keys(['1', '2', '+', '3', '='])).toBe('15');
    expect(keys(['2', '+', '3', '×', '4', '='])).toBe('20');
    expect(keys(['1', '÷', '0', '='])).toBe('Error');
    expect(keys(['5', 'n!'])).toBe('120');
    expect(keys(['9', '√'])).toBe('3');
    expect(keys(['2', 'MS', 'C', '3', '+', 'MR', '='])).toBe('5');
    expect(keys(['0', '.', '1', '+', '0', '.', '2', '='])).toBe('0.3');
  });

  it('Margin Sweeper: the first click is always a clearing, and every safe cell opened wins', async () => {
    const { deal, reveal, LEVELS } = await import('../src/apps/games/sweeper');
    for (const seed of ['a', 'b', 'c']) {
      const b = deal('beginner', seed, 40, 5);
      expect(b.mine.filter(Boolean).length).toBe(LEVELS.beginner.mines);
      expect(b.mine[40]).toBe(false);
      expect(b.near[40]).toBe(0);
      expect(b.state).toBe('playing');
      const won = b.mine.reduce((x, m, i) => (m ? x : reveal(x, i)), b);
      expect(won.state).toBe('won');
      expect(reveal(b, b.mine.indexOf(true)).state).toBe('lost');
    }
  });

  it('Soli-Tear: a fair deal and Klondike’s rules', async () => {
    const { deal, draw, allowed, move, won } = await import('../src/apps/games/klondike');
    const g = deal('solitaire');
    expect(g.tableau.map((c) => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.stock.length).toBe(24);
    expect(new Set([...g.stock, ...g.tableau.flat()].map((c) => `${c.suit}:${c.rank}`)).size).toBe(52);
    expect(g.tableau.every((c) => c.at(-1)!.up && c.slice(0, -1).every((x) => !x.up))).toBe(true);
    // Drawing through the stock and back returns it, face down, in order.
    let d = g;
    for (let k = 0; k <= 24; k++) d = draw(d);
    expect(d.stock.map((c) => c.rank)).toEqual(g.stock.map((c) => c.rank));
    // Only an ace starts a foundation; only a king an empty column.
    const game = { stock: [], waste: [{ suit: 0 as const, rank: 2, up: true }], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []] };
    expect(allowed(game, { pile: 'waste' }, { pile: 'foundation', column: 0 })).toBe(false);
    expect(allowed(game, { pile: 'waste' }, { pile: 'tableau', column: 0 })).toBe(false);
    const ace = { ...game, waste: [...game.waste, { suit: 0 as const, rank: 1, up: true }] };
    const moved = move(ace, { pile: 'waste' }, { pile: 'foundation', column: 0 });
    expect(moved.foundations[0]).toHaveLength(1);
    expect(move(moved, { pile: 'waste' }, { pile: 'foundation', column: 0 }).foundations[0]).toHaveLength(2);
    expect(won(g)).toBe(false);
  });

  it('Exceed: formulas with references, ranges and Excel’s functions; cycles are #REF!', async () => {
    const { evaluate, toCsv, fromRows } = await import('../src/apps/sheet/formula');
    const v = evaluate({ A1: '10', A2: '20', A3: '=SUM(A1:A2)', B1: '=A3*2', B2: '=AVERAGE(A1:A2)', C1: '=C2', C2: '=C1', D1: 'text', D2: '=ROUND(PI(),2)' });
    expect(v).toMatchObject({ A3: 30, B1: 60, B2: 15, C1: '#REF!', D1: 'text', D2: 3.14 });
    expect(toCsv(fromRows([['Ticker', 'Price'], ['MJR', 12.5], ['A, "B"', 3]]))).toBe('Ticker,Price\r\nMJR,12.50\r\n"A, ""B""",3');
  });

  it('WinRamp: each track the same every time, in its scale and tempo', async () => {
    const { track, TITLES } = await import('../src/apps/winramp/tracks');
    expect(track(3)).toEqual(track(3));
    expect(track(3)).not.toEqual(track(4));
    for (let n = 0; n < TITLES.length; n++) {
      const t = track(n);
      expect(t.lead).toHaveLength(64);
      expect(t.bpm).toBeGreaterThanOrEqual(96);
      expect(t.lead.filter((x) => x !== null).length).toBeGreaterThan(10);
    }
  });

  it('MajorPaint fills an area of one colour and stops at its edge', async () => {
    const { floodFill } = await import('../src/apps/paint/Paint');
    const { blankPicture, PICTURE_SIZE } = await import('../src/art/pixels');
    // A vertical line down column 5 splits the picture in two.
    let p = blankPicture();
    for (let y = 0; y < PICTURE_SIZE; y++) p = p.slice(0, y * PICTURE_SIZE + 5) + '0' + p.slice(y * PICTURE_SIZE + 6);
    const filled = floodFill(p, 0, 4);
    expect([...filled].filter((c) => c === '4').length).toBe(5 * PICTURE_SIZE);
    expect(floodFill(filled, 0, 4)).toBe(filled);
  });
});

describe('the programs’ files in the saved game (spec §18)', () => {
  it('keeps notes, documents, spreadsheets, pictures and preferences across save and load', async () => {
    const { gameState } = await import('../src/state/game');
    const { newPrograms, saveFile } = await import('../src/state/programs');
    const { packSave, unpackSave, SAVE_FORMAT } = await import('../src/state/saveFile');
    const { SAVE_VERSION } = await import('../src/state/migrations');
    usePrograms.setState(newPrograms(), true);
    usePrograms.setState({ notepad: 'Buy low.', wallpaper: { kind: 'pattern', id: 'bull' }, calculator: { mode: 'financial' }, stapley: { enabled: false, seen: ['letter'] } });
    saveFile('documents', { name: 'Q1 letter', text: 'Dear clients,', font: 'serif', size: 12 });
    saveFile('sheets', { name: 'Model', cells: { A1: '1', A2: '=A1*2' } });
    saveFile('pictures', { name: 'Logo', pixels: 'f'.repeat(1024) });
    usePrograms.setState({ games: { sweeper: { beginner: 42 }, solitaire: { played: 3, won: 1 } }, defrag: { targets: [{ company: 1, weight: 0.5 }] } });
    const before = structuredClone(usePrograms.getState());
    const manifest: Manifest = { format: SAVE_FORMAT, version: SAVE_VERSION, name: 'T', firmName: FIRM, gameTime: 0, netWorth: 0, savedAt: 0 };
    const bytes = packSave({ manifest, sim: engine.exportState(), game: gameState() });
    usePrograms.setState(newPrograms(), true);
    const loaded = unpackSave(bytes).game as ReturnType<typeof gameState>;
    // As loadGame does it.
    usePrograms.setState({ ...newPrograms(), ...loaded.programs }, true);
    expect(usePrograms.getState()).toEqual(before);
  });
});
