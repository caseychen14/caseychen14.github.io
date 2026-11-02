<script lang="ts">
  import { onMount } from "svelte";
  import {
    GATHER,
    grainAt,
    letterAt,
    makeGrain,
    patternPoints,
    plough,
    settleTime,
    type DustPattern,
    type Grain,
    type Letter,
  } from "./dust";

  // The page's hero: words that form out of dust once, then stay. The dust waits in
  // clumps until the visitor's first input (move, tap, key, scroll). Dragging across it
  // draws in the dirt: grains are pushed aside into ridges and the marks stay. Drawn on
  // a canvas; the real heading sits beside it for screen readers and search.
  // With a saved `pattern` for the same text, the dust forms into that drawing instead
  // of plain letters.
  let {
    lines,
    spacing = 0.16,
    pattern,
  }: { lines: string[]; spacing?: number; pattern?: DustPattern } = $props();

  const COLORS = ["205,165,124", "192,144,104", "222,190,150", "176,132,92"];
  // Each frame erases 35% of what's on the canvas, so moving grains leave short trails.
  // Erasing (rather than painting the ground color) keeps the canvas transparent, so
  // the page background never shifts while the animation runs.
  const TRAIL_FADE = "rgba(0,0,0,0.35)";
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
      buckets = COLORS.map(() => []);
      const add = (grain: Grain) => buckets[(Math.random() * COLORS.length) | 0]!.push(grain);
      const saved = pattern?.text === lines.join(" ") ? pattern : undefined;
      if (saved) {
        // Scale the drawing from the width it was saved at to this one, keeping the same
        // density: a larger canvas gets proportionally more grains per saved cell.
        const k = size / (MAX_SIZE * Math.min(1, saved.width / widest));
        const perCell = k * k;
        for (const [px, py] of patternPoints(saved)) {
          let n = Math.floor(perCell) + (Math.random() < perCell % 1 ? 1 : 0);
          while (n-- > 0) {
            const tx = (px + (Math.random() - 0.5) * saved.cell) * k;
            const ty = (py + (Math.random() - 0.5) * saved.cell) * k;
            add(makeGrain(tx, ty, letterAt(letters, tx, lineOf(ty)), size, false));
          }
        }
      } else {
        const jitter = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
        const data = c.getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y += 2) {
          for (let x = 0; x < W; x += 2) {
            if (data[(y * W + x) * 4 + 3]! < 128 || Math.random() > 0.6) continue;
            const stray = Math.random() < 0.05;
            const tx = x + jitter() * (stray ? 7 : 0.8);
            const ty = y + jitter() * (stray ? 7 : 0.8);
            add(makeGrain(tx, ty, letterAt(letters, x, lineOf(y)), size, stray));
          }
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
      raf = 0;
      const s = elapsed();
      const done = s >= tEnd;
      ctx.globalAlpha = 1;
      if (done || waiting) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = TRAIL_FADE;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
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

    // Drawing in the dirt. Slow strokes cut deep and wide, quick ones leave a scratch.
    let last: [number, number] | null = null;
    function onPointerDown(e: PointerEvent) {
      if (!buckets.length) return; // not drawn yet (fonts still loading)
      cv.setPointerCapture(e.pointerId);
      last = [e.offsetX, e.offsetY];
    }
    function onPointerMove(e: PointerEvent) {
      if (!last) return;
      const p: [number, number] = [e.offsetX, e.offsetY];
      const speed = Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (speed < 1.5) return;
      const w = Math.max(3.5, Math.min(9, 10 - speed * 0.35));
      let moved = 0;
      for (const grains of buckets) moved += plough(grains, last, p, w);
      last = p;
      // While the arrival is still running its next frame picks this up.
      if (moved && !raf) frame();
    }
    function onPointerUp() {
      last = null;
    }
    cv.addEventListener("pointerdown", onPointerDown);
    cv.addEventListener("pointermove", onPointerMove);
    cv.addEventListener("pointerup", onPointerUp);
    cv.addEventListener("pointercancel", onPointerUp);

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
      cv.removeEventListener("pointerdown", onPointerDown);
      cv.removeEventListener("pointermove", onPointerMove);
      cv.removeEventListener("pointerup", onPointerUp);
      cv.removeEventListener("pointercancel", onPointerUp);
    };
  });
</script>

<h1 class="sr-only">{lines.join(" ")}</h1>
<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    cursor: crosshair;
    /* Sideways drags draw; vertical swipes still scroll the page on touch screens. */
    touch-action: pan-y;
  }
</style>
