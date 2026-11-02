/**
 * The dust hero (DustText.svelte), kept free of the DOM so it can be tested. The words
 * are made of loose grains that visitors can draw in: a drag pushes grains aside into
 * ridges, a puff of wind from the corner scatters them, and the marks stay until a gust
 * drags every grain back home.
 */

export type Rng = () => number;

export interface Grain {
  /** Where the grain lies. */
  tx: number;
  ty: number;
  /** Where it lay when the page loaded; a gust drags it back here. */
  hx: number;
  hy: number;
  /** While moving: where it started, where it is headed, and how long it waits to go. */
  fx: number;
  fy: number;
  gx: number;
  gy: number;
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
    gx: tx,
    gy: ty,
    delay: 0,
    sz: stray ? 1 : rnd() < 0.15 ? 2.2 : 1.3 + rnd() * 0.6,
    a: stray ? 0.4 + rnd() * 0.3 : 0.6 + rnd() * 0.4,
  };
}

/** Seconds each grain takes to be dragged home. */
export const GUST = 1.8;
/** How many stick-slip pulls the drag home is made of. */
const PULLS = 5;
/** Largest shudder, in px, at the middle of the drag. */
const SHUDDER = 1.2;

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
  g.gx = g.hx;
  g.gy = g.hy;
  g.delay = (g.fx / Math.max(width, 1)) * 0.5 + rnd() * 0.25;
}

/**
 * Where a grain caught in a gust is, `t` seconds after the gust began: dragged slowly
 * along the ground to where it lay on load, in a few stick-slip pulls, shuddering as it
 * goes and settling still at the end. `done` once it is home.
 */
export function gustAt(g: Grain, t: number): { x: number; y: number; done: boolean } {
  const u = Math.max(0, Math.min(1, (t - g.delay) / GUST));
  if (u >= 1) return { x: g.gx, y: g.gy, done: true };
  // Stick-slip: progress pauses and lurches PULLS times but never slides backward.
  const s = u * u * (3 - 2 * u);
  const e = s - Math.sin(2 * Math.PI * PULLS * s) / (2 * Math.PI * PULLS);
  // A fine shudder that is strongest mid-drag and gone at both ends.
  const shake = SHUDDER * Math.sin(Math.PI * u);
  const seed = g.fx * 1.7 + g.fy * 0.9;
  return {
    x: g.fx + (g.gx - g.fx) * e + shake * Math.sin(t * 57 + seed),
    y: g.fy + (g.gy - g.fy) * e + shake * Math.sin(t * 43 + seed * 1.3),
    done: false,
  };
}

/** Seconds a puff of wind moves the sand for. */
export const WIND = 1.2;
/** How far, in px, the puff pushes a grain right at its source. */
const PUSH = 30;
/** Half-width of the puff, in px, where it leaves the book. */
const MOUTH = 40;
/** How much the puff widens per px travelled (tan of its half-angle, about 30°). */
const SPREAD = Math.tan((30 * Math.PI) / 180);

// The puff's speed envelope: phase boundaries as fractions of WIND, and the steady
// drift speed during sustain relative to the peak.
const ATTACK = 0.15;
const DECAY = 0.3;
const SUSTAIN = 0.6;
const RELEASE = 0.75;
const AREAS = [
  ATTACK / 2,
  ((DECAY - ATTACK) * (1 + SUSTAIN)) / 2,
  (RELEASE - DECAY) * SUSTAIN,
  ((1 - RELEASE) * SUSTAIN) / 2,
];
const TOTAL = AREAS.reduce((a, b) => a + b, 0);

/**
 * Progress along a puff's path, shaped like a sound envelope: attack (speed builds to a
 * peak), decay (eases to a steady drift), sustain (drifts), release (comes to rest).
 * `u` is the fraction of the puff elapsed; returns the fraction of the path covered.
 */
export function adsr(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  let area: number;
  if (c < ATTACK) {
    area = (c * c) / (2 * ATTACK);
  } else if (c < DECAY) {
    const x = c - ATTACK;
    area = AREAS[0]! + x - ((1 - SUSTAIN) * x * x) / (2 * (DECAY - ATTACK));
  } else if (c < RELEASE) {
    area = AREAS[0]! + AREAS[1]! + (c - DECAY) * SUSTAIN;
  } else {
    const x = c - RELEASE;
    area = TOTAL - AREAS[3]! + SUSTAIN * x - (SUSTAIN * x * x) / (2 * (1 - RELEASE));
  }
  return area / TOTAL;
}

/**
 * Catch a grain in a puff of wind leaving (ox, oy) along the unit direction (dx, dy) and
 * reaching `reach` px. The puff is a widening beam: grains inside it are pushed straight
 * along the wind, more near its source and its middle. Every caught grain starts moving at
 * once. Returns false (and leaves the grain alone) if it lies outside the beam.
 */
export function startWind(
  g: Grain,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  reach: number,
): boolean {
  const rx = g.tx - ox;
  const ry = g.ty - oy;
  const along = rx * dx + ry * dy;
  if (along <= 0 || along >= reach) return false;
  const across = Math.abs(rx * dy - ry * dx);
  const halfWidth = MOUTH + along * SPREAD;
  if (across >= halfWidth) return false;
  const push = PUSH * (1 - along / reach) * (1 - across / halfWidth);
  g.fx = g.tx;
  g.fy = g.ty;
  g.gx = g.tx + dx * push;
  g.gy = g.ty + dy * push;
  g.delay = 0;
  return true;
}

/**
 * Where a grain caught in a puff of wind is, `t` seconds after the puff began: moving in
 * a straight line toward where the wind leaves it, with the puff's speed envelope.
 */
export function windAt(g: Grain, t: number): { x: number; y: number; done: boolean } {
  const u = (t - g.delay) / WIND;
  if (u >= 1) return { x: g.gx, y: g.gy, done: true };
  const e = adsr(u);
  return { x: g.fx + (g.gx - g.fx) * e, y: g.fy + (g.gy - g.fy) * e, done: false };
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
