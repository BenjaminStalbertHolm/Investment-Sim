import { beforeEach, describe, expect, it } from 'vitest';
import { findTicker, resolveRunTarget } from '../src/apps/run/RunDialog';
import { activeWindowId, useWindows } from '../src/state/windows';

const initial = useWindows.getState();
const wm = () => useWindows.getState();
const win = (id: string) => wm().windows.find((w) => w.id === id)!;
const active = () => activeWindowId(wm().windows);

beforeEach(() => useWindows.setState(initial, true));

describe('window manager', () => {
  it('opens windows cascaded and focused', () => {
    const a = wm().open('trade');
    const b = wm().open('mail');
    expect(win(b).bounds.x - win(a).bounds.x).toBe(24);
    expect(win(b).bounds.y - win(a).bounds.y).toBe(24);
    expect(active()).toBe(b);
  });

  it('refocuses single-instance apps instead of opening a second window', () => {
    const a = wm().open('trade');
    wm().open('mail');
    wm().minimize(a);
    expect(wm().open('trade')).toBe(a);
    expect(wm().windows).toHaveLength(2);
    expect(win(a).minimized).toBe(false);
    expect(active()).toBe(a);
  });

  it('allows multiple browser windows', () => {
    const a = wm().open('browser');
    const b = wm().open('browser');
    expect(a).not.toBe(b);
    expect(wm().windows).toHaveLength(2);
  });

  it('focus raises z-order', () => {
    const a = wm().open('trade');
    const b = wm().open('mail');
    expect(win(b).z).toBeGreaterThan(win(a).z);
    wm().focus(a);
    expect(win(a).z).toBeGreaterThan(win(b).z);
    expect(active()).toBe(a);
  });

  it('minimise hands focus to the next window and the taskbar toggles', () => {
    const a = wm().open('trade');
    const b = wm().open('mail');
    wm().taskbarClick(b); // active → minimise
    expect(win(b).minimized).toBe(true);
    expect(active()).toBe(a);
    wm().taskbarClick(b); // minimised → restore
    expect(win(b).minimized).toBe(false);
    expect(active()).toBe(b);
    wm().taskbarClick(a); // inactive → focus
    expect(active()).toBe(a);
  });

  it('maximise toggles without losing restored bounds', () => {
    const a = wm().open('trade');
    const before = win(a).bounds;
    wm().toggleMaximize(a);
    expect(win(a).maximized).toBe(true);
    wm().toggleMaximize(a);
    expect(win(a).maximized).toBe(false);
    expect(win(a).bounds).toEqual(before);
  });

  it('remembers the last position and size per app', () => {
    const a = wm().open('notepad');
    const moved = { x: 300, y: 200, width: 500, height: 350 };
    wm().setBounds(a, moved);
    wm().close(a);
    expect(win(wm().open('notepad')).bounds).toEqual(moved);
  });

  it('clamps new windows into the desktop area', () => {
    wm().setArea(600, 400);
    const a = wm().open('trade'); // default 800×540
    expect(win(a).bounds).toEqual({ x: 0, y: 0, width: 600, height: 400 });
  });

  it('opens one quote window per company, keeping what it shows', () => {
    const a = wm().open('quote', { company: 3 }, 'PEAR — Pear Computer');
    const b = wm().open('quote', { company: 4 });
    expect(b).not.toBe(a);
    expect(wm().open('quote', { company: 3 })).toBe(a);
    expect(win(a).title).toBe('PEAR — Pear Computer');
    wm().setParams(a, { timeframe: '5Y' });
    expect(win(a).params).toEqual({ company: 3, timeframe: '5Y' });
  });

  it('centres dialogs', () => {
    wm().setArea(1000, 700);
    const b = win(wm().open('run')).bounds;
    expect(b.x + b.width / 2).toBe(500);
  });
});

describe('Run…', () => {
  it('resolves app ids, title prefixes and URLs', () => {
    expect(resolveRunTarget('notepad')).toBe('notepad');
    expect(resolveRunTarget('majortrade')).toBe('trade');
    expect(resolveRunTarget('www.yeehaw.com')).toBe('browser');
    expect(resolveRunTarget('shutdown')).toBeUndefined();
    expect(resolveRunTarget('nonsense')).toBeUndefined();
    expect(resolveRunTarget('quote')).toBeUndefined(); // quote windows open from a ticker
  });

  it('finds tickers in any case', () => {
    expect(findTicker(['MVDA', 'MJSF'], ' mjsf ')).toBe(1);
    expect(findTicker(['MVDA', 'MJSF'], 'MVD')).toBeUndefined();
  });
});
