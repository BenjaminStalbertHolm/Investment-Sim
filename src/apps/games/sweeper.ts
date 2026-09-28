import { Rng } from '../../world/rng';

/** Margin Sweeper's board (spec §4A): Minesweeper, whose mines are companies that went bankrupt in your world. */
export interface Board {
  width: number;
  height: number;
  /** Per cell: a mine, its neighbouring mines, and what the player has done to it. */
  mine: boolean[];
  near: number[];
  open: boolean[];
  flag: boolean[];
  /** The bankrupt company each mine stands for (an index into the list the board was dealt with). */
  label: number[];
  state: 'playing' | 'won' | 'lost';
  /** The mine that went off. */
  boom?: number;
}

export const LEVELS = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 },
} as const;
export type Level = keyof typeof LEVELS;

function neighbours(b: Pick<Board, 'width' | 'height'>, i: number): number[] {
  const x = i % b.width;
  const y = Math.floor(i / b.width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx;
    const ny = y + dy;
    if ((dx || dy) && nx >= 0 && ny >= 0 && nx < b.width && ny < b.height) out.push(ny * b.width + nx);
  }
  return out;
}

/** A board with mines everywhere but around the first click (`safe`), which is always a clearing. */
export function deal(level: Level, seed: string, safe: number, names: number): Board {
  const { width, height, mines } = LEVELS[level];
  const n = width * height;
  const rng = Rng.stream(seed, 'sweeper');
  const keep = new Set([safe, ...neighbours({ width, height }, safe)]);
  const cells = rng.shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => !keep.has(i))).slice(0, mines);
  const mine = Array<boolean>(n).fill(false);
  for (const i of cells) mine[i] = true;
  const near = Array.from({ length: n }, (_, i) => neighbours({ width, height }, i).filter((j) => mine[j]).length);
  const label = Array.from({ length: n }, () => (names ? rng.int(0, names - 1) : -1));
  return reveal({ width, height, mine, near, open: Array(n).fill(false), flag: Array(n).fill(false), label, state: 'playing' }, safe);
}

/** Opens a cell; a clearing opens its neighbours too. Stepping on a mine loses; opening every safe cell wins. */
export function reveal(b: Board, i: number): Board {
  if (b.state !== 'playing' || b.open[i] || b.flag[i]) return b;
  const open = b.open.slice();
  if (b.mine[i]) return { ...b, open: b.mine.map((m, k) => open[k] || m), state: 'lost', boom: i };
  const stack = [i];
  while (stack.length) {
    const k = stack.pop()!;
    if (open[k] || b.flag[k]) continue;
    open[k] = true;
    if (b.near[k] === 0) stack.push(...neighbours(b, k));
  }
  const won = open.every((o, k) => o || b.mine[k]);
  return { ...b, open, state: won ? 'won' : 'playing' };
}

export function toggleFlag(b: Board, i: number): Board {
  if (b.state !== 'playing' || b.open[i]) return b;
  const flag = b.flag.slice();
  flag[i] = !flag[i];
  return { ...b, flag };
}
