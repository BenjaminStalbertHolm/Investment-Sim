import type { Rng } from '../../world/rng';

/**
 * "3D Pipelines" (spec §4): oil pipelines that draw themselves. This is the pure part: pipes wander through a cube of
 * cells, turning now and then, and stop when they hit a wall or another pipe; when the cube is crowded it is cleared and
 * the pipes start again. The screensaver draws each step as it comes.
 */
export const SIZE = 9;

export type Cell = readonly [number, number, number];

export interface PipeStep {
  from: Cell;
  to: Cell;
  /** Index into the palette; a pipe keeps its colour. */
  colour: number;
  /** The pipe turned (or began) at `from`, so a joint is drawn there. */
  joint: boolean;
  /** The cube was full and has been cleared before this step. */
  cleared: boolean;
}

const DIRECTIONS: Cell[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const key = (c: Cell) => (c[0] * SIZE + c[1]) * SIZE + c[2];
const inside = (c: Cell) => c.every((v) => v >= 0 && v < SIZE);

export class Pipes {
  private used = new Set<number>();
  private head?: Cell;
  private direction = 0;
  private colour = 0;
  private turnedLast = true;
  private cleared = false;

  constructor(
    private readonly rng: Rng,
    private readonly colours: number,
  ) {}

  /** The next piece of pipe. */
  step(): PipeStep {
    for (let attempts = 0; attempts < 40; attempts++) {
      if (!this.head) this.begin();
      const from = this.head!;
      const options = this.options(from);
      if (!options.length) {
        this.head = undefined;
        continue;
      }
      // Mostly straight ahead; a third of the time, turn.
      const straight = options.includes(this.direction);
      const turn = !straight || this.rng.float() < 0.3;
      const next = turn ? options.filter((d) => d !== this.direction) : [this.direction];
      const pick = next.length ? next[this.rng.int(0, next.length - 1)] : options[0];
      const joint = pick !== this.direction || this.turnedLast;
      this.direction = pick;
      const to: Cell = [from[0] + DIRECTIONS[pick][0], from[1] + DIRECTIONS[pick][1], from[2] + DIRECTIONS[pick][2]];
      this.used.add(key(to));
      this.head = to;
      this.turnedLast = false;
      const cleared = this.cleared;
      this.cleared = false;
      return { from, to, colour: this.colour, joint, cleared };
    }
    // Nothing fits anywhere: start again.
    this.reset();
    return this.step();
  }

  /** How full the cube is, 0 to 1. */
  get fill(): number {
    return this.used.size / SIZE ** 3;
  }

  private begin(): void {
    if (this.fill > 0.45) this.reset();
    for (let tries = 0; tries < 60; tries++) {
      const c: Cell = [this.rng.int(0, SIZE - 1), this.rng.int(0, SIZE - 1), this.rng.int(0, SIZE - 1)];
      if (this.used.has(key(c))) continue;
      this.head = c;
      this.used.add(key(c));
      this.direction = this.rng.int(0, 5);
      this.colour = this.rng.int(0, this.colours - 1);
      this.turnedLast = true;
      return;
    }
    this.reset();
    this.begin();
  }

  private reset(): void {
    this.used.clear();
    this.head = undefined;
    this.cleared = true;
  }

  private options(from: Cell): number[] {
    const out: number[] = [];
    DIRECTIONS.forEach((d, k) => {
      const c: Cell = [from[0] + d[0], from[1] + d[1], from[2] + d[2]];
      if (inside(c) && !this.used.has(key(c))) out.push(k);
    });
    return out;
  }
}

/** A cell in the rotated, tipped cube, in cell widths from its centre; `rz` is towards the viewer. */
function rotate(c: Cell): { rx: number; ry: number; rz: number } {
  const half = (SIZE - 1) / 2;
  const x = c[0] - half;
  const y = c[1] - half;
  const z = c[2] - half;
  // Rotate 35° about the vertical axis, then tip 25° towards the viewer.
  const a = 0.61;
  const b = 0.44;
  const ry0 = x * Math.sin(a) + y * Math.cos(a);
  return { rx: x * Math.cos(a) - y * Math.sin(a), ry: ry0 * Math.cos(b) - z * Math.sin(b), rz: ry0 * Math.sin(b) + z * Math.cos(b) };
}

const PERSPECTIVE = 0.05;
const CORNERS = ([0, SIZE - 1] as const).flatMap((x) => ([0, SIZE - 1] as const).flatMap((y) => ([0, SIZE - 1] as const).map((z): Cell => [x, y, z])));
const EXTENT = CORNERS.map(rotate).reduce(
  (m, { rx, ry, rz }) => ({
    x: Math.max(m.x, Math.abs(rx) * (1 + rz * PERSPECTIVE)),
    y: Math.max(m.y, Math.abs(ry) * (1 + rz * PERSPECTIVE)),
  }),
  { x: 0, y: 0 },
);

/**
 * A cell as a point on the screen: a fixed three-quarter view from above, with a little perspective, scaled so that the
 * whole cube (and the width of its pipes) fits the screen. `depth` is nearer the viewer when larger, for the pipe's width.
 */
export function project(c: Cell, width: number, height: number): { x: number; y: number; depth: number } {
  const { rx, ry, rz } = rotate(c);
  const scale = Math.min(width / (2 * EXTENT.x), height / (2 * EXTENT.y)) * 0.86;
  const near = 1 + rz * PERSPECTIVE;
  return { x: width / 2 + rx * scale * near, y: height / 2 + ry * scale * near, depth: near };
}
