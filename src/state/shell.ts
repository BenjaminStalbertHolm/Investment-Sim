import { create } from 'zustand';

export type Power = 'booting' | 'running' | 'off';
export type Speed = 0 | 1 | 2 | 5 | 20;

interface ShellStore {
  power: Power;
  /** Desktop icon positions the player has dragged; unset icons use the default grid. */
  iconPositions: Record<string, { x: number; y: number }>;
  /** Game speed chosen in the tray (the simulation worker is told by state/game.ts). */
  speed: Speed;
  /** Scrolling watchlist ticker above the taskbar. */
  tickerTape: boolean;

  setPower(power: Power): void;
  moveIcon(id: string, x: number, y: number): void;
  setSpeed(speed: Speed): void;
  toggleTickerTape(): void;
}

export const useShell = create<ShellStore>()((set) => ({
  power: 'booting',
  iconPositions: {},
  speed: 1,
  tickerTape: false,

  setPower: (power) => set({ power }),
  moveIcon: (id, x, y) => set((s) => ({ iconPositions: { ...s.iconPositions, [id]: { x, y } } })),
  setSpeed: (speed) => set({ speed }),
  toggleTickerTape: () => set((s) => ({ tickerTape: !s.tickerTape })),
}));
