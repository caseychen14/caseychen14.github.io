<script lang="ts">
  import { onMount } from "svelte";
  import fannerOpen from "./assets/fanner-open.png";
  import fannerRaised from "./assets/fanner-raised.png";
  import { scatterTiming } from "./glow";
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
    type DustPattern,
    type Grain,
  } from "./dust";

  // The page's hero: words made of loose dust on the ground. Dragging across it draws in
  // the dirt: grains are pushed aside into ridges and the marks stay. The little figure
  // at the bottom right fans its book when clicked, sending a puff of wind from that
  // corner that scatters nearby sand. "Blow it back" then drags every grain home. With a
  // saved `pattern` for the same text, the dust lies in that drawing instead of plain
  // letters. Drawn on a canvas; the real heading sits beside it for screen readers.
  let {
    lines,
    spacing = 0.16,
    pattern,
  }: { lines: string[]; spacing?: number; pattern?: DustPattern } = $props();

  const COLORS = ["205,165,124", "192,144,104", "222,190,150", "176,132,92"];
  const MAX_SIZE = 132;

  let canvas: HTMLCanvasElement | undefined = $state();
  let fanner: HTMLButtonElement | undefined = $state();
  // Whether the sand has been moved since load (or since the last gust); shows the button.
  let drawn = $state(false);
  let blowBack: (() => void) | undefined = $state();
  let puff: (() => void) | undefined = $state();
  // The figure's book: false = raised, true = fanned open.
  let bookOpen = $state(false);
  let fanning = false;

  // Flap the book open and shut twice; the wind leaves on the first flap.
  function fan() {
    if (fanning) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      puff?.();
      return;
    }
    fanning = true;
    const flaps = [true, false, true, false];
    flaps.forEach((open, i) =>
      setTimeout(() => {
        bookOpen = open;
        if (i === 0) puff?.();
        if (i === flaps.length - 1) fanning = false;
      }, i * 140),
    );
  }

  onMount(() => {
    const cv = canvas!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    // One random glow pace for the figure, inherited by both of its frames.
    const timing = scatterTiming(9);
    fanner!.style.animationDuration = `${timing.duration}s`;
    fanner!.style.animationDelay = `${timing.delay}s`;
    let ctx: CanvasRenderingContext2D;
    let buckets: Grain[][] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    // Grains in motion (a gust home or a puff of wind): when it began, which grains, when
    // the last one rests, and where a grain is `t` seconds in.
    let motion: {
      t0: number;
      grains: Set<Grain>;
      end: number;
      at: (g: Grain, t: number) => { x: number; y: number };
    } | null = null;

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
      const t = motion ? (performance.now() - motion.t0) / 1000 : 0;
      ctx.clearRect(0, 0, width, height);
      buckets.forEach((grains, i) => {
        ctx.fillStyle = `rgb(${COLORS[i]})`;
        for (const g of grains) {
          let x = g.tx;
          let y = g.ty;
          if (motion?.grains.has(g)) ({ x, y } = motion.at(g, t));
          ctx.globalAlpha = g.a;
          ctx.fillRect(x, y, g.sz, g.sz);
        }
      });
      ctx.globalAlpha = 1;
      if (motion && t >= motion.end) {
        for (const g of motion.grains) {
          g.tx = g.gx;
          g.ty = g.gy;
        }
        motion = null;
      } else if (motion) {
        raf = requestAnimationFrame(draw);
      }
    }

    // Set grains (already given a goal) moving along `at` for `duration` each, or with
    // reduced motion, put them straight at their goals.
    function move(
      grains: Grain[],
      at: (g: Grain, t: number) => { x: number; y: number },
      duration: number,
    ) {
      cancelAnimationFrame(raf);
      if (reduce.matches) {
        for (const g of grains) {
          g.tx = g.gx;
          g.ty = g.gy;
        }
      } else {
        const end = Math.max(...grains.map((g) => g.delay)) + duration;
        motion = { t0: performance.now(), grains: new Set(grains), end, at };
      }
      draw();
    }

    // A gust sweeps left to right, dragging every displaced grain back to where it lay
    // on load.
    blowBack = () => {
      if (motion || !buckets.length) return;
      const moving = buckets.flat().filter(displaced);
      drawn = false;
      if (!moving.length) return;
      for (const g of moving) startGust(g, width);
      move(moving, gustAt, GUST);
    };

    // A light puff of wind from the bottom-right corner, where the figure sits.
    puff = () => {
      if (motion || !buckets.length) return;
      const reach = Math.hypot(width, height) * 0.6;
      const caught = buckets.flat().filter((g) => startWind(g, width, height, reach));
      if (!caught.length) return;
      drawn = true;
      move(caught, windAt, WIND);
    };

    // Drawing in the dirt. Slow strokes cut deep and wide, quick ones leave a scratch.
    let last: [number, number] | null = null;
    function onPointerDown(e: PointerEvent) {
      if (!buckets.length) return; // not drawn yet (fonts still loading)
      cv.setPointerCapture(e.pointerId);
      last = [e.offsetX, e.offsetY];
    }
    function onPointerMove(e: PointerEvent) {
      if (!last || motion) return;
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
      motion = null;
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
  <div class="foot">
    <button
      bind:this={fanner}
      type="button"
      class="fanner"
      aria-label="Fan the book to send a puff of wind across the sand"
      onclick={fan}
      style:--raised={`url("${fannerRaised}")`}
      style:--open={`url("${fannerOpen}")`}
    >
      <!-- Both frames stay loaded; flapping just swaps which one shows. They share the
           button's glow timing (data-glow-scattered keeps scatterGlow off them), so the
           shimmer doesn't jump when the frame changes. -->
      <span class="glow-ink frame raised" class:hidden={bookOpen} data-glow-scattered></span>
      <span class="glow-ink frame open" class:hidden={!bookOpen} data-glow-scattered></span>
    </button>
  </div>
</div>

<style>
  .dust {
    position: relative;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  /* The two drawings are scaled so their benches match, then lined up on the bench. */
  .fanner {
    position: relative;
    width: 68px;
    height: 88px;
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
    filter: drop-shadow(0 0 8px rgb(143 178 222 / 0.45));
  }
  .frame {
    position: absolute;
    inset: 0;
    animation-duration: inherit;
    animation-delay: inherit;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }
  .raised {
    -webkit-mask-image: var(--raised);
    mask-image: var(--raised);
    -webkit-mask-size: 54.5px 61.4px;
    mask-size: 54.5px 61.4px;
    -webkit-mask-position: 11.6px 100%;
    mask-position: 11.6px 100%;
  }
  .open {
    -webkit-mask-image: var(--open);
    mask-image: var(--open);
    -webkit-mask-size: 61px 88px;
    mask-size: 61px 88px;
    -webkit-mask-position: 1px 100%;
    mask-position: 1px 100%;
  }
  .hidden {
    visibility: hidden;
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
