/**
 * The dust hero (DustText.svelte), kept free of the DOM so it can be tested. The words
 * are made of loose grains that visitors can draw in: a drag pushes grains aside into
 * ridges, and the marks stay until a gust blows every grain back home.
 */

export type Rng = () => number;

export interface Grain {
  /** Where the grain lies. */
  tx: number;
  ty: number;
  /** Where it lay when the page loaded; a gust blows it back here. */
  hx: number;
  hy: number;
  /** Where it was when the current gust started, and how long it waited for the gust. */
  fx: number;
  fy: number;
  delay: number;
  sz: number;
  a: number;
}

/** A grain at (tx, ty). Strays (the loose dust around letters) are smaller and fainter. */
export function makeGrain(tx: number, ty: number, stray: boolean, rnd: Rng = Math.random): Grain {
  return {
    tx,
    ty,
    hx: tx,
    hy: ty,
    fx: tx,
    fy: ty,
    delay: 0,
    sz: stray ? 1 : rnd() < 0.15 ? 2.2 : 1.3 + rnd() * 0.6,
    a: stray ? 0.4 + rnd() * 0.3 : 0.6 + rnd() * 0.4,
  };
}

/** Seconds each grain spends in the air when a gust blows it home. */
export const GUST = 0.9;

/** Whether a grain has been moved away from where it lay on load. */
export function displaced(g: Grain): boolean {
  return g.tx !== g.hx || g.ty !== g.hy;
}

/**
 * Catch a grain in a gust that sweeps left to right across a canvas `width` px wide:
 * remember where it lies now and when the gust reaches it.
 */
export function startGust(g: Grain, width: number, rnd: Rng = Math.random): void {
  g.fx = g.tx;
  g.fy = g.ty;
  g.delay = (g.fx / Math.max(width, 1)) * 0.5 + rnd() * 0.25;
}

/**
 * Where a grain caught in a gust is, `t` seconds after the gust began: lifted, carried
 * along an arc and set down exactly where it lay on load. `done` once it has landed.
 */
export function gustAt(g: Grain, t: number): { x: number; y: number; done: boolean } {
  const u = Math.max(0, Math.min(1, (t - g.delay) / GUST));
  if (u >= 1) return { x: g.hx, y: g.hy, done: true };
  const e = u * u * (3 - 2 * u);
  const arc = Math.sin(Math.PI * u);
  const lift = Math.min(24, 4 + Math.hypot(g.hx - g.fx, g.hy - g.fy) * 0.5);
  return {
    x: g.fx + (g.hx - g.fx) * e + arc * 6,
    y: g.fy + (g.hy - g.fy) * e - arc * lift,
    done: false,
  };
}

/**
 * Drag a stick from `a` to `b`, cutting a groove `w` px wide: grains in its path are
 * shoved out to the groove's edges, where they pile into ridges. Returns how many moved.
 */
export function plough(
  grains: Iterable<Grain>,
  a: readonly [number, number],
  b: readonly [number, number],
  w: number,
  rnd: Rng = Math.random,
): number {
  const r = w * 1.15;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const len = Math.sqrt(len2);
  let moved = 0;
  for (const g of grains) {
    // Nearest point on the stroke to this grain.
    const t = len2 ? Math.max(0, Math.min(1, ((g.tx - a[0]) * dx + (g.ty - a[1]) * dy) / len2)) : 0;
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const ox = g.tx - px;
    const oy = g.ty - py;
    const d = Math.hypot(ox, oy);
    if (d >= r) continue;
    let nx: number;
    let ny: number;
    if (d > 0.01) {
      nx = ox / d;
      ny = oy / d;
    } else {
      // Dead on the line: push it to a random side.
      const side = rnd() < 0.5 ? -1 : 1;
      nx = len ? (-dy / len) * side : side;
      ny = len ? (dx / len) * side : 0;
    }
    const to = r + rnd() * 3.5;
    g.tx = px + nx * to;
    g.ty = py + ny * to;
    moved++;
  }
  return moved;
}

/**
 * A drawing saved from the hero: which cells of a grid laid over the canvas held dust,
 * captured at `width` CSS px. `bits` is base64 of one bit per cell, row by row.
 */
export interface DustPattern {
  text: string;
  width: number;
  height: number;
  cell: number;
  cols: number;
  rows: number;
  bits: string;
}

/** The centers (CSS px, at the captured width) of every cell in the pattern that held dust. */
export function patternPoints(p: DustPattern): Array<[number, number]> {
  const bytes = atob(p.bits);
  const points: Array<[number, number]> = [];
  for (let k = 0; k < p.cols * p.rows; k++) {
    if (bytes.charCodeAt(k >> 3) & (1 << (k & 7))) {
      points.push([((k % p.cols) + 0.5) * p.cell, (Math.floor(k / p.cols) + 0.5) * p.cell]);
    }
  }
  return points;
}
