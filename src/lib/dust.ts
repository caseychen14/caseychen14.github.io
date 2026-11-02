/**
 * The dust hero (DustText.svelte), kept free of the DOM so it can be tested. The words
 * are made of loose grains that visitors can draw in: a drag pushes grains aside into
 * ridges, a puff of wind scatters them, and the marks stay until a gust drags every
 * grain back home.
 */

export type Rng = () => number;

export interface Grain {
  /** Where the grain lies. */
  tx: number;
  ty: number;
  /** Where it lay when the page loaded; a gust drags it back here. */
  hx: number;
  hy: number;
  /** While dragged home: where it started, where it is headed, how long it waits to go. */
  fx: number;
  fy: number;
  gx: number;
  gy: number;
  delay: number;
  /** While blown by wind: its velocity (px/s) and the wind's pull on it (px/s² at peak). */
  vx: number;
  vy: number;
  wx: number;
  wy: number;
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
    vx: 0,
    vy: 0,
    wx: 0,
    wy: 0,
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

/** Seconds the puff of wind blows for. Grains keep sliding a little after it stops. */
export const WIND = 1.0;
/** The puff's pull at its source, in px/s², on a grain of average weight. */
const PULL = 330;
/** A grain only moves if the wind pulls it harder than this (px/s²): sand sticks. */
const STICK = 10;
/** How sharply the puff weakens with distance from the book (1 = evenly). */
const FADE = 1.6;
/** Ground friction: how quickly a sliding grain loses speed (per second). */
const FRICTION = 4;
/** Below this speed (px/s), once the wind has died, a grain comes to rest. */
const REST = 2;
/** How far either side of the wind's direction each grain may be pushed (radians). */
const SCATTER = (20 * Math.PI) / 180;
/** Half-width of the puff, in px, where it leaves the book. */
const MOUTH = 40;
/** How much the puff widens per px travelled (tan of its half-angle, 60°). */
const SPREAD = Math.tan((60 * Math.PI) / 180);

// The puff's strength over time, shaped like a sound envelope (fractions of WIND):
// attack (builds to full), decay (eases to a steady blow), sustain, release (dies away).
const ATTACK = 0.15;
const DECAY = 0.3;
const SUSTAIN = 0.6;
const RELEASE = 0.75;

/** How hard the puff is blowing, from 0 to 1, `t` seconds after it began. */
export function windStrength(t: number): number {
  const u = t / WIND;
  if (u <= 0 || u >= 1) return 0;
  if (u < ATTACK) return u / ATTACK;
  if (u < DECAY) return 1 - ((1 - SUSTAIN) * (u - ATTACK)) / (DECAY - ATTACK);
  if (u < RELEASE) return SUSTAIN;
  return (SUSTAIN * (1 - u)) / (1 - RELEASE);
}

/**
 * Catch a grain in a puff of wind leaving (ox, oy) along the unit direction (dx, dy) and
 * reaching `reach` px. The puff is a widening beam, strongest near its source and middle.
 * Each grain gets its own pull: a little off the wind's direction, a little stronger or
 * weaker, and weaker on heavier grains. Returns false (and leaves the grain alone) if it
 * lies outside the beam or the pull is too weak to unstick it.
 */
export function startWind(
  g: Grain,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  reach: number,
  rnd: Rng = Math.random,
): boolean {
  const rx = g.tx - ox;
  const ry = g.ty - oy;
  const along = rx * dx + ry * dy;
  if (along <= 0 || along >= reach) return false;
  const across = Math.abs(rx * dy - ry * dx);
  const halfWidth = MOUTH + along * SPREAD;
  if (across >= halfWidth) return false;
  const weight = g.sz / 1.6;
  // Dies away quickly with distance, so the farthest sand barely stirs, and eases off
  // gently toward the sides so the wide beam still reaches its edges.
  const distance = (1 - along / reach) ** FADE;
  const side = 1 - (across / halfWidth) ** 2;
  const pull = (PULL * distance * side * (0.6 + rnd() * 0.8)) / weight;
  if (pull < STICK) return false;
  const turn = (rnd() * 2 - 1) * SCATTER;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  g.wx = (dx * c - dy * s) * pull;
  g.wy = (dx * s + dy * c) * pull;
  g.vx = 0;
  g.vy = 0;
  return true;
}

/** The figure beside the hero leans this far counter-clockwise (matches its CSS). */
export const LEAN = (30 * Math.PI) / 180;
/** Where the figure's book sits, leaned, relative to the canvas's bottom-right corner. */
const BOOK: readonly [number, number] = [-75, 34];
/** The puff starts this far (px) behind the book, so it also catches sand right beside it. */
const BEHIND = 40;

/**
 * Where the figure's puff of wind starts, which way it blows (the way the leaning book
 * points: up and to the left) and how far it reaches, over a canvas `width` × `height`.
 */
export function puffFrom(width: number, height: number) {
  const dx = -Math.sin(LEAN);
  const dy = -Math.cos(LEAN);
  return {
    ox: width + BOOK[0] - dx * BEHIND,
    oy: height + BOOK[1] - dy * BEHIND,
    dx,
    dy,
    // Far enough, with the beam's width, to reach every grain of the words.
    reach: Math.hypot(width, height) * 1.15,
  };
}

/**
 * Advance a grain caught in a puff of wind by `dt` seconds, `t` seconds after the puff
 * began: the wind pulls it (following the puff's strength), friction slows it, and it
 * slides along the ground. Returns false once it has come to rest.
 */
export function windStep(g: Grain, t: number, dt: number): boolean {
  const k = windStrength(t);
  g.vx += g.wx * k * dt;
  g.vy += g.wy * k * dt;
  const keep = Math.exp(-FRICTION * dt);
  g.vx *= keep;
  g.vy *= keep;
  if (k === 0 && t >= WIND && Math.hypot(g.vx, g.vy) < REST) {
    g.vx = 0;
    g.vy = 0;
    return false;
  }
  g.tx += g.vx * dt;
  g.ty += g.vy * dt;
  return true;
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
