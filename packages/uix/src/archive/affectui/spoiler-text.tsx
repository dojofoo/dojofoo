import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";
import { usePreviewPlay } from "~/lib/preview-play";

// How long the dissolve takes to travel from the click to the far edge,
// then how long each grain takes to fade once reached. 750ms in all is long
// for UI on purpose: it's a one-off payoff, and it never blocks reading.
const SPREAD_MS = 450;
const GRAIN_FADE_MS = 300;
const COVER_MS = 200;
// Grains per square pixel: dense enough to hide letter shapes, sparse
// enough to read as shimmer rather than a grey bar.
const DENSITY = 0.15;
const MAX_GRAINS = 1200;

type Rect = { x: number; y: number; w: number; h: number };
type Grain = { x: number; y: number; a: number; phase: number; speed: number; size: number };
type Phase = "hidden" | "dissolving" | "revealed" | "covering";

// Client rects are in screen pixels, but the canvas is drawn inside any
// CSS scale an ancestor applies (the index cards shrink demos), so every
// measurement is divided by that scale or it would be applied twice.
function screenScale(el: HTMLElement) {
  const s = el.getBoundingClientRect().width / el.offsetWidth;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

export function Spoiler({
  children,
  revealed: revealedProp,
  className,
}: {
  children: string;
  /**
   * Reveals or covers the spoiler from outside, dissolving from the middle
   * of its first line. Leave undefined to let readers reveal it themselves.
   */
  revealed?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const [chipOpen, setChipOpen] = useState(false);
  // The hide chip waits for the dissolve to finish, so it never pops up
  // over the payoff itself.
  const [settled, setSettled] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [chipPos, setChipPos] = useState<{ left: number; top: number } | null>(null);

  const probeRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  // Everything the draw loop reads lives in one ref, so the loop never
  // needs React state and never re-renders per frame.
  const engine = useRef({
    phase: "hidden" as Phase,
    phaseStart: 0,
    origin: { x: 0, y: 0 },
    maxDistance: 1,
    grains: [] as Grain[],
    rects: [] as Rect[],
    width: 0,
    height: 0,
    scale: 1,
    // The grain's own clock, which only advances while it shimmers, so a
    // paused shimmer resumes where it stopped instead of jumping.
    time: 0,
    last: 0,
    // Idle index cards hold the grain still until hovered: a hundred-odd
    // cards shouldn't each run a frame loop just to twinkle.
    frozen: false,
    // The last value of the `revealed` prop acted on.
    revealedTo: false,
    kick: () => {},
  });
  const focusAfter = useRef<"chip" | "text" | null>(null);

  const preview = usePreviewPlay();
  useEffect(() => {
    engine.current.frozen = preview === false;
    engine.current.kick();
  }, [preview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    const probe = probeRef.current;
    if (!canvas || !text || !probe) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const e = engine.current;
    let frame = 0;
    let onScreen = true;
    let color = "";
    let colorAge = 0;
    const still = !!reduceMotion;
    const block = text.closest<HTMLElement>("p, div, li") ?? text.parentElement;

    // Lines are measured from the text's real fragments and placed relative
    // to a zero-size probe, because an inline element that wraps has no
    // single box to anchor an overlay to.
    const measure = () => {
      const s = block ? screenScale(block) : 1;
      e.scale = s;
      const origin = probe.getBoundingClientRect();
      const fragments = Array.from(text.getClientRects())
        .filter((r) => r.width > 0)
        .map((r) => ({ left: r.left / s, top: r.top / s, right: r.right / s, bottom: r.bottom / s }));
      if (!fragments.length) return;
      const ox = origin.left / s;
      const oy = origin.top / s;
      const left = Math.min(...fragments.map((r) => r.left));
      const top = Math.min(...fragments.map((r) => r.top));
      const right = Math.max(...fragments.map((r) => r.right));
      const bottom = Math.max(...fragments.map((r) => r.bottom));
      e.width = Math.ceil(right - left);
      e.height = Math.ceil(bottom - top);
      e.rects = fragments.map((r) => ({
        x: r.left - left,
        y: r.top - top,
        w: r.right - r.left,
        h: r.bottom - r.top,
      }));

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(e.width * dpr);
      canvas.height = Math.round(e.height * dpr);
      canvas.style.width = `${e.width}px`;
      canvas.style.height = `${e.height}px`;
      canvas.style.left = `${Math.round(left - ox)}px`;
      canvas.style.top = `${Math.round(top - oy)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const grains: Grain[] = [];
      const area = e.rects.reduce((sum, r) => sum + r.w * r.h, 0);
      const perPx = Math.min(DENSITY, MAX_GRAINS / Math.max(area, 1));
      for (const r of e.rects) {
        const count = Math.round(r.w * r.h * perPx);
        for (let i = 0; i < count; i++) {
          grains.push({
            // Inset from the fragment's edge so the drift never leaves it.
            x: r.x + 1.5 + Math.random() * (r.w - 3),
            y: r.y + 2 + Math.random() * (r.h - 4),
            a: 0.35 + Math.random() * 0.65,
            phase: Math.random() * Math.PI * 2,
            speed: 0.6 + Math.random() * 1.8,
            size: Math.random() < 0.8 ? 1 : 1.5,
          });
        }
      }
      e.grains = grains;

      const last = fragments[fragments.length - 1];
      setChipPos({
        left: Math.round(last.right - ox),
        top: Math.round(last.top - oy),
      });
      draw(performance.now());
    };

    const draw = (now: number) => {
      // The ink colour comes from the theme; re-read it now and then so a
      // theme switch is picked up without a style read every frame.
      if (!color || colorAge++ > 30) {
        color = getComputedStyle(canvas).color;
        colorAge = 0;
      }
      ctx.clearRect(0, 0, e.width, e.height);
      ctx.fillStyle = color;
      const t = still ? 0 : e.time / 1000;
      const elapsed = now - e.phaseStart;
      let cover = 1;
      if (e.phase === "revealed") return;
      if (e.phase === "covering") cover = Math.min(1, elapsed / COVER_MS);

      for (const g of e.grains) {
        // Each grain drifts in a tiny loop and twinkles on its own clock.
        let x = g.x + Math.sin(t * g.speed + g.phase) * 1.2;
        let y = g.y + Math.cos(t * g.speed * 0.8 + g.phase) * 0.9;
        let alpha = g.a * (0.55 + 0.45 * Math.sin(t * g.speed * 2.2 + g.phase)) * cover;
        if (e.phase === "dissolving") {
          const dx = g.x - e.origin.x;
          const dy = g.y - e.origin.y;
          const d = Math.hypot(dx, dy) || 1;
          const local = elapsed - (d / e.maxDistance) * SPREAD_MS;
          if (local > 0) {
            const p = Math.min(1, local / GRAIN_FADE_MS);
            // Blown outward from the click, fast at first, then drifting.
            const push = (1 - (1 - p) * (1 - p)) * 7;
            x += (dx / d) * push;
            y += (dy / d) * push * 0.6;
            alpha *= 1 - p;
          }
        }
        if (alpha <= 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, g.size, g.size);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      frame = 0;
      e.time += e.last ? Math.min(now - e.last, 50) : 0;
      e.last = now;
      const elapsed = now - e.phaseStart;
      if (e.phase === "dissolving" && elapsed > SPREAD_MS + GRAIN_FADE_MS) {
        e.phase = "revealed";
        ctx.clearRect(0, 0, e.width, e.height);
        return;
      }
      if (e.phase === "covering" && elapsed > COVER_MS) e.phase = "hidden";
      draw(now);
      // Sleeps when revealed, offscreen, in a hidden tab or with reduced motion.
      const idle = e.phase === "hidden" && e.frozen;
      if (e.phase !== "revealed" && !idle && onScreen && !document.hidden && !still) {
        frame = requestAnimationFrame(loop);
      } else {
        e.last = 0;
      }
    };

    e.kick = () => {
      if (still) {
        if (e.phase === "dissolving") e.phase = "revealed";
        if (e.phase === "covering") e.phase = "hidden";
        if (e.phase === "revealed") ctx.clearRect(0, 0, e.width, e.height);
        else draw(0);
        return;
      }
      if (!frame && !(e.phase === "hidden" && e.frozen)) frame = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) e.kick();
    });
    io.observe(canvas);
    const onVisibility = () => {
      if (!document.hidden) e.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Re-measure whenever the paragraph reflows, and once fonts settle.
    const ro = new ResizeObserver(() => measure());
    if (block) ro.observe(block);
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) measure();
    });
    measure();
    e.kick();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      e.last = 0;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.kick = () => {};
    };
  }, [reduceMotion]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  useEffect(() => {
    const target = focusAfter.current;
    if (target === "chip" && settled) chipRef.current?.focus();
    else if (target === "text" && !revealed) textRef.current?.focus();
    else return;
    focusAfter.current = null;
  }, [revealed, settled]);

  // `along` is where on the first line the dissolve starts, 0 to 1.
  const reveal = (clientX?: number, clientY?: number, along = 0.5) => {
    const e = engine.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const first = e.rects[0];
    // Keyboard reveals start from the middle of the first line.
    e.origin =
      clientX === undefined || clientY === undefined
        ? { x: first ? first.x + first.w * along : 0, y: first ? first.y + first.h / 2 : 0 }
        : { x: (clientX - box.left) / e.scale, y: (clientY - box.top) / e.scale };
    e.maxDistance = Math.max(
      1,
      ...e.grains.map((g) => Math.hypot(g.x - e.origin.x, g.y - e.origin.y)),
    );
    e.phase = "dissolving";
    e.phaseStart = performance.now();
    e.kick();
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(
      () => setSettled(true),
      reduceMotion ? 0 : SPREAD_MS + GRAIN_FADE_MS,
    );
  };

  const cover = () => {
    const e = engine.current;
    e.phase = "covering";
    e.phaseStart = performance.now();
    e.kick();
    clearTimeout(settleTimer.current);
  };

  const hide = () => {
    cover();
    setChipOpen(false);
    setSettled(false);
    focusAfter.current = "text";
    engine.current.revealedTo = false;
    setRevealed(false);
  };

  // Outside control: the words follow the prop during render, the grain
  // follows it in an effect. It never moves focus, since it isn't the
  // reader acting.
  const [lastProp, setLastProp] = useState(revealedProp);
  if (revealedProp !== lastProp) {
    setLastProp(revealedProp);
    if (revealedProp !== undefined && revealedProp !== revealed) {
      setRevealed(revealedProp);
      setSettled(false);
      setChipOpen(false);
    }
  }
  useEffect(() => {
    const e = engine.current;
    if (revealedProp === undefined || revealedProp === e.revealedTo) return;
    e.revealedTo = revealedProp;
    // Off-centre, the way a finger lands on a word rather than its middle.
    if (revealedProp) reveal(undefined, undefined, 0.3);
    else cover();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the prop only
  }, [revealedProp]);

  const onClick = (event: MouseEvent) => {
    // Once revealed, a stray click only offers the hide chip; it takes a
    // second, deliberate press to cover the text again.
    if (revealed) {
      setChipOpen((o) => !o);
      return;
    }
    // detail 0 means the click came from the keyboard.
    setRevealed(true);
    engine.current.revealedTo = true;
    if (event.detail === 0) reveal();
    else reveal(event.clientX, event.clientY);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (revealed) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focusAfter.current = "chip";
      setRevealed(true);
      engine.current.revealedTo = true;
      reveal();
    }
  };

  return (
    <span className={cn("group/spoiler relative", className)}>
      <span ref={probeRef} aria-hidden className="pointer-events-none absolute top-0 left-0 size-0" />
      <span
        ref={textRef}
        role={revealed ? undefined : "button"}
        tabIndex={revealed ? -1 : 0}
        aria-label={revealed ? undefined : "Spoiler, press to reveal"}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={cn(
          // The padding is cancelled by an equal negative margin, so the pill
          // around hidden text never shifts the words once it is gone.
          "-mx-0.5 rounded-[4px] box-decoration-clone px-0.5 outline-hidden",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-foreground",
          "transition-[color,background-color,filter] ease-[cubic-bezier(0.23,1,0.32,1)]",
          revealed
            ? "bg-transparent text-inherit filter-none delay-75 duration-300"
            : "cursor-pointer bg-foreground/[0.06] text-transparent blur-[4px] duration-150 select-none motion-reduce:filter-none",
        )}
      >
        <span aria-hidden={!revealed}>{children}</span>
      </span>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 text-foreground",
          // Before measuring it has no size; keep it from flashing at 300x150.
          !chipPos && "invisible",
        )}
      />
      {revealed && settled && chipPos && (
        <button
          ref={chipRef}
          type="button"
          aria-label="Hide spoiler"
          data-open={chipOpen || undefined}
          onClick={() => hide()}
          style={{ left: chipPos.left, top: chipPos.top }}
          className={cn(
            // Sits just above the end of the spoiler, clear of the words.
            "absolute z-10 grid size-6 -translate-x-1/2 -translate-y-[calc(100%+2px)] origin-bottom place-items-center rounded-full bg-background text-muted-foreground shadow-raised outline-hidden",
            "transition-[opacity,scale,color] ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-foreground active:scale-[0.96]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground",
            // Hidden until the spoiler is hovered or the chip is focused or
            // tapped open. The exit waits a beat so the pointer can travel
            // from the words up to the chip.
            "pointer-events-none scale-[0.9] opacity-0 delay-150 duration-150 starting:scale-[0.9] starting:opacity-0",
            "group-hover/spoiler:pointer-events-auto group-hover/spoiler:scale-100 group-hover/spoiler:opacity-100 group-hover/spoiler:delay-0",
            "focus-visible:pointer-events-auto focus-visible:scale-100 focus-visible:opacity-100 focus-visible:delay-0",
            "data-open:pointer-events-auto data-open:scale-100 data-open:opacity-100 data-open:delay-0",
          )}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden className="size-3.5">
            <path
              d="M2 8s2.2-4.25 6-4.25S14 8 14 8s-2.2 4.25-6 4.25S2 8 2 8Z M8 9.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z M3 13 13 3"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {revealed ? `Revealed: ${children}` : ""}
      </span>
    </span>
  );
}

export default function SpoilerTextDemo() {
  const play = usePreviewPlay();
  const [shown, setShown] = useState([false, false]);

  // Index preview: a reader taps the first spoiler, then the second, reads
  // for a moment, and the grain drifts back over both.
  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, next: boolean[]) => timers.push(setTimeout(() => setShown(next), ms));
    const show = () => {
      at(350, [true, false]);
      at(1150, [true, true]);
      at(3300, [false, false]);
      timers.push(setTimeout(show, 4600));
    };
    show();
    return () => {
      timers.forEach(clearTimeout);
      setShown([false, false]);
    };
  }, [play]);

  // On its own page (play is null) the spoilers are the reader's alone.
  const revealed = (i: number) => (play === null ? undefined : play && shown[i]);

  return (
    <p className="max-w-[420px] text-base leading-7 text-pretty text-foreground">
      Halfway through the book you learn the narrator is{" "}
      <Spoiler revealed={revealed(0)}>the missing sister</Spoiler>. The last chapter shows the
      lighthouse keeper <Spoiler revealed={revealed(1)}>was never real</Spoiler>, which quietly
      recolors everything before it.
    </p>
  );
}
