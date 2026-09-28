// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, START_DAY, addTradingDays, at } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { useGame } from '../src/state/game';
import { DEFAULT_PREFS, usePrefs } from '../src/state/prefs';
import { usePrograms, newPrograms } from '../src/state/programs';
import { useShell } from '../src/state/shell';
import { useWindows } from '../src/state/windows';
import { generateWorld } from '../src/world/generator';
import Help from '../src/apps/help/Help';
import { DisplayPanel } from '../src/apps/mycomputer/DisplayPanel';
import { GamePanel } from '../src/apps/mycomputer/GamePanel';
import { SoundsPanel } from '../src/apps/mycomputer/SoundsPanel';
import { Screensaver, useIdleSaver } from '../src/shell/Screensaver';
import { StartMenu } from '../src/shell/StartMenu';
import { onShortcut } from '../src/shell/shortcuts';
import { click as clickSound, installClickSounds } from '../src/audio/sounds';
import { button, clean, click, connect, render, tick, type, unmount } from './harness';

// Phase 11 (spec §19): the settings panels, the screensaver, the sounds and the help file, on screen.

vi.mock('../src/sim/client', async () => (await import('./worker')).client);

let engine: Engine;
const FIRM = 'Polish Capital';

beforeAll(() => {
  const world = generateWorld({ seed: 'phase 11 ui', companyCount: 800 });
  engine = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: FIRM });
  engine.advanceTo(at(addTradingDays(START_DAY, 3), CLOSE));
  connect(engine, FIRM);
}, 60_000);

beforeEach(() => {
  usePrefs.setState(DEFAULT_PREFS);
  usePrograms.setState(newPrograms(), true);
  useShell.setState({ saver: false });
});
afterEach(unmount);

const select = async (el: HTMLSelectElement, value: string) => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const label = (host: HTMLElement, text: string | RegExp) => {
  const l = [...host.querySelectorAll('label')].find((x) => (typeof text === 'string' ? x.textContent === text : text.test(x.textContent ?? '')));
  if (!l) throw new Error(`No label ${text}`);
  return l;
};
const field = <T extends HTMLElement>(host: HTMLElement, text: string | RegExp) => host.querySelector<T>(`#${CSS.escape(label(host, text).htmlFor)}`)!;

describe('My Computer → Display (spec §17)', () => {
  it('changes the colour scheme, the CRT effect and the screensaver, and remembers the choices', async () => {
    const host = await render(<DisplayPanel />);
    clean(host);
    await select(field<HTMLSelectElement>(host, 'Colour scheme'), 'brick');
    expect(usePrefs.getState().scheme).toBe('brick');
    await click(field(host, /CRT effect/));
    expect(usePrefs.getState().crt).toBe(true);
    await select(field<HTMLSelectElement>(host, 'Screensaver'), 'logos');
    await select(field<HTMLSelectElement>(host, 'Wait'), '10');
    expect(usePrefs.getState()).toMatchObject({ saver: 'logos', saverMinutes: 10 });
    // Kept in the browser, apart from any game.
    const stored = JSON.parse(localStorage.getItem('majorsoft-doors-98-settings')!);
    expect(stored.state).toMatchObject({ scheme: 'brick', crt: true, saver: 'logos', saverMinutes: 10 });
  });

  it('sets the wallpaper, and offers the MajorPaint pictures', async () => {
    usePrograms.setState({ pictures: [{ id: 1, name: 'Bull', pixels: '0'.repeat(1024) }] });
    const host = await render(<DisplayPanel />);
    const items = [...host.querySelectorAll<HTMLElement>('.wallpaper-list li')];
    expect(items.map((i) => i.textContent)).toEqual(['(Teal)', 'Clouds', 'Raging Bull', 'Ticker', 'Red Bricks', 'Money Green', 'Bull (MajorPaint)']);
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    await click(items[2]);
    expect(usePrograms.getState().wallpaper).toEqual({ kind: 'pattern', id: 'bull' });
    await click([...host.querySelectorAll<HTMLElement>('.wallpaper-list li')][6]);
    expect(usePrograms.getState().wallpaper).toEqual({ kind: 'picture', pixels: '0'.repeat(1024) });
  });

  it('previews the screensaver', async () => {
    const host = await render(<DisplayPanel />);
    await click(button(host, 'Preview'));
    expect(useShell.getState().saver).toBe(true);
  });
});

describe('My Computer → Sounds (spec §17)', () => {
  it('sets the volume and the switches', async () => {
    const host = await render(<SoundsPanel />);
    clean(host);
    const volume = field<HTMLInputElement>(host, 'Master volume');
    await type(volume, '0.3');
    expect(usePrefs.getState().volume).toBeCloseTo(0.3);
    expect(host.textContent).toContain('30%');
    await click(field(host, 'Click sounds'));
    await click(field(host, 'New mail chime'));
    await click(field(host, /Dial-up noise/));
    expect(usePrefs.getState()).toMatchObject({ clicks: false, mailChime: false, dialUp: false });
  });

  it('makes no sound when the volume is off or there is no sound card, and never throws', async () => {
    const host = await render(<SoundsPanel />);
    for (const b of host.querySelectorAll('button')) await click(b);
    usePrefs.setState({ volume: 0 });
    for (const b of host.querySelectorAll('button')) await click(b);
  });
});

/** A sound card that only counts what it is asked to play. One class for the whole file: the mixer keeps its first context. */
const made = { sources: 0, oscillators: 0 };
const node = () => ({ connect: (n: unknown) => n, start: () => undefined, stop: () => undefined, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, buffer: null, type: '' });
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return node();
  }
  createOscillator() {
    made.oscillators++;
    return node();
  }
  createBuffer(_c: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    made.sources++;
    return node();
  }
  createBiquadFilter() {
    return node();
  }
}
function fakeAudio() {
  made.sources = 0;
  made.oscillators = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return made;
}

describe('sounds', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('plays a click for a button press only while click sounds are on, and at the volume set', async () => {
    const made = fakeAudio();
    const stop = installClickSounds();
    const b = document.createElement('button');
    document.body.append(b);
    const press = () => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    press();
    expect(made.sources).toBe(1);
    await new Promise((r) => setTimeout(r, 40));
    usePrefs.setState({ clicks: false });
    press();
    expect(made.sources).toBe(1);
    usePrefs.setState({ clicks: true, volume: 0 });
    await new Promise((r) => setTimeout(r, 40));
    press();
    expect(made.sources).toBe(1);
    // A disabled button is not pressed.
    usePrefs.setState({ volume: 0.5 });
    await new Promise((r) => setTimeout(r, 40));
    b.disabled = true;
    press();
    expect(made.sources).toBe(1);
    stop();
    b.remove();
  });

  it('plays the Test buttons whatever the switches say', async () => {
    const made = fakeAudio();
    usePrefs.setState({ clicks: false, mailChime: false, dialUp: false });
    const host = await render(<SoundsPanel />);
    for (const b of [...host.querySelectorAll('button')].filter((x) => x.textContent === 'Test')) await click(b);
    expect(made.sources).toBeGreaterThan(0);
    expect(made.oscillators).toBeGreaterThan(0);
    clickSound(true);
  });
});

describe('My Computer → Game (spec §17)', () => {
  it('sets the new-game speed, autosave and pausing for pages', async () => {
    const host = await render(<GamePanel />);
    clean(host);
    await select(field<HTMLSelectElement>(host, 'New games start at'), '5');
    await select(field<HTMLSelectElement>(host, 'Autosave'), 'month');
    await click(field(host, /Pause the clock/));
    expect(usePrefs.getState()).toMatchObject({ startSpeed: 5, autosave: 'month', pauseOnPage: true });
    expect(host.textContent).not.toContain('Ironman game');
  });

  it('says so when the game is Ironman, and autosaves every day', async () => {
    useGame.setState({ settings: { ...engine.settings, ironman: true } });
    const host = await render(<GamePanel />);
    expect(host.textContent).toContain('This is an Ironman game');
    expect(field<HTMLSelectElement>(host, 'Autosave').textContent).toBe('Every game day (Ironman)');
    useGame.setState({ settings: engine.settings });
  });
});

describe('the screensaver (spec §4)', () => {
  const later = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

  it('shows while it is on, and any key wakes the computer', async () => {
    useShell.setState({ saver: true });
    const host = await render(<Screensaver />);
    expect(host.querySelector('.saver')).not.toBeNull();
    expect(host.querySelector('canvas')).not.toBeNull();
    // A key at once is the click that started it: ignored.
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(useShell.getState().saver).toBe(true);
    await later(450);
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(useShell.getState().saver).toBe(false);
    await tick();
    expect(host.querySelector('.saver')).toBeNull();
  });

  it('is woken by the mouse moving, but not by a nudge', async () => {
    useShell.setState({ saver: true });
    await render(<Screensaver />);
    await later(450);
    const move = (x: number) => act(async () => void window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 10 })));
    await move(100);
    await move(103);
    expect(useShell.getState().saver).toBe(true);
    await move(200);
    expect(useShell.getState().saver).toBe(false);
  });

  it('draws the firm’s logo flying, when that is the screensaver chosen', async () => {
    usePrefs.setState({ saver: 'logos' });
    useShell.setState({ saver: true });
    const host = await render(<Screensaver />);
    expect(host.querySelectorAll('.saver-flyer').length).toBe(14);
    expect(host.querySelector('.saver-flyer')!.textContent).toContain(FIRM);
  });

  it('comes on after the idle time set, and only when running', async () => {
    function Idle({ running }: { running: boolean }) {
      useIdleSaver(running);
      return null;
    }
    usePrefs.setState({ saverMinutes: 0.002 }); // 120 ms
    await render(<Idle running={false} />);
    await later(300);
    expect(useShell.getState().saver).toBe(false);
    await render(<Idle running />);
    await later(300);
    expect(useShell.getState().saver).toBe(true);
    // Never is never.
    useShell.setState({ saver: false });
    usePrefs.setState({ saverMinutes: 0 });
    await render(<Idle running />);
    await later(300);
    expect(useShell.getState().saver).toBe(false);
  });

  it('is restarted by input, and by waking up', async () => {
    function Idle() {
      useIdleSaver(true);
      return null;
    }
    usePrefs.setState({ saverMinutes: 0.004 }); // 240 ms
    await render(<Idle />);
    for (let k = 0; k < 4; k++) {
      await later(100);
      await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    }
    expect(useShell.getState().saver).toBe(false);
    await later(400);
    expect(useShell.getState().saver).toBe(true);
    useShell.setState({ saver: false });
    await later(400);
    expect(useShell.getState().saver).toBe(true);
    useShell.setState({ saver: false });
    usePrefs.setState({ saverMinutes: 0 });
  });
});

describe('Doors Help (spec §4)', () => {
  const open = (topic?: string) => {
    const id = useWindows.getState().open('help', topic ? { topic } : undefined);
    return render(<Help windowId={id} appId="help" />);
  };
  afterEach(() => useWindows.getState().closeAll());

  it('opens on the welcome guide with the game’s own numbers, and lists the contents', async () => {
    const host = await open();
    clean(host);
    expect(host.textContent).toContain('Your first day');
    expect(host.textContent).toContain('$2,500,000');
    const sections = [...host.querySelectorAll('.help-contents > li > details > summary')].map((s) => s.textContent?.trim());
    expect(sections).toContain('The Desktop and Settings');
    expect(sections).toContain('Loans and Credit');
  });

  it('shows any guide from the contents, with Back and Forward', async () => {
    const host = await open();
    const link = [...host.querySelectorAll<HTMLElement>('.help-contents a')].find((a) => a.textContent?.includes('Time, trading hours'))!;
    await click(link);
    expect(host.querySelector('h1')!.textContent).toContain('Time, trading hours');
    await click(button(host, 'Back'));
    expect(host.querySelector('h1')!.textContent).toContain('Your first day');
    expect(button(host, 'Back').disabled).toBe(true);
    await click(button(host, 'Forward'));
    expect(host.querySelector('h1')!.textContent).toContain('Time, trading hours');
    await click(button(host, 'Home'));
    expect(host.querySelector('h1')!.textContent).toContain('Your first day');
  });

  it('follows links to other guides inside the window', async () => {
    const host = await open('welcome');
    const before = useWindows.getState().windows.length;
    await click([...host.querySelectorAll<HTMLElement>('.help-topic a[role="link"]')].find((a) => a.textContent === 'bankruptcy')!);
    expect(host.querySelector('h1')!.textContent).toContain('Bankruptcy');
    expect(useWindows.getState().windows.length).toBe(before);
  });

  it('finds guides in the Index and by Search', async () => {
    const host = await open();
    await click([...host.querySelectorAll<HTMLElement>('menu[role="tablist"] a')].find((a) => a.textContent === 'Index')!);
    await type(host.querySelector<HTMLInputElement>('.help-list input')!, 'ironman');
    const hits = [...host.querySelectorAll('.help-results a')].map((a) => a.textContent);
    expect(hits).toContain('What is Ironman?');
    await click([...host.querySelectorAll<HTMLElement>('.help-results a')].find((a) => a.textContent === 'What is Ironman?')!);
    expect(host.querySelector('h1')!.textContent).toContain('Settings');

    await click([...host.querySelectorAll<HTMLElement>('menu[role="tablist"] a')].find((a) => a.textContent === 'Search')!);
    await type(host.querySelector<HTMLInputElement>('.help-list input')!, 'how do I short a stock');
    await click(button(host, 'List Topics'));
    expect(host.querySelector('.help-results a')!.textContent).toMatch(/short/i);
  });

  it('hides its navigation', async () => {
    const host = await open();
    expect(host.querySelector('.help-nav')).not.toBeNull();
    await click(button(host, 'Hide'));
    expect(host.querySelector('.help-nav')).toBeNull();
    expect(host.querySelector('h1')).not.toBeNull();
  });
});

describe('the Start menu’s Documents (spec §4)', () => {
  afterEach(() => useWindows.getState().closeAll());

  it('is empty until something is written, then lists the newest documents, sheets and the notes', async () => {
    const host = await render(<StartMenu onClose={() => undefined} />);
    expect(host.textContent).toContain('(Empty)');
    usePrograms.setState({
      documents: [{ id: 1, name: 'Letter to clients', text: '', font: 'serif', size: 14 }, { id: 2, name: 'Q1 notes', text: '', font: 'serif', size: 14 }],
      sheets: [{ id: 3, name: 'Positions', cells: {} }],
      notepad: 'remember the milk',
    });
    const menu = await render(<StartMenu onClose={() => undefined} />);
    const documents = [...menu.querySelectorAll('.menu-item')].find((i) => i.querySelector(':scope > span')?.textContent === 'Documents')!;
    const names = [...documents.querySelectorAll('.submenu .menu-item')].map((i) => i.textContent);
    expect(names).toEqual(['Q1 notes', 'Letter to clients', 'Positions', 'Notes']);
    await click(documents.querySelectorAll('.submenu .menu-item')[1]);
    const word = useWindows.getState().windows.find((w) => w.appId === 'word');
    expect(word?.params?.view).toBe('1');
  });

  it('opens Doors Help from Start → Help', async () => {
    const host = await render(<StartMenu onClose={() => undefined} />);
    await click([...host.querySelectorAll('.menu-item')].find((i) => i.querySelector(':scope > span')?.textContent === 'Help')!);
    expect(useWindows.getState().windows.some((w) => w.appId === 'help')).toBe(true);
  });
});

describe('keyboard shortcuts', () => {
  afterEach(() => {
    useWindows.getState().closeAll();
    useShell.setState({ power: 'booting', setup: false });
  });
  const key = (init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { cancelable: true, ...init });
    onShortcut(e);
    return e;
  };

  it('opens the help file on F1 and the Task Mangler on Ctrl+Alt+Delete, on the desktop only', () => {
    expect(key({ key: 'F1' }).defaultPrevented).toBe(false);
    expect(useWindows.getState().windows).toHaveLength(0);
    useShell.setState({ power: 'running', setup: false });
    expect(key({ key: 'F1' }).defaultPrevented).toBe(true);
    expect(useWindows.getState().windows.map((w) => w.appId)).toEqual(['help']);
    key({ key: 'Delete', ctrlKey: true, altKey: true });
    expect(useWindows.getState().windows.map((w) => w.appId)).toEqual(['help', 'taskmangler']);
    // Not over Setup.
    useWindows.getState().closeAll();
    useShell.setState({ setup: true });
    key({ key: 'F1' });
    expect(useWindows.getState().windows).toHaveLength(0);
  });
});
