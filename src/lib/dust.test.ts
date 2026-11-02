import { describe, expect, it } from "vitest";
import {
  ATTACK,
  GATHER,
  grainAt,
  letterAt,
  makeGrain,
  normal,
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

  it("is moving toward its target during decay", () => {
    const mid = grainAt(g, g.delay + ATTACK + g.dec / 2);
    const start = Math.hypot(g.sx + g.kx - g.tx, g.sy + g.ky - g.ty);
    expect(Math.hypot(mid.x - g.tx, mid.y - g.ty)).toBeLessThan(start);
  });

  it("rests exactly on its target once settled, and stays there", () => {
    const end = g.delay + ATTACK + g.dec;
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
    const expected = Math.max(...grains.map((g) => g.delay + ATTACK + g.dec));
    expect(settleTime(grains)).toBe(expected);
  });

  it("is 0 for no grains", () => {
    expect(settleTime([])).toBe(0);
  });
});
