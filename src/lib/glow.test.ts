import { describe, expect, it } from "vitest";
import { scatterTiming } from "./glow";

describe("scatterTiming", () => {
  it("keeps the cycle within 20% of the base", () => {
    expect(scatterTiming(10, () => 0).duration).toBeCloseTo(8);
    expect(scatterTiming(10, () => 0.999999).duration).toBeCloseTo(12);
  });

  it("starts somewhere inside the cycle, never in the future", () => {
    for (const r of [0, 0.25, 0.5, 0.999]) {
      const { duration, delay } = scatterTiming(9, () => r);
      expect(delay).toBeLessThanOrEqual(0);
      expect(delay).toBeGreaterThan(-duration);
    }
  });

  it("gives different elements different timings", () => {
    const a = scatterTiming(9);
    const b = scatterTiming(9);
    expect([a.duration, a.delay]).not.toEqual([b.duration, b.delay]);
  });
});
