/**
 * Motion for the dust hero (DustText.svelte), kept free of the DOM so it can be tested.
 * Each letter gathers a small Gaussian clump of grains. Each grain lifts out of the clump
 * (attack), is tossed up and falls under gravity onto its place in the letter, bounces
 * a couple of times, and stays put.
 */

/** Seconds the clumps take to fade in before any grain leaves. */
export const GATHER = 0.7;
/** Seconds of the quick lift out of the clump. */
export const ATTACK = 0.3;
/** Seconds of the landing bounces. */
export const BOUNCE = 0.4;

export type Rng = () => number;

export interface Letter {
  line: number;
  /** Right edge, including half the gap to the next letter. */
  x1: number;
  cx: number;
  cy: number;
  w: number;
  /** Position across the whole text; later letters start later. */
  idx: number;
}

export interface Grain {
  /** Resting place. */
  tx: number;
  ty: number;
  /** Start, inside the letter's clump. */
  sx: number;
  sy: number;
  /** Attack lift, away from the clump's center. */
  kx: number;
  ky: number;
  delay: number;
  /** Seconds in the air between the lift and landing. */
  fall: number;
  /** Peak height of the toss above the straight line from lift to landing, px. */
  toss: number;
  /** Height of the first landing bounce, px. */
  hop: number;
  ph: number;
  sz: number;
  a: number;
}

/** Standard normal sample (Box–Muller). */
export function normal(rnd: Rng = Math.random): number {
  let u = 0;
  while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** The letter a pixel on `line` belongs to: the first whose right edge reaches it. */
export function letterAt(letters: Letter[], px: number, line: number): Letter {
  const row = letters.filter((l) => l.line === line);
  return row.find((l) => px <= l.x1) ?? row[row.length - 1]!;
}

export function makeGrain(
  tx: number,
  ty: number,
  letter: Letter,
  size: number,
  stray: boolean,
  rnd: Rng = Math.random,
): Grain {
  const sx = letter.cx + normal(rnd) * letter.w * 0.22;
  const sy = letter.cy + normal(rnd) * size * 0.16;
  const len = Math.hypot(sx - letter.cx, sy - letter.cy) || 1;
  const kick = 3 + rnd() * 6;
  return {
    tx,
    ty,
    sx,
    sy,
    kx: ((sx - letter.cx) / len) * kick,
    ky: ((sy - letter.cy) / len) * kick - 2,
    delay: GATHER + letter.idx * 0.07 + rnd() * 0.5,
    fall: 0.7 + rnd() * 0.4,
    toss: size * (0.15 + rnd() * 0.3),
    hop: stray ? 1 : 1.5 + rnd() * 3,
    ph: rnd() * Math.PI * 2,
    sz: stray ? 1 : rnd() < 0.15 ? 2.2 : 1.3 + rnd() * 0.6,
    a: stray ? 0.4 + rnd() * 0.3 : 0.6 + rnd() * 0.4,
  };
}

/** Where a grain is, and how opaque, `s` seconds in. `Infinity` gives the settled state. */
export function grainAt(g: Grain, s: number): { x: number; y: number; a: number } {
  const t = s - g.delay;
  if (t < 0) {
    // Waiting in the clump, drifting slightly.
    return {
      x: g.sx + Math.sin(s * 1.3 + g.ph) * 2,
      y: g.sy + Math.cos(s * 1.1 + g.ph) * 2,
      a: g.a * Math.min(1, s / GATHER) * 0.5,
    };
  }
  if (t < ATTACK) {
    const e = 1 - (1 - t / ATTACK) ** 2;
    return { x: g.sx + g.kx * e, y: g.sy + g.ky * e, a: g.a };
  }
  const land = ATTACK + g.fall;
  if (t < land) {
    // A projectile: steady sideways, a parabola up and down (constant gravity), so it
    // speeds up as it falls and hits the ground moving fast.
    const u = (t - ATTACK) / g.fall;
    const ox = g.sx + g.kx;
    const oy = g.sy + g.ky;
    return {
      x: ox + (g.tx - ox) * u,
      y: oy + (g.ty - oy) * u - g.toss * 4 * u * (1 - u),
      a: g.a,
    };
  }
  if (t < land + BOUNCE) {
    // Two shrinking hops, each a little parabola, then still.
    const b = (t - land) / BOUNCE;
    return {
      x: g.tx,
      y: g.ty - g.hop * Math.abs(Math.sin(2 * Math.PI * b)) * (1 - b) ** 2,
      a: g.a,
    };
  }
  return { x: g.tx, y: g.ty, a: g.a };
}

/** Seconds until every grain has come to rest. */
export function settleTime(grains: Iterable<Grain>): number {
  let t = 0;
  for (const g of grains) t = Math.max(t, g.delay + ATTACK + g.fall + BOUNCE);
  return t;
}

/**
 * Drag a stick from `a` to `b`, cutting a groove `w` px wide: grains whose resting place
 * lies in its path are shoved out to the groove's edges, where they pile into ridges.
 * Moves the grains' resting places, so the marks stay. Returns how many grains moved.
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
