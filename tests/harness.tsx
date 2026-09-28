import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect } from 'vitest';
import type { Engine } from '../src/sim/engine';
import { worker } from './worker';
import { useGame } from '../src/state/game';
import { Site } from '../src/sites/Site';
import { PageContext, type Page } from '../src/sites/web';

/**
 * Rendering the UI against a running game in happy-dom (Phase 10 onwards). A test file mocks the client with
 * `vi.mock('../src/sim/client', async () => (await import('./worker')).client)` — the worker is the engine itself,
 * called in-process (tests/worker.ts) — and connects its engine here.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** What the worker would post: enough of a snapshot for the UI's hooks. */
export function snapshot(e: Engine) {
  return {
    time: e.time, phase: e.phase, holiday: e.holiday(), halted: e.halted, speed: 0, index: e.indexQuote(), quotes: {}, live: {}, account: e.account(),
    positions: e.positions(), openOrders: e.openOrders(), revision: Math.random(), events: [], mail: e.mailStatus(), news: e.newsCount,
    commodities: e.commodityQuotes(), sob: e.sobStatus(), darkweb: e.darkwebStatus(), desk: e.deskStatus(),
  };
}

/** The UI learns of a change the way the worker's snapshots tell it. */
export const refresh = () =>
  useGame.setState({ snapshot: snapshot(worker.engine) as never, directory: worker.engine.directory(), settings: worker.engine.settings });

/** Starts the UI's side of a game the harness's engine is running. */
export function connect(e: Engine, firmName: string): void {
  worker.engine = e;
  useGame.setState({ ready: true, seed: e.seed, firmName, player: e.player, settings: e.settings });
  refresh();
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

/** Unmounts what the last render mounted (afterEach). */
export function unmount(): void {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
}

export const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

export async function render(node: ReactNode): Promise<HTMLDivElement> {
  if (root) unmount();
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

export const site = (href: string) =>
  render(
    <PageContext.Provider value={page(href)}>
      <Site url={new URL(href)} />
    </PageContext.Provider>,
  );

/** No holes in the text: every number and name made it through. */
export const clean = (el: HTMLElement) => expect(el.textContent).not.toMatch(/undefined|NaN|Infinity|\[object|\{[a-zA-Z]+\}/);

export const button = (el: HTMLElement, text: string | RegExp) => {
  const b = [...el.querySelectorAll('button')].find((x) => (typeof text === 'string' ? x.textContent === text : text.test(x.textContent ?? '')));
  if (!b) throw new Error(`No button ${text}`);
  return b;
};

export async function click(el: Element) {
  // SVG elements have no click(): dispatch the event.
  await act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  for (let k = 0; k < 3; k++) await tick();
  refresh();
  await tick();
}

export async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function submit(form: HTMLFormElement) {
  await act(async () => form.requestSubmit());
  for (let k = 0; k < 3; k++) await tick();
  refresh();
  await tick();
}
