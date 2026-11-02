import { describe, expect, it } from "vitest";
import { makeGrain, patternPoints, plough } from "./dust";

// Deterministic generator so the tests don't flake.
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("makeGrain", () => {
  it("lies where it is placed", () => {
    const g = makeGrain(12, 34, false, seeded());
    expect([g.tx, g.ty]).toEqual([12, 34]);
  });

  it("makes strays smaller and fainter than letter grains", () => {
    const rnd = seeded(9);
    for (let i = 0; i < 50; i++) {
      const stray = makeGrain(0, 0, true, rnd);
      const grain = makeGrain(0, 0, false, rnd);
      expect(stray.sz).toBeLessThanOrEqual(grain.sz);
      expect(stray.a).toBeLessThan(0.7);
      expect(grain.a).toBeGreaterThanOrEqual(0.6);
    }
  });
});

describe("plough", () => {
  const at = (x: number, y: number) => makeGrain(x, y, false, seeded(1));

  it("clears grains out of the stick's path, piling them just beyond its edge", () => {
    const inPath = [at(50, 100), at(80, 102), at(120, 98)];
    const w = 8;
    plough(inPath, [0, 100], [200, 100], w, seeded(2));
    for (const g of inPath) {
      const d = Math.abs(g.ty - 100);
      expect(d).toBeGreaterThanOrEqual(w * 1.15);
      expect(d).toBeLessThanOrEqual(w * 1.15 + 3.5);
    }
  });

  it("pushes each grain to the side it was already on", () => {
    const above = at(60, 97);
    const below = at(60, 103);
    plough([above, below], [0, 100], [200, 100], 8);
    expect(above.ty).toBeLessThan(100);
    expect(below.ty).toBeGreaterThan(100);
  });

  it("leaves grains outside the groove alone and reports how many moved", () => {
    const far = at(60, 140);
    const near = at(60, 101);
    expect(plough([far, near], [0, 100], [200, 100], 8)).toBe(1);
    expect([far.tx, far.ty]).toEqual([60, 140]);
  });
});

describe("patternPoints", () => {
  it("decodes one bit per cell, row by row, into cell centers", () => {
    // 4×2 grid of 2px cells; bits 0 and 5 set → byte 0b00100001 = 33 = "IQ==".
    const p = { text: "x", width: 8, height: 4, cell: 2, cols: 4, rows: 2, bits: "IQ==" };
    expect(patternPoints(p)).toEqual([
      [1, 1],
      [3, 3],
    ]);
  });

  it("reads the saved hero pattern", async () => {
    const saved = (await import("./assets/hero-pattern.json")).default;
    const points = patternPoints(saved);
    expect(points).toHaveLength(6856);
    for (const [x, y] of points) {
      expect(x).toBeLessThan(saved.width + saved.cell);
      expect(y).toBeLessThan(saved.height + saved.cell);
    }
  });
});
