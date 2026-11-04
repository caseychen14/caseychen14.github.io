import { describe, expect, it } from "vitest";
import {
  GUST,
  WIND,
  displaced,
  gustAt,
  makeGrain,
  pairByLetter,
  pairWithInk,
  patternPoints,
  plough,
  puffFrom,
  startGust,
  startGustTo,
  startWind,
  windStep,
  windStrength,
  type Grain,
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

describe("windStrength", () => {
  it("builds to full, eases to a steady blow, then dies away", () => {
    expect(windStrength(0)).toBe(0);
    expect(windStrength(WIND * 0.15)).toBeCloseTo(1, 6); // attack peak
    expect(windStrength(WIND * 0.07)).toBeLessThan(1); // still building
    expect(windStrength(WIND * 0.4)).toBeCloseTo(windStrength(WIND * 0.7), 10); // sustain
    expect(windStrength(WIND * 0.9)).toBeLessThan(windStrength(WIND * 0.7)); // release
    expect(windStrength(WIND)).toBe(0);
  });
});

describe("wind", () => {
  // Blowing up and to the left, 30° counter-clockwise from straight up, from (600, 300).
  const lean = (30 * Math.PI) / 180;
  const dir = [-Math.sin(lean), -Math.cos(lean)] as const;
  const from = [600, 300] as const;
  const reach = 500;
  const inBeam = (along: number, across = 0, size = 1.6) => {
    const g = makeGrain(
      from[0] + dir[0] * along - dir[1] * across,
      from[1] + dir[1] * along + dir[0] * across,
      false,
    );
    g.sz = size;
    return g;
  };
  const pullOf = (g: Grain) => Math.hypot(g.wx, g.wy);
  // Run the physics at 60 fps until the grain stops (or 5 s pass).
  const blow = (g: Grain) => {
    let t = 0;
    while (windStep(g, t, 1 / 60) && t < 5) t += 1 / 60;
  };

  it("pulls grains in the beam downwind, each scattered within 20° of the wind", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const g = inBeam(80, 5);
      expect(startWind(g, ...from, ...dir, reach, () => r)).toBe(true);
      const cos = (g.wx * dir[0] + g.wy * dir[1]) / pullOf(g);
      expect(cos).toBeGreaterThanOrEqual(Math.cos((20 * Math.PI) / 180) - 1e-9);
    }
  });

  it("scatters: grains pushed with different luck head off in different directions", () => {
    const a = inBeam(80);
    const b = inBeam(80);
    startWind(a, ...from, ...dir, reach, () => 0.1);
    startWind(b, ...from, ...dir, reach, () => 0.9);
    expect(Math.atan2(a.wy, a.wx)).not.toBeCloseTo(Math.atan2(b.wy, b.wx), 2);
  });

  it("blows slower further away and nearer the beam's edge", () => {
    const near = inBeam(50);
    const far = inBeam(300);
    const edge = inBeam(50, 60);
    for (const g of [near, far, edge]) startWind(g, ...from, ...dir, reach, () => 0.5);
    expect(pullOf(near)).toBeGreaterThan(pullOf(far));
    expect(pullOf(near)).toBeGreaterThan(pullOf(edge));
  });

  it("moves heavier grains less in the same wind", () => {
    const light = inBeam(60, 0, 1.6);
    const heavy = inBeam(60, 0, 2.2);
    for (const g of [light, heavy]) {
      startWind(g, ...from, ...dir, reach, () => 0.5);
      blow(g);
    }
    const moved = (g: Grain) => Math.hypot(g.tx - g.hx, g.ty - g.hy);
    expect(moved(light)).toBeGreaterThan(moved(heavy));
  });

  it("sticks: a grain the wind can't unstick stays exactly where it is", () => {
    const g = inBeam(60);
    startWind(g, ...from, ...dir, reach, () => 0.5);
    g.wx *= 0.05; // a breath too weak to beat the ground's grip
    g.wy *= 0.05;
    blow(g);
    expect([g.tx, g.ty]).toEqual([g.hx, g.hy]);
  });

  it("stops sharply on the ground rather than coasting to a halt", () => {
    const g = inBeam(60, 0, 2.2); // heavy, so it only slides
    startWind(g, ...from, ...dir, reach, () => 0.5);
    let t = 0;
    let slowFrames = 0;
    while (windStep(g, t, 1 / 60)) {
      t += 1 / 60;
      const v = Math.hypot(g.vx, g.vy);
      if (t > WIND && v > 0 && v < 5) slowFrames++;
    }
    expect(slowFrames).toBeLessThan(12); // under a fifth of a second creeping slowly
  });

  it("a second puff keeps grains moving from the first and pushes them further", () => {
    const once = inBeam(60);
    const twice = inBeam(60);
    for (const g of [once, twice]) startWind(g, ...from, ...dir, reach, () => 0.5);
    // Both slide for half a second; then a second puff catches one of them.
    let t = 0;
    for (; t < 0.5; t += 1 / 60) {
      windStep(once, t, 1 / 60, () => 0.5);
      windStep(twice, t, 1 / 60, () => 0.5);
    }
    const speed = Math.hypot(twice.vx, twice.vy);
    expect(speed).toBeGreaterThan(0);
    startWind(twice, ...from, ...dir, reach, () => 0.5);
    expect(Math.hypot(twice.vx, twice.vy)).toBe(speed); // momentum kept
    while (windStep(once, t, 1 / 60, () => 0.5) && t < 5) t += 1 / 60;
    for (let t2 = 0; windStep(twice, t2, 1 / 60, () => 0.5) && t2 < 5; t2 += 1 / 60);
    const moved = (g: Grain) => Math.hypot(g.tx - g.hx, g.ty - g.hy);
    expect(moved(twice)).toBeGreaterThan(moved(once));
  });

  it("lets light grains hop, while heavy grains only slide", () => {
    const hops = (size: number) => {
      const g = inBeam(40, 0, size);
      startWind(g, ...from, ...dir, reach, () => 0.5);
      let rolls = 0;
      const lucky = () => (rolls++ % 2 ? 0.5 : 0.01); // hop whenever allowed
      let t = 0;
      let airborne = 0;
      while (windStep(g, t, 1 / 60, lucky) && t < 5) {
        t += 1 / 60;
        if (g.air > 0) airborne++;
      }
      return airborne;
    };
    expect(hops(1.3)).toBeGreaterThan(0);
    expect(hops(2.2)).toBe(0);
  });

  it("leaves grains behind the source, out of reach, outside the beam, or stuck alone", () => {
    const behind = inBeam(-20);
    const beyond = inBeam(reach + 10);
    const outside = inBeam(100, 400);
    const stuck = inBeam(reach - 20); // barely any pull this far out
    for (const g of [behind, beyond, outside, stuck]) {
      expect(startWind(g, ...from, ...dir, reach, () => 0.5)).toBe(false);
    }
  });

  it("slides each grain downwind in a straight line, without shudder, then stops", () => {
    const g = inBeam(60, 4, 1.3); // light, so it hops too
    startWind(g, ...from, ...dir, reach, () => 0.5);
    const [x0, y0] = [g.tx, g.ty];
    const heading = Math.atan2(g.wy, g.wx);
    let t = 0;
    let lastAlong = 0;
    while (windStep(g, t, 1 / 60)) {
      t += 1 / 60;
      const mx = g.tx - x0;
      const my = g.ty - y0;
      const along = mx * Math.cos(heading) + my * Math.sin(heading);
      const across = -mx * Math.sin(heading) + my * Math.cos(heading);
      expect(Math.abs(across)).toBeLessThan(1e-6); // never wobbles off its line
      expect(along).toBeGreaterThanOrEqual(lastAlong); // never slides back
      lastAlong = along;
    }
    expect(lastAlong).toBeGreaterThan(5);
    expect(lastAlong).toBeLessThan(80);
    expect(t).toBeLessThan(3);
    expect(windStep(g, t + 1, 1 / 60)).toBe(false); // stays put
  });

  it("blows near grains further than far ones, and leaves them displaced", () => {
    const near = inBeam(40);
    const far = inBeam(250);
    for (const g of [near, far]) {
      startWind(g, ...from, ...dir, reach, () => 0.5);
      blow(g);
    }
    const moved = (g: Grain) => Math.hypot(g.tx - g.hx, g.ty - g.hy);
    expect(moved(near)).toBeGreaterThan(moved(far));
    expect(displaced(near)).toBe(true);
  });
});

describe("puffFrom", () => {
  it("blows up and to the left, the way the leaning figure's book points", () => {
    const p = puffFrom(669, 324);
    expect(p.dx).toBeLessThan(0);
    expect(p.dy).toBeLessThan(0);
    expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(1, 10);
  });

  it("reaches every grain of the hero, even with the weakest luck on the heaviest grains", () => {
    for (const [w, h] of [
      [669, 324],
      [960, 466],
      [327, 159],
    ] as const) {
      const p = puffFrom(w, h);
      for (let x = 0; x <= w; x += w / 20) {
        for (let y = 0; y <= h; y += h / 10) {
          const g = makeGrain(x, y, false);
          g.sz = 2.2;
          expect(startWind(g, p.ox, p.oy, p.dx, p.dy, p.reach, () => 0)).toBe(true);
        }
      }
    }
  });
});

describe("puff strength across the hero", () => {
  // Run one grain through a whole puff and report how far it slid.
  const slide = (x: number, y: number, w: number, h: number) => {
    const p = puffFrom(w, h);
    const g = makeGrain(x, y, false);
    g.sz = 1.6;
    if (!startWind(g, p.ox, p.oy, p.dx, p.dy, p.reach, () => 0.5)) return 0;
    let t = 0;
    while (windStep(g, t, 1 / 60) && t < 5) t += 1 / 60;
    return Math.hypot(g.tx - x, g.ty - y);
  };

  it("barely stirs the farthest sand at the top left, and moves the sand near the book plenty", () => {
    const [w, h] = [669, 324];
    const far = slide(0, 0, w, h);
    const near = slide(w - 80, h - 40, w, h);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(4);
    expect(near).toBeGreaterThan(far * 8);
  });
});

describe("pairWithInk", () => {
  const blob = (x0: number, n: number, rnd: () => number) =>
    Array.from({ length: n }, (): [number, number] => [x0 + rnd() * 40, rnd() * 40]);

  it("gives every grain one spot on the ink", () => {
    const rnd = seeded();
    const grains = blob(0, 200, rnd).map(([x, y]) => makeGrain(x, y, false, rnd));
    const ink = blob(0, 1000, rnd);
    const pairs = pairWithInk(grains, ink, rnd);
    expect(new Set(pairs.map((p) => p.g)).size).toBe(200);
    for (const p of pairs) {
      expect(p.x).toBeGreaterThanOrEqual(-1);
      expect(p.x).toBeLessThanOrEqual(41);
      expect(p.y).toBeGreaterThanOrEqual(-1);
      expect(p.y).toBeLessThanOrEqual(41);
    }
  });

  it("still pairs every grain when there is less ink than sand", () => {
    const rnd = seeded();
    const grains = blob(0, 50, rnd).map(([x, y]) => makeGrain(x, y, false, rnd));
    expect(pairWithInk(grains, blob(0, 7, rnd), rnd)).toHaveLength(50);
  });

  it("has no spots to give when there is no ink", () => {
    const rnd = seeded();
    expect(pairWithInk([makeGrain(1, 1, false, rnd)], [], rnd)).toEqual([]);
  });

  it("sends grains to nearby ink, so a letter's sand mostly stays with that letter", () => {
    const rnd = seeded();
    const left = blob(0, 100, rnd).map(([x, y]) => makeGrain(x, y, false, rnd));
    const right = blob(500, 100, rnd).map(([x, y]) => makeGrain(x, y, false, rnd));
    const pairs = pairWithInk(
      [...left, ...right],
      [...blob(0, 500, rnd), ...blob(500, 500, rnd)],
      rnd,
    );
    // Only the one strip that straddles the gap may cross it (√200, about 15 grains).
    const crossed = pairs.filter((p) => Math.abs(p.x - p.g.tx) > 60);
    expect(crossed.length).toBeLessThanOrEqual(15);
  });
});

describe("pairByLetter", () => {
  const blob = (x0: number, n: number, rnd: () => number) =>
    Array.from({ length: n }, (): [number, number] => [x0 + Math.floor(rnd() * 40), rnd() * 40]);

  it("keeps each letter's sand on that letter, however unevenly the sand is shared", () => {
    const rnd = seeded();
    const sand = [...blob(0, 150, rnd), ...blob(100, 50, rnd)];
    const grains = sand.map(([x, y]) => makeGrain(x, y, false, rnd));
    // The left letter holds most of the sand but little of the ink.
    const ink = [...blob(0, 100, rnd), ...blob(100, 900, rnd)];
    const pairs = pairByLetter(grains, ink, rnd);
    expect(pairs).toHaveLength(200);
    for (const p of pairs) expect(p.x < 70).toBe(p.g.tx < 70);
  });

  it("gives sand lying between two letters to the nearer one", () => {
    const rnd = seeded();
    const nearLeft = makeGrain(20, 5, false, rnd);
    const nearRight = makeGrain(40, 5, false, rnd);
    // Two solid bars: the only gap between columns of ink runs from 10 to 50.
    const ink: Array<[number, number]> = [];
    for (let x = 0; x <= 10; x++) ink.push([x, 5]);
    for (let x = 50; x <= 60; x++) ink.push([x, 5]);
    const pairs = pairByLetter([nearLeft, nearRight], ink, rnd);
    expect(pairs.find((p) => p.g === nearLeft)!.x).toBeLessThan(12);
    expect(pairs.find((p) => p.g === nearRight)!.x).toBeGreaterThan(48);
  });

  it("has no spots to give when there is no ink", () => {
    const rnd = seeded();
    expect(pairByLetter([makeGrain(1, 1, false, rnd)], [], rnd)).toEqual([]);
  });
});

describe("startGustTo", () => {
  it("drags a grain to the given spot without forgetting where its home is", () => {
    const rnd = seeded();
    const g = makeGrain(10, 20, false, rnd);
    startGustTo(g, 30, 40, 100, rnd);
    expect(gustAt(g, g.delay + GUST)).toMatchObject({ x: 30, y: 40, done: true });
    expect([g.hx, g.hy]).toEqual([10, 20]);
  });

  it("can then be sent home by an ordinary gust, ending exactly where it began", () => {
    const rnd = seeded();
    const g = makeGrain(10, 20, false, rnd);
    startGustTo(g, 30, 40, 100, rnd);
    g.tx = g.gx;
    g.ty = g.gy;
    expect(displaced(g)).toBe(true);
    startGust(g, 100, rnd);
    expect(gustAt(g, g.delay + GUST)).toMatchObject({ x: 10, y: 20, done: true });
  });
});
