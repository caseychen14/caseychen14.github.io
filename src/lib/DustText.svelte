<script lang="ts" module>
  // The opening plays once per page load; coming back to the home page finds the sand as
  // it was left: in the plain typeface, or in the drawing if Restore has brought that back.
  let revealed = false;
  let restored = false;
</script>

<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import fannerOpen from "./assets/fanner-open.png";
  import fannerRaised from "./assets/fanner-raised.png";
  import { scatterTiming } from "./glow";
  import {
    GUST,
    displaced,
    gustAt,
    makeGrain,
    pairByLetter,
    patternPoints,
    plough,
    puffFrom,
    startGust,
    startGustTo,
    startWind,
    windStep,
    type DustPattern,
    type Grain,
    type InkSpot,
  } from "./dust";

  // The page's hero: words made of loose dust on the ground. Dragging across it draws in
  // the dirt: grains are pushed aside into ridges and the marks stay. The little figure
  // at the bottom right, leaning 30° to the left, fans its book when clicked, sending a
  // puff of wind the way the book points. "Restore" then drags every grain home. With a
  // saved `pattern` for the same text, the dust lies in that drawing instead of plain
  // letters, and the visitor's first action (a cursor move, tap, key or scroll) drags the
  // first line into the plain typeface, where it stays; "Restore" brings back the drawing.
  // Drawn on a canvas; the real heading sits beside it for screen readers.
  // Anything passed in (the byline) sits under the words, on the figure's row.
  let {
    lines,
    spacing = 0.16,
    pattern,
    children,
  }: { lines: string[]; spacing?: number; pattern?: DustPattern; children?: Snippet } = $props();

  const COLORS = ["205,165,124", "192,144,104", "222,190,150", "176,132,92"];
  const MAX_SIZE = 132;
  // The canvas reaches this far (px) past the words on every side and fades out there, so
  // blown sand drifts off softly instead of being cut off at a hard edge. Matches the CSS.
  const BLEED = 48;
  // The figure's button box (matches .fanner) and how far its leaning drawing reaches
  // left of that box (rotating 30° about the bench swings the book's corner out).
  const FIGURE_WIDTH = 68;
  const FIGURE_REACH = 38;
  // Space between the bottom of the words and the figure's row (matches .foot's margin).
  const FOOT_GAP = 8;
  // The wind physics runs in steps of this many seconds, at most MAX_STEPS per frame
  // (two seconds' worth, so a long stall can't freeze the page catching up).
  const STEP = 1 / 120;
  const MAX_STEPS = 240;
  // Where the first line's sand ends in the drawing, as a share of the text size.
  const LINE_GAP = 1.33;
  // What counts as the visitor's first action.
  const FIRST_ACTIONS = ["pointermove", "pointerdown", "keydown", "wheel"] as const;

  let canvas: HTMLCanvasElement | undefined = $state();
  let fanner: HTMLButtonElement | undefined = $state();
  // Whether the sand has been moved since load (or since the last gust); shows the button.
  let drawn = $state(false);
  // Placement worked out from where the words actually end (on wide screens they reach
  // their largest size and stop growing): space to the right of the figure, so its left
  // edge meets the end of the "g", and Restore's distance from the right, so it sits
  // above the end of the first line.
  let figurePad = $state(0);
  let restoreInset = $state(0);
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
    let gust: { t0: number; grains: Set<Grain>; end: number; then?: () => void } | null = null;
    // A puff of wind: when it began, how far (s) the physics has been run, and grains
    // still sliding.
    let wind: { t0: number; sim: number; grains: Grain[] } | null = null;
    // The first line's sand and its spots on the plain letters; empty without a drawing.
    let plain: InkSpot[] = [];
    let revealing = false;

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
      // Set text off-screen, returning its pixels.
      const setText = (text: string[]) => {
        // Nothing to set while the page has no room for the words (hidden, say); the
        // resize observer rebuilds once it does.
        if (W <= 0 || H <= 0) return new Uint8ClampedArray();
        off.width = W;
        off.height = H;
        c.font = font(size);
        c.fillStyle = "#fff";
        text.forEach((line, i) => {
          let x = 0;
          const y = size * 0.95 + i * size * 1.15;
          for (const ch of line) {
            c.fillText(ch, x, y);
            x += c.measureText(ch).width + size * spacing;
          }
        });
        return c.getImageData(0, 0, W, H).data;
      };
      plain = [];
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
        const ink: Array<[number, number]> = [];
        const pixels = setText(lines.slice(0, 1));
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (pixels[(y * W + x) * 4 + 3]! >= 128) ink.push([x, y]);
          }
        }
        const firstLine = buckets.flat().filter((g) => g.hy < size * LINE_GAP);
        plain = pairByLetter(firstLine, ink);
      } else {
        // Scatter a grain on most of the text's inked pixels.
        const jitter = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
        const data = setText(lines);
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
      const scale = size / MAX_SIZE;
      const textRight = Math.min(W, widest * scale);
      // Leaning, the figure reaches FIGURE_REACH px left of its box; on narrow screens,
      // where the words fill the width, it stays inside the column, tucked under the "g".
      // The font's width includes a little space after the last letter (about 0.12 of the
      // text size); take it off so the figure meets the "g" itself.
      const inkRight = textRight - size * 0.12;
      figurePad = Math.max(0, W - (inkRight + FIGURE_REACH + FIGURE_WIDTH));
      restoreInset = W - Math.min(W, lineWidth(lines[0]!, MAX_SIZE) * scale);
      if (revealed && !restored) layPlain();
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
        const then = gust.then;
        gust = null;
        then?.();
      }
      if (gust || wind) raf = requestAnimationFrame(draw);
    }

    // Start a gust over grains already given somewhere to go.
    function runGust(grains: Grain[], then?: () => void) {
      const end = Math.max(...grains.map((g) => g.delay)) + GUST;
      gust = { t0: performance.now(), grains: new Set(grains), end, then };
      cancelAnimationFrame(raf);
      draw();
    }

    // Lay the first line straight onto the plain letters, with Restore there to undo it.
    function layPlain() {
      for (const p of plain) {
        p.g.tx = p.x;
        p.g.ty = p.y;
      }
      if (plain.length) drawn = true;
    }

    // The visitor's first action: a gust drags the first line into the plain typeface. With
    // reduced motion it is simply there.
    function reveal() {
      if (width <= 0) return; // not drawn yet (fonts loading, or no room for the words)
      revealed = true;
      for (const e of FIRST_ACTIONS) window.removeEventListener(e, reveal, true);
      if (!plain.length) return;
      if (reduce.matches) {
        layPlain();
        draw();
        return;
      }
      revealing = true;
      for (const p of plain) startGustTo(p.g, p.x, p.y, width);
      runGust(
        plain.map((p) => p.g),
        () => {
          revealing = false;
          drawn = true;
        },
      );
    }
    // Reaching for the sand mid-opening: it drops straight onto the plain letters, so what
    // they touch is the sand they will keep.
    function endReveal() {
      if (!revealing) return;
      revealing = false;
      gust = null;
      layPlain();
      cancelAnimationFrame(raf);
      draw();
    }

    // A gust sweeps left to right, dragging every displaced grain back to where it lay
    // on load. With reduced motion the grains simply go home.
    blowBack = () => {
      if (gust || wind || !buckets.length) return;
      restored = true;
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
        draw();
      } else {
        runGust(moving);
      }
    };

    // A puff of wind from the figure's book, blowing the way it points. With reduced
    // motion the physics runs to the end at once and the sand appears where it lands.
    // A puff during another one starts a fresh gust over everything it reaches, while
    // grains still moving from the first keep their momentum.
    puff = () => {
      endReveal();
      if (gust || !buckets.length) return;
      // From the figure's book, wherever the figure actually sits (on narrow screens it
      // wraps below the byline), measured from its layout box, in the words' coordinates.
      const c = cv.getBoundingClientRect();
      const row = fanner!.parentElement!.getBoundingClientRect();
      const boxRight = row.left + fanner!.offsetLeft + FIGURE_WIDTH - (c.left + BLEED);
      const boxTop = row.top + fanner!.offsetTop - (c.top + BLEED);
      const p = puffFrom(boxRight, boxTop - FOOT_GAP);
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
      endReveal();
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
      revealing = false;
      gust = null;
      wind = null;
      drawn = false;
      build();
      draw();
    });

    if (!revealed) for (const e of FIRST_ACTIONS) window.addEventListener(e, reveal, true);

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
      for (const e of FIRST_ACTIONS) window.removeEventListener(e, reveal, true);
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
  <!-- Floats above the end of "Systems" so showing it never shifts the page. -->
  <button
    type="button"
    class={["link g3 blow", drawn && "shown"]}
    style:right="{restoreInset}px"
    onclick={() => blowBack?.()}
  >
    Restore
  </button>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  <div class="foot" style:padding-right="{figurePad}px">
    {@render children?.()}
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
  /* The byline and the figure share a row under the words. When there isn't room for
     both (phones), the row wraps and the figure drops below the byline, staying right.
     The column gap keeps text clear of the leaning figure's reach (FIGURE_REACH). */
  .foot {
    position: relative;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 46px;
    margin-top: 8px;
  }
  .foot > :global(:not(.fanner)) {
    flex: 1 1 260px;
    min-width: 0;
  }
  /* The two drawings are scaled so their benches match, then lined up on the bench. */
  .fanner {
    margin-left: auto;
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
