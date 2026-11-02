/** How far each glow's cycle length may stray from its base, as a fraction. */
const SPREAD = 0.2;

/** A random cycle length near `base` seconds, and a start offset somewhere inside it. */
export function scatterTiming(base: number, rnd: () => number = Math.random) {
  const duration = base * (1 - SPREAD + rnd() * 2 * SPREAD);
  return { duration, delay: -rnd() * duration };
}

/**
 * Give every glow sweep under `root` its own pace and starting point, so the lights
 * drift independently instead of pulsing in step. Safe to call again after navigation:
 * elements already scattered are left alone.
 */
export function scatterGlow(root: ParentNode, rnd: () => number = Math.random) {
  for (const el of root.querySelectorAll<HTMLElement>(".g2, .g3, .reader")) {
    if (el.dataset.glowScattered !== undefined) continue;
    // 0 when reduced motion has switched the animation off.
    const base = parseFloat(getComputedStyle(el).animationDuration);
    if (!base) continue;
    const { duration, delay } = scatterTiming(base, rnd);
    el.style.animationDuration = `${duration}s`;
    el.style.animationDelay = `${delay}s`;
    el.dataset.glowScattered = "";
  }
}
