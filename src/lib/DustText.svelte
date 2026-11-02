<script lang="ts">
  import { onMount } from "svelte";
  import {
    GUST,
    displaced,
    gustAt,
    makeGrain,
    patternPoints,
    plough,
    startGust,
    type DustPattern,
    type Grain,
  } from "./dust";

  // The page's hero: words made of loose dust on the ground. Dragging across it draws in
  // the dirt: grains are pushed aside into ridges and the marks stay, until "Blow it back"
  // sends a gust that carries every grain home. With a saved `pattern` for the same text,
  // the dust lies in that drawing instead of plain letters. Drawn on a canvas; the real
  // heading sits beside it for screen readers and search.
  let {
    lines,
    spacing = 0.16,
    pattern,
  }: { lines: string[]; spacing?: number; pattern?: DustPattern } = $props();

  const COLORS = ["205,165,124", "192,144,104", "222,190,150", "176,132,92"];
  const MAX_SIZE = 132;

  let canvas: HTMLCanvasElement | undefined = $state();
  // Whether anything has been drawn since load (or since the last gust); shows the button.
  let drawn = $state(false);
  let blowBack: (() => void) | undefined = $state();

  onMount(() => {
    const cv = canvas!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let ctx: CanvasRenderingContext2D;
    let buckets: Grain[][] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    // The gust in progress: when it began, which grains it carries, when the last lands.
    let gust: { t0: number; grains: Set<Grain>; end: number } | null = null;

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
            add(makeGrain(tx, ty, false));
          }
        }
      } else {
        // Set the text off-screen and scatter a grain on most of its inked pixels.
        off.width = W;
        off.height = H;
        c.font = font(size);
        c.fillStyle = "#fff";
        lines.forEach((line, i) => {
          let x = 0;
          const y = size * 0.95 + i * size * 1.15;
          for (const ch of line) {
            c.fillText(ch, x, y);
            x += c.measureText(ch).width + size * spacing;
          }
        });
        const jitter = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
        const data = c.getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y += 2) {
          for (let x = 0; x < W; x += 2) {
            if (data[(y * W + x) * 4 + 3]! < 128 || Math.random() > 0.6) continue;
            const stray = Math.random() < 0.05;
            add(
              makeGrain(x + jitter() * (stray ? 7 : 0.8), y + jitter() * (stray ? 7 : 0.8), stray),
            );
          }
        }
      }

      const dpr = window.devicePixelRatio || 1;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.height = `${H}px`;
      ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      width = W;
      height = H;
    }

    function draw() {
      raf = 0;
      const t = gust ? (performance.now() - gust.t0) / 1000 : 0;
      ctx.clearRect(0, 0, width, height);
      buckets.forEach((grains, i) => {
        ctx.fillStyle = `rgb(${COLORS[i]})`;
        for (const g of grains) {
          let x = g.tx;
          let y = g.ty;
          if (gust?.grains.has(g)) ({ x, y } = gustAt(g, t));
          ctx.globalAlpha = g.a;
          ctx.fillRect(x, y, g.sz, g.sz);
        }
      });
      ctx.globalAlpha = 1;
      if (gust && t >= gust.end) {
        for (const g of gust.grains) {
          g.tx = g.hx;
          g.ty = g.hy;
        }
        gust = null;
      } else if (gust) {
        raf = requestAnimationFrame(draw);
      }
    }

    // A gust sweeps left to right, lifting every displaced grain back to where it lay on
    // load. With reduced motion the grains simply go home.
    blowBack = () => {
      if (gust || !buckets.length) return;
      const moving = buckets.flat().filter(displaced);
      drawn = false;
      if (!moving.length) return;
      cancelAnimationFrame(raf);
      if (reduce.matches) {
        for (const g of moving) {
          g.tx = g.hx;
          g.ty = g.hy;
        }
      } else {
        for (const g of moving) startGust(g, width);
        const end = Math.max(...moving.map((g) => g.delay)) + GUST;
        gust = { t0: performance.now(), grains: new Set(moving), end };
      }
      draw();
    };

    // Drawing in the dirt. Slow strokes cut deep and wide, quick ones leave a scratch.
    let last: [number, number] | null = null;
    function onPointerDown(e: PointerEvent) {
      if (!buckets.length) return; // not drawn yet (fonts still loading)
      cv.setPointerCapture(e.pointerId);
      last = [e.offsetX, e.offsetY];
    }
    function onPointerMove(e: PointerEvent) {
      if (!last || gust) return;
      const p: [number, number] = [e.offsetX, e.offsetY];
      const speed = Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (speed < 1.5) return;
      const w = Math.max(3.5, Math.min(9, 10 - speed * 0.35));
      let moved = 0;
      for (const grains of buckets) moved += plough(grains, last, p, w);
      last = p;
      if (!moved) return;
      drawn = true;
      if (!raf) raf = requestAnimationFrame(draw);
    }
    function onPointerUp() {
      last = null;
    }
    cv.addEventListener("pointerdown", onPointerDown);
    cv.addEventListener("pointermove", onPointerMove);
    cv.addEventListener("pointerup", onPointerUp);
    cv.addEventListener("pointercancel", onPointerUp);

    // Rebuild at the new width (this clears any drawing made since the page loaded).
    const resize = new ResizeObserver(() => {
      if (cv.clientWidth === width) return;
      cancelAnimationFrame(raf);
      gust = null;
      drawn = false;
      build();
      draw();
    });

    let cancelled = false;
    document.fonts.load(`600 ${MAX_SIZE}px "Red Hat Display"`).finally(() => {
      if (cancelled) return;
      build();
      draw();
      resize.observe(cv);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      cv.removeEventListener("pointerdown", onPointerDown);
      cv.removeEventListener("pointermove", onPointerMove);
      cv.removeEventListener("pointerup", onPointerUp);
      cv.removeEventListener("pointercancel", onPointerUp);
    };
  });
</script>

<h1 class="sr-only">{lines.join(" ")}</h1>
<div class="dust">
  <!-- Floats above the top-right of the words so showing it never shifts the page. -->
  <button type="button" class={["link g3 blow", drawn && "shown"]} onclick={() => blowBack?.()}>
    Blow it back
  </button>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</div>

<style>
  .dust {
    position: relative;
  }
  canvas {
    display: block;
    width: 100%;
    cursor: crosshair;
    /* Sideways drags draw; vertical swipes still scroll the page on touch screens. */
    touch-action: pan-y;
  }
  .blow {
    position: absolute;
    right: 0;
    bottom: 100%;
    margin-bottom: 8px;
    border: 0;
    padding: 0;
    background-color: transparent;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.4s,
      visibility 0.4s;
  }
  .blow.shown {
    opacity: 1;
    visibility: visible;
  }
  @media (prefers-reduced-motion: reduce) {
    .blow {
      transition: none;
    }
  }
</style>
