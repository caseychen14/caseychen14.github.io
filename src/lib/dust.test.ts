import { describe, expect, it } from "vitest";
import {
  GUST,
  WIND,
  displaced,
  gustAt,
  makeGrain,
  patternPoints,
  plough,
  startGust,
  startWind,
  windAt,
} from "./dust";

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

describe("gust", () => {
  const drawnAway = () => {
    const g = makeGrain(100, 100, false, seeded(4));
    plough([g], [90, 101], [110, 101], 8);
    return g;
  };

  it("knows which grains have been moved by drawing", () => {
    const g = makeGrain(10, 10, false);
    expect(displaced(g)).toBe(false);
    expect(displaced(drawnAway())).toBe(true);
  });

  it("starts each grain where it lies now", () => {
    const g = drawnAway();
    startGust(g, 600, () => 0);
    const p = gustAt(g, g.delay);
    expect([p.x, p.y]).toEqual([g.tx, g.ty]);
    expect(p.done).toBe(false);
  });

  it("drags grains along the ground, creeping closer, and stops exactly where they lay on load", () => {
    const g = drawnAway();
    startGust(g, 600, () => 0);
    const dist = (u: number) => {
      const p = gustAt(g, g.delay + GUST * u);
      return Math.hypot(p.x - g.hx, p.y - g.hy);
    };
    const start = Math.hypot(g.fx - g.hx, g.fy - g.hy);
    // Never lifted or thrown past home: it only creeps closer (give or take the shudder).
    let prev = start;
    for (const u of [0.25, 0.5, 0.75]) {
      expect(dist(u)).toBeLessThanOrEqual(prev + 2 * 1.2);
      prev = dist(u);
    }
    expect(dist(0.75)).toBeLessThan(start);
    expect(gustAt(g, g.delay + GUST)).toEqual({ x: g.hx, y: g.hy, done: true });
  });

  it("never jumps: the shudder is fine and the drag is slow", () => {
    const g = drawnAway();
    startGust(g, 600, () => 0);
    // A millisecond apart, a grain should barely have moved.
    for (let u = 0.1; u < 0.9; u += 0.1) {
      const t = g.delay + GUST * u;
      const a = gustAt(g, t);
      const b = gustAt(g, t + 0.001);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.2);
    }
  });

  it("sweeps left to right: grains further right wait longer for the gust", () => {
    const left = makeGrain(50, 0, false);
    const right = makeGrain(550, 0, false);
    startGust(left, 600, () => 0.5);
    startGust(right, 600, () => 0.5);
    expect(right.delay).toBeGreaterThan(left.delay);
  });
});

describe("wind from a corner", () => {
  // A 600×300 canvas with the puff coming from its bottom-right corner.
  const corner = [600, 300] as const;
  const reach = 400;

  it("pushes nearby grains away from the corner", () => {
    const g = makeGrain(560, 270, false);
    expect(startWind(g, ...corner, reach, () => 0.5)).toBe(true);
    const before = Math.hypot(g.fx - corner[0], g.fy - corner[1]);
    const after = Math.hypot(g.gx - corner[0], g.gy - corner[1]);
    expect(after).toBeGreaterThan(before);
  });

  it("pushes grains less the further they are from the corner", () => {
    const near = makeGrain(570, 280, false);
    const far = makeGrain(350, 150, false);
    startWind(near, ...corner, reach, () => 0.5);
    startWind(far, ...corner, reach, () => 0.5);
    const moved = (g: typeof near) => Math.hypot(g.gx - g.fx, g.gy - g.fy);
    expect(moved(near)).toBeGreaterThan(moved(far));
  });

  it("leaves grains out of reach alone", () => {
    const g = makeGrain(20, 20, false);
    expect(startWind(g, ...corner, reach)).toBe(false);
    expect([g.gx, g.gy]).toEqual([20, 20]);
  });

  it("reaches distant grains later, like a front spreading from the corner", () => {
    const near = makeGrain(580, 290, false);
    const far = makeGrain(400, 200, false);
    startWind(near, ...corner, reach, () => 0.5);
    startWind(far, ...corner, reach, () => 0.5);
    expect(far.delay).toBeGreaterThan(near.delay);
  });

  it("settles each grain exactly where the wind left it, displaced from home", () => {
    const g = makeGrain(560, 270, false);
    startWind(g, ...corner, reach, () => 0.5);
    expect(windAt(g, g.delay + WIND)).toEqual({ x: g.gx, y: g.gy, done: true });
    g.tx = g.gx;
    g.ty = g.gy;
    expect(displaced(g)).toBe(true);
  });
});
