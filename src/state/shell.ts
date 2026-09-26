import { create } from 'zustand';

export type Power = 'booting' | 'running' | 'off';
export type Speed = 0 | 1 | 2 | 5 | 20;

interface ShellStore {
  power: Power;
  /** Desktop icon positions the player has dragged; unset icons use the default grid. */
  iconPositions: Record<string, { x: number; y: number }>;
  /** Tray speed selector. Cosmetic until the market clock arrives in Phase 3. */
  speed: Speed;

  setPower(power: Power): void;
  moveIcon(id: string, x: number, y: number): void;
  setSpeed(speed: Speed): void;
}

export const useShell = create<ShellStore>()((set) => ({
  power: 'booting',
  iconPositions: {},
  speed: 1,

  setPower: (power) => set({ power }),
  moveIcon: (id, x, y) => set((s) => ({ iconPositions: { ...s.iconPositions, [id]: { x, y } } })),
  setSpeed: (speed) => set({ speed }),
}));
