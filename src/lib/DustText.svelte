<script lang="ts">
  import { onMount } from "svelte";
  import {
    GATHER,
    grainAt,
    letterAt,
    makeGrain,
    settleTime,
    type Grain,
    type Letter,
  } from "./dust";

  // The page's hero: words that form out of dust once, then stay. The dust waits in
  // clumps until the visitor's first input (move, tap, key, scroll). Drawn on a canvas;
  // the real heading sits beside it for screen readers and search.
  let { lines, spacing = 0.16 }: { lines: string[]; spacing?: number } = $props();

  const COLORS = ["205,165,124", "192,144,104", "222,190,150", "176,132,92"];
  const TRAIL = "rgba(27,38,30,0.35)";
  const MAX_SIZE = 132;

  let canvas: HTMLCanvasElement | undefined = $state();

  onMount(() => {
    const cv = canvas!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let ctx: CanvasRenderingContext2D;
    let buckets: Grain[][] = [];
    let width = 0;
    let height = 0;
    let tEnd = 0;
    let t0 = 0;
    let animate = true;
    let waiting = true;
    let raf = 0;

    function build() {
      const W = cv.clientWidth;
      const off = document.createElement("canvas");
      const c = off.getContext("2d")!;
      const font = (s: number) => `600 ${s}px "Red Hat Display", sans-serif`;
      const lineWidth = (line: string, s: number) => {
        c.font = font(s);
        let w = 0;
        for (const ch of line) w += c.measureText(ch).width + s * spacing;
        return w - s * spacing;
      };
      const widest = Math.max(...lines.map((l) => lineWidth(l, MAX_SIZE)));
      const size = MAX_SIZE * Math.min(1, W / widest);
      const H = Math.ceil(size * (1.3 + 1.15 * (lines.length - 1)));

      off.width = W;
      off.height = H;
      c.font = font(size);
      c.fillStyle = "#fff";
      const letters: Letter[] = [];
      lines.forEach((line, i) => {
        let x = 0;
        const y = size * 0.95 + i * size * 1.15;
        for (const ch of line) {
          const w = c.measureText(ch).width;
          c.fillText(ch, x, y);
          letters.push({
            line: i,
            x1: x + w + (size * spacing) / 2,
            cx: x + w / 2,
            cy: y - size * 0.35,
            w,
            idx: letters.length,
          });
          x += w + size * spacing;
        }
      });

      const lineOf = (py: number) =>
        Math.min(lines.length - 1, Math.max(0, Math.floor((py - size * 1.2) / (size * 1.15)) + 1));
      const jitter = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
      const data = c.getImageData(0, 0, W, H).data;
      buckets = COLORS.map(() => []);
      for (let y = 0; y < H; y += 2) {
        for (let x = 0; x < W; x += 2) {
          if (data[(y * W + x) * 4 + 3]! < 128 || Math.random() > 0.6) continue;
          const stray = Math.random() < 0.05;
          const tx = x + jitter() * (stray ? 7 : 0.8);
          const ty = y + jitter() * (stray ? 7 : 0.8);
          const grain = makeGrain(tx, ty, letterAt(letters, x, lineOf(y)), size, stray);
          buckets[(Math.random() * COLORS.length) | 0]!.push(grain);
        }
      }
      tEnd = settleTime(buckets.flat());

      const dpr = window.devicePixelRatio || 1;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.height = `${H}px`;
      ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      width = W;
      height = H;
    }

    // Seconds into the animation. Until the first input the clumps sit fully gathered.
    function elapsed() {
      if (!animate || reduce.matches) return Infinity;
      if (waiting) return GATHER;
      return GATHER + (performance.now() - t0) / 1000;
    }

    function frame() {
      const s = elapsed();
      const done = s >= tEnd;
      ctx.globalAlpha = 1;
      if (done || waiting) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.fillStyle = TRAIL;
        ctx.fillRect(0, 0, width, height);
      }
      buckets.forEach((grains, i) => {
        ctx.fillStyle = `rgb(${COLORS[i]})`;
        for (const g of grains) {
          const p = grainAt(g, s);
          ctx.globalAlpha = p.a;
          ctx.fillRect(p.x, p.y, g.sz, g.sz);
        }
      });
      if (!done && !waiting) raf = requestAnimationFrame(frame);
    }

    function draw() {
      cancelAnimationFrame(raf);
      build();
      frame();
    }

    const WAKE_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];
    function stopListening() {
      WAKE_EVENTS.forEach((e) => window.removeEventListener(e, wake));
    }
    function wake() {
      stopListening();
      if (!waiting) return;
      waiting = false;
      t0 = performance.now();
      cancelAnimationFrame(raf);
      frame();
    }

    // A resize after the run has started redraws the settled words rather than
    // replaying; before that, it re-gathers the clumps and keeps waiting.
    const resize = new ResizeObserver(() => {
      if (cv.clientWidth === width) return;
      if (!waiting) animate = false;
      draw();
    });

    let cancelled = false;
    document.fonts.load(`600 ${MAX_SIZE}px "Red Hat Display"`).finally(() => {
      if (cancelled) return;
      draw();
      resize.observe(cv);
      WAKE_EVENTS.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      stopListening();
    };
  });
</script>

<h1 class="sr-only">{lines.join(" ")}</h1>
<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
  }
</style>
