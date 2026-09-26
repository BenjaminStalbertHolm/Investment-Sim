import { create } from 'zustand';
import { APPS, type AppId } from '../apps/catalog';
import type { ChartType } from '../charts/PriceChart';
import type { Timeframe } from '../sim/types';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a window shows: the company of a quote window, the panel My Computer opens on. */
export interface WindowParams {
  company?: number;
  view?: string;
  timeframe?: Timeframe;
  chart?: ChartType;
}

export interface WindowState {
  id: string;
  appId: AppId;
  /** Restored (non-maximised) bounds. */
  bounds: Bounds;
  z: number;
  minimized: boolean;
  maximized: boolean;
  params?: WindowParams;
  /** Replaces the app's title: quote windows show their company. */
  title?: string;
}

interface WindowsStore {
  windows: WindowState[];
  /** Last known bounds per app, used to reopen an app where it was left. */
  lastBounds: Partial<Record<AppId, Bounds>>;
  /** Size of the desktop area (screen minus taskbar); new windows are clamped into it. */
  area: { width: number; height: number };
  zCounter: number;
  idCounter: number;

  /** Opens a window, or focuses the app's open one (for a quote window: the one showing the same company). */
  open(appId: AppId, params?: WindowParams, title?: string): string;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  toggleMaximize(id: string): void;
  setBounds(id: string, bounds: Bounds): void;
  setParams(id: string, params: WindowParams): void;
  /** Taskbar button behaviour: restore if minimised, minimise if active, otherwise focus. */
  taskbarClick(id: string): void;
  setArea(width: number, height: number): void;
  closeAll(): void;
}

const ORIGIN = { x: 40, y: 32 };
const CASCADE_STEP = 24;
const CASCADE_SLOTS = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The active window is the top-most window that is not minimised. */
export function activeWindowId(windows: WindowState[]): string | undefined {
  let top: WindowState | undefined;
  for (const w of windows) if (!w.minimized && (!top || w.z > top.z)) top = w;
  return top?.id;
}

export const useWindows = create<WindowsStore>()((set, get) => {
  const update = (id: string, fn: (w: WindowState) => Partial<WindowState>) =>
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...fn(w) } : w)) }));

  const raise = (id: string) => {
    const z = get().zCounter + 1;
    set({ zCounter: z });
    update(id, () => ({ z, minimized: false }));
  };

  return {
    windows: [],
    lastBounds: {},
    area: { width: 1280, height: 772 },
    zCounter: 0,
    idCounter: 0,

    open(appId, params, title) {
      const { windows, lastBounds, area, idCounter } = get();
      const app = APPS[appId];
      const existing = windows.find(
        (w) => w.appId === appId && (!app.multiInstance || (params?.company !== undefined && w.params?.company === params.company)),
      );
      if (existing) {
        raise(existing.id);
        if (params) update(existing.id, () => ({ params }));
        return existing.id;
      }

      const last = lastBounds[appId];
      const width = Math.min(last?.width ?? app.defaultSize.width, area.width);
      const height = Math.min(last?.height ?? app.defaultSize.height, area.height);
      let x: number;
      let y: number;
      if (app.dialog) {
        x = (area.width - width) / 2;
        y = (area.height - height) / 3;
      } else if (last) {
        const siblings = windows.filter((w) => w.appId === appId).length;
        x = last.x + siblings * CASCADE_STEP;
        y = last.y + siblings * CASCADE_STEP;
      } else {
        const slot = windows.length % CASCADE_SLOTS;
        x = ORIGIN.x + slot * CASCADE_STEP;
        y = ORIGIN.y + slot * CASCADE_STEP;
      }
      const bounds = {
        x: Math.round(clamp(x, 0, area.width - width)),
        y: Math.round(clamp(y, 0, area.height - height)),
        width,
        height,
      };

      const id = `w${idCounter + 1}`;
      const z = get().zCounter + 1;
      set({
        idCounter: idCounter + 1,
        zCounter: z,
        windows: [...windows, { id, appId, bounds, z, minimized: false, maximized: false, params, title }],
      });
      return id;
    },

    close(id) {
      const w = get().windows.find((x) => x.id === id);
      if (!w) return;
      set((s) => ({
        windows: s.windows.filter((x) => x.id !== id),
        lastBounds: { ...s.lastBounds, [w.appId]: w.bounds },
      }));
    },

    focus(id) {
      const { windows } = get();
      const w = windows.find((x) => x.id === id);
      if (!w || (!w.minimized && activeWindowId(windows) === id)) return;
      raise(id);
    },

    minimize(id) {
      update(id, () => ({ minimized: true }));
    },

    toggleMaximize(id) {
      update(id, (w) => ({ maximized: !w.maximized }));
      get().focus(id);
    },

    setBounds(id, bounds) {
      const w = get().windows.find((x) => x.id === id);
      if (!w) return;
      update(id, () => ({ bounds }));
      set((s) => ({ lastBounds: { ...s.lastBounds, [w.appId]: bounds } }));
    },

    setParams(id, params) {
      update(id, (w) => ({ params: { ...w.params, ...params } }));
    },

    taskbarClick(id) {
      const { windows } = get();
      const w = windows.find((x) => x.id === id);
      if (!w) return;
      if (!w.minimized && activeWindowId(windows) === id) get().minimize(id);
      else raise(id);
    },

    setArea(width, height) {
      set({ area: { width, height } });
    },

    closeAll() {
      for (const w of get().windows) get().close(w.id);
    },
  };
});
