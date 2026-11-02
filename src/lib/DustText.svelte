<script lang="ts">
  import { onMount } from "svelte";
  import fannerOpen from "./assets/fanner-open.png";
  import fannerRaised from "./assets/fanner-raised.png";
  import { scatterTiming } from "./glow";
  import {
    GUST,
    displaced,
    gustAt,
    makeGrain,
    patternPoints,
    plough,
    puffFrom,
    startGust,
    startWind,
    windStep,
    type DustPattern,
    type Grain,
  } from "./dust";

  // The page's hero: words made of loose dust on the ground. Dragging across it draws in
  // the dirt: grains are pushed aside into ridges and the marks stay. The little figure
  // at the bottom right, leaning 30° to the left, fans its book when clicked, sending a
  // puff of wind the way the book points. "Restore" then drags every grain home. With a
  // saved `pattern` for the same text, the dust lies in that drawing instead of plain
  // letters. Drawn on a canvas; the real heading sits beside it for screen readers.
  let {
    lines,
    spacing = 0.16,
    pattern,
  }: { lines: string[]; spacing?: number; pattern?: DustPattern } = $props();

  const COLORS = ["205,165,124", "192,144,104", "222,190,150", "176,132,92"];
  const MAX_SIZE = 132;
  // The canvas reaches this far (px) past the words on every side and fades out there, so
  // blown sand drifts off softly instead of being cut off at a hard edge. Matches the CSS.
  const BLEED = 48;
  // The wind physics runs in steps of this many seconds, at most MAX_STEPS per frame
  // (two seconds' worth, so a long stall can't freeze the page catching up).
  const STEP = 1 / 120;
  const MAX_STEPS = 240;

  let canvas: HTMLCanvasElement | undefined = $state();
  let fanner: HTMLButtonElement | undefined = $state();
  // Whether the sand has been moved since load (or since the last gust); shows the button.
  let drawn = $state(false);
  let blowBack: (() => void) | undefined = $state();
  let puff: (() => void) | undefined = $state();
  // The figure's book: false = raised, true = fanned open.
  let bookOpen = $state(false);

  // Fan the book open for half a second and back; the wind leaves as it opens. Clicking
  // again while it is open snaps it shut and opens it again: a second fan and a second
  // puff on top of the first.
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let reopenTimer: ReturnType<typeof setTimeout> | undefined;
  function open() {
    bookOpen = true;
    puff?.();
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => (bookOpen = false), 500);
  }
  function fan() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      puff?.();
      return;
    }
    clearTimeout(reopenTimer);
    if (bookOpen) {
      clearTimeout(closeTimer);
      bookOpen = false;
      reopenTimer = setTimeout(open, 120);
    } else {
      open();
    }
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
    // A gust dragging grains home: when it began, which grains, when the last arrives.
    let gust: { t0: number; grains: Set<Grain>; end: number } | null = null;
    // A puff of wind: when it began, how far (s) the physics has been run, and grains
    // still sliding.
    let wind: { t0: number; sim: number; grains: Grain[] } | null = null;

    function build() {
      const W = cv.clientWidth - 2 * BLEED;
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

      // Grain coordinates stay relative to the words; the transform shifts them past the
      // bleed.
      const dpr = window.devicePixelRatio || 1;
      cv.width = (W + 2 * BLEED) * dpr;
      cv.height = (H + 2 * BLEED) * dpr;
      cv.style.height = `${H + 2 * BLEED}px`;
      ctx = cv.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, BLEED * dpr, BLEED * dpr);
      width = W;
      height = H;
    }

    function draw() {
      raf = 0;
      const now = performance.now();
      if (wind) {
        // Run the physics in small fixed steps until it catches up with real time, so the
        // sand ends up in the same place however fast or slowly the screen redraws.
        const target = (now - wind.t0) / 1000;
        for (let n = 0; wind.sim < target && wind.grains.length && n < MAX_STEPS; n++) {
          const t = wind.sim;
          wind.grains = wind.grains.filter((g) => windStep(g, t, STEP));
          wind.sim += STEP;
        }
        if (!wind.grains.length) wind = null;
      }
      const t = gust ? (now - gust.t0) / 1000 : 0;
      ctx.clearRect(-BLEED, -BLEED, width + 2 * BLEED, height + 2 * BLEED);
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
          g.tx = g.gx;
          g.ty = g.gy;
        }
        gust = null;
      }
      if (gust || wind) raf = requestAnimationFrame(draw);
    }

    // A gust sweeps left to right, dragging every displaced grain back to where it lay
    // on load. With reduced motion the grains simply go home.
    blowBack = () => {
      if (gust || wind || !buckets.length) return;
      const moving = buckets.flat().filter(displaced);
      drawn = false;
      if (!moving.length) return;
      cancelAnimationFrame(raf);
      for (const g of moving) startGust(g, width);
      if (reduce.matches) {
        for (const g of moving) {
          g.tx = g.gx;
          g.ty = g.gy;
        }
      } else {
        const end = Math.max(...moving.map((g) => g.delay)) + GUST;
        gust = { t0: performance.now(), grains: new Set(moving), end };
      }
      draw();
    };

    // A puff of wind from the figure's book, blowing the way it points. With reduced
    // motion the physics runs to the end at once and the sand appears where it lands.
    // A puff during another one starts a fresh gust over everything it reaches, while
    // grains still moving from the first keep their momentum.
    puff = () => {
      if (gust || !buckets.length) return;
      const p = puffFrom(width, height);
      const caught = buckets.flat().filter((g) => startWind(g, p.ox, p.oy, p.dx, p.dy, p.reach));
      if (!caught.length) return;
      drawn = true;
      cancelAnimationFrame(raf);
      if (reduce.matches) {
        let sliding = caught;
        for (let t = 0; sliding.length && t < 5; t += STEP) {
          sliding = sliding.filter((g) => windStep(g, t, STEP));
        }
      } else {
        const grains = wind ? [...new Set([...wind.grains, ...caught])] : caught;
        wind = { t0: performance.now(), sim: 0, grains };
      }
      draw();
    };

    // Drawing in the dirt. Slow strokes cut deep and wide, quick ones leave a scratch.
    let last: [number, number] | null = null;
    function onPointerDown(e: PointerEvent) {
      if (!buckets.length) return; // not drawn yet (fonts still loading)
      cv.setPointerCapture(e.pointerId);
      last = [e.offsetX - BLEED, e.offsetY - BLEED];
    }
    function onPointerMove(e: PointerEvent) {
      if (!last || gust || wind) return;
      const p: [number, number] = [e.offsetX - BLEED, e.offsetY - BLEED];
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
      if (cv.clientWidth - 2 * BLEED === width) return;
      cancelAnimationFrame(raf);
      gust = null;
      wind = null;
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
    Restore
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
  /* Above the canvas, whose faded bleed reaches under it. */
  .foot {
    position: relative;
    z-index: 1;
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
    /* Leaning 30° counter-clockwise, pivoting on the bench (see LEAN in dust.ts). */
    transform: rotate(-30deg);
    transform-origin: 62% 100%;
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
  /* The canvas reaches 48px (BLEED) past the words on every side without taking up any
     room, and fades to nothing across that margin, so sand blown off the words drifts
     away softly rather than stopping at a visible edge. Sideways the fade finishes within
     24px, inside the page's side padding, where the main column clips. */
  canvas {
    display: block;
    width: calc(100% + 96px);
    margin: -48px;
    -webkit-mask-image:
      linear-gradient(
        to right,
        transparent 24px,
        #000 48px,
        #000 calc(100% - 48px),
        transparent calc(100% - 24px)
      ),
      linear-gradient(to bottom, transparent, #000 48px, #000 calc(100% - 48px), transparent);
    -webkit-mask-composite: source-in;
    mask-image:
      linear-gradient(
        to right,
        transparent 24px,
        #000 48px,
        #000 calc(100% - 48px),
        transparent calc(100% - 24px)
      ),
      linear-gradient(to bottom, transparent, #000 48px, #000 calc(100% - 48px), transparent);
    mask-composite: intersect;
    cursor: crosshair;
    /* Sideways drags draw; vertical swipes still scroll the page on touch screens. */
    touch-action: pan-y;
  }
  .blow {
    position: absolute;
    z-index: 1;
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
