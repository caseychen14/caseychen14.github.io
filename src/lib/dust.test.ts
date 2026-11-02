import { describe, expect, it } from "vitest";
import {
  ATTACK,
  BOUNCE,
  GATHER,
  grainAt,
  letterAt,
  makeGrain,
  normal,
  plough,
  settleTime,
  type Letter,
} from "./dust";

// Deterministic generator so the tests don't flake.
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const letter = (line: number, idx: number, x0: number, w = 80): Letter => ({
  line,
  x1: x0 + w + 10,
  cx: x0 + w / 2,
  cy: 100 + line * 150,
  w,
  idx,
});

describe("normal", () => {
  it("has mean near 0 and standard deviation near 1", () => {
    const rnd = seeded();
    const xs = Array.from({ length: 20000 }, () => normal(rnd));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
  });
});

describe("letterAt", () => {
  const letters = [letter(0, 0, 0), letter(0, 1, 90), letter(1, 2, 0), letter(1, 3, 90)];

  it("picks the letter on the same line whose span holds the pixel", () => {
    expect(letterAt(letters, 40, 0).idx).toBe(0);
    expect(letterAt(letters, 120, 0).idx).toBe(1);
    expect(letterAt(letters, 120, 1).idx).toBe(3);
  });

  it("falls back to the last letter on the line for pixels past the end", () => {
    expect(letterAt(letters, 999, 0).idx).toBe(1);
  });
});

describe("grainAt", () => {
  const rnd = seeded(7);
  const L = letter(0, 3, 200);
  const g = makeGrain(230, 120, L, 132, false, rnd);

  it("starts in a clump around its own letter", () => {
    expect(Math.abs(g.sx - L.cx)).toBeLessThan(L.w);
    expect(Math.abs(g.sy - L.cy)).toBeLessThan(132);
  });

  it("waits in the clump, fading in, until its delay", () => {
    const early = grainAt(g, 0);
    expect(early.a).toBe(0);
    const waiting = grainAt(g, GATHER / 2);
    expect(Math.hypot(waiting.x - g.sx, waiting.y - g.sy)).toBeLessThanOrEqual(2 * Math.SQRT2);
  });

  it("falls under constant gravity: a parabola, accelerating downward", () => {
    // Sample the flight at equal steps; under constant gravity the vertical velocity
    // changes by the same amount each step (second differences are equal and positive,
    // since y grows downward).
    const at = (u: number) => grainAt(g, g.delay + ATTACK + g.fall * u).y;
    const ys = [0.2, 0.4, 0.6, 0.8].map(at);
    const d1 = ys[1]! - 2 * ys[0]! + at(0);
    const d2 = ys[2]! - 2 * ys[1]! + ys[0]!;
    const d3 = ys[3]! - 2 * ys[2]! + ys[1]!;
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBeCloseTo(d1, 6);
    expect(d3).toBeCloseTo(d1, 6);
  });

  it("is tossed above the straight path mid-flight", () => {
    const mid = grainAt(g, g.delay + ATTACK + g.fall / 2);
    const straightY = (g.sy + g.ky + g.ty) / 2;
    expect(mid.y).toBeCloseTo(straightY - g.toss, 6);
  });

  it("only bounces upward from its landing spot", () => {
    for (const b of [0.1, 0.25, 0.4, 0.75]) {
      const p = grainAt(g, g.delay + ATTACK + g.fall + BOUNCE * b);
      expect(p.x).toBe(g.tx);
      expect(p.y).toBeLessThanOrEqual(g.ty);
      expect(g.ty - p.y).toBeLessThanOrEqual(g.hop);
    }
  });

  it("rests exactly on its target once settled, and stays there", () => {
    const end = g.delay + ATTACK + g.fall + BOUNCE;
    for (const s of [end, end + 5, Infinity]) {
      const p = grainAt(g, s);
      expect([p.x, p.y]).toEqual([g.tx, g.ty]);
    }
  });

  it("later letters leave later", () => {
    const a = makeGrain(0, 0, letter(0, 0, 0), 132, false, () => 0.5);
    const b = makeGrain(0, 0, letter(0, 10, 0), 132, false, () => 0.5);
    expect(b.delay).toBeGreaterThan(a.delay);
  });
});

describe("settleTime", () => {
  it("is when the slowest grain arrives", () => {
    const rnd = seeded(3);
    const grains = [0, 5, 9].map((i) => makeGrain(0, 0, letter(0, i, 0), 132, false, rnd));
    const expected = Math.max(...grains.map((g) => g.delay + ATTACK + g.fall + BOUNCE));
    expect(settleTime(grains)).toBe(expected);
  });

  it("is 0 for no grains", () => {
    expect(settleTime([])).toBe(0);
  });
});

describe("plough", () => {
  const grainAtRest = (x: number, y: number) =>
    makeGrain(x, y, letter(0, 0, 0), 132, false, seeded(1));

  it("clears grains out of the stick's path, piling them just beyond its edge", () => {
    const inPath = [grainAtRest(50, 100), grainAtRest(80, 102), grainAtRest(120, 98)];
    const w = 8;
    plough(inPath, [0, 100], [200, 100], w, seeded(2));
    for (const g of inPath) {
      const d = Math.abs(g.ty - 100);
      expect(d).toBeGreaterThanOrEqual(w * 1.15);
      expect(d).toBeLessThanOrEqual(w * 1.15 + 3.5);
    }
  });

  it("pushes each grain to the side it was already on", () => {
    const above = grainAtRest(60, 97);
    const below = grainAtRest(60, 103);
    plough([above, below], [0, 100], [200, 100], 8);
    expect(above.ty).toBeLessThan(100);
    expect(below.ty).toBeGreaterThan(100);
  });

  it("leaves grains outside the groove alone and reports how many moved", () => {
    const far = grainAtRest(60, 140);
    const near = grainAtRest(60, 101);
    expect(plough([far, near], [0, 100], [200, 100], 8)).toBe(1);
    expect([far.tx, far.ty]).toEqual([60, 140]);
  });

  it("moves where the grain comes to rest, so the mark stays", () => {
    const g = grainAtRest(60, 101);
    plough([g], [0, 100], [200, 100], 8);
    const settled = grainAt(g, Infinity);
    expect([settled.x, settled.y]).toEqual([g.tx, g.ty]);
    expect(Math.abs(settled.y - 100)).toBeGreaterThan(8);
  });
});
