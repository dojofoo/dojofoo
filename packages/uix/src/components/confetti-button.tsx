import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";
import { usePreviewPlay } from "~/lib/preview-play";

// Loaded only where the hint shows, so no other page pays for it.
// The original sets this label in Caveat via next/font; uix keeps to Inter, the one typeface
const hand = { className: "font-medium" };

// A press shorter than this is a click and gets the small pop.
const HOLD_DELAY = 180;
// From the first shake to detonation. Long enough to build dread, short
// enough that nobody gives up halfway.
const CHARGE_MS = 1500;

type Burst = {
  count: number;
  // Half-angle around straight up; PI is every direction.
  cone: number;
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  // How far along the button's face pieces start, as a share of its width.
  spread: number;
  size: number;
};

// Enough to read as a pop, few enough that a frame stays well under 1ms.
const POP: Burst = {
  count: 60,
  cone: (34 * Math.PI) / 180,
  speedMin: 520,
  speedMax: 1000,
  lifeMin: 1.5,
  lifeMax: 2.3,
  spread: 1 / 3,
  size: 1,
};
// The detonation: every direction, twice as fast, lingering longer, with
// some bigger pieces. Still one canvas and one loop.
const BLAST: Burst = {
  count: 360,
  cone: Math.PI,
  speedMin: 700,
  speedMax: 2100,
  lifeMin: 2,
  lifeMax: 3.4,
  spread: 1 / 2,
  size: 1.35,
};

// px/s². Paired with heavy drag, paper floats down at gravity / drag
// instead of dropping like a stone.
const GRAVITY = 650;
const DRAG = 5;
// Fades over the last 30% of its life, so nothing blinks out.
const FADE = 0.3;
// Caps a frame after a hitch, so a stalled tab doesn't teleport pieces.
const MAX_DT = 1 / 30;
const CHECK_FOR = 1400;

// Mostly quiet neutrals, with red-pen marker as the one accent, so it
// celebrates without shouting and follows the theme.
const PALETTE = [
  { token: "--foreground", weight: 0.45 },
  { token: "--muted-foreground", weight: 0.35 },
  { token: "--marker", weight: 0.2 },
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rotation: number;
  spin: number;
  // Flutter: the flip reads as paper turning over, the sway as it drifting
  // side to side on the way down.
  flipSpeed: number;
  swaySpeed: number;
  sway: number;
  phase: number;
  age: number;
  life: number;
  color: string;
  alpha: number;
};

const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;

// Tokens are light-dark() declarations, which canvas can't parse. Routing
// each through `color` lets the browser resolve it for the current theme.
function readPalette(el: HTMLElement) {
  const colors = PALETTE.map(({ token, weight }) => {
    el.style.color = `var(${token})`;
    return { color: getComputedStyle(el).color, weight };
  });
  el.style.color = "";
  return colors;
}

function pick(colors: { color: string; weight: number }[]) {
  let r = Math.random();
  for (const c of colors) {
    if ((r -= c.weight) <= 0) return c.color;
  }
  return colors[0].color;
}

const between = (a: number, b: number) => a + Math.random() * (b - a);

/** Drives the button from code, for walkthroughs and previews. */
export type ConfettiControls = {
  /** Starts a hold. `cap` stops the fuse short (below 1 it never blows);
   * `haptics: false` keeps the phone still. */
  hold: (options?: { cap?: number; haptics?: boolean }) => void;
  /** Lets go. `charge` overrides how big the pop is (0 is the plain click pop). */
  release: (options?: { charge?: number }) => void;
  /** Drops the hold without celebrating. */
  cancel: () => void;
};
const vibrate = (ms: number | number[]) => navigator.vibrate?.(ms);

export function ConfettiButton({
  children = "Celebrate",
  hint = "hold me for a surprise",
  onCelebrate,
  controls,
  className,
}: {
  children?: React.ReactNode;
  // A handwritten nudge pointing at the button, gone after the first blast.
  // Pass null to leave it out.
  hint?: string | null;
  onCelebrate?: (kind: "pop" | "blast") => void;
  controls?: Ref<ConfettiControls>;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fuseRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const particles = useRef<Particle[]>([]);
  const frame = useRef(0);
  const last = useRef(0);
  const hold = useRef<{
    start: number;
    frame: number;
    buzzed: number;
    cap: number;
    haptics: boolean;
  } | null>(null);
  // The canvas covers the whole viewport so a blast can fill the screen; it
  // mounts on the first press, so a page that never celebrates never pays.
  const [layer, setLayer] = useState(false);
  const [checked, setChecked] = useState(false);
  const [blasted, setBlasted] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Device pixels, so confetti stays crisp.
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [layer]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      if (hold.current) cancelAnimationFrame(hold.current.frame);
      clearTimeout(checkTimer.current);
    },
    [],
  );

  const tick = (now: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dt = Math.min((now - last.current) / 1000, MAX_DT);
    last.current = now;
    const dpr = window.devicePixelRatio || 1;
    const decay = Math.exp(-DRAG * dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const alive: Particle[] = [];
    for (const p of particles.current) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx *= decay;
      p.vy = p.vy * decay + GRAVITY * dt;
      p.x += (p.vx + Math.sin(p.age * p.swaySpeed + p.phase) * p.sway) * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;

      const flip = Math.cos(p.age * p.flipSpeed + p.phase);
      const cos = Math.cos(p.rotation);
      const sin = Math.sin(p.rotation);
      const remaining = (p.life - p.age) / p.life;
      ctx.globalAlpha = p.alpha * Math.min(remaining / FADE, 1);
      ctx.fillStyle = p.color;
      // Rotate, then squash on one axis: a cheap stand-in for a 3D tumble.
      ctx.setTransform(
        dpr * cos,
        dpr * sin,
        -dpr * sin * flip,
        dpr * cos * flip,
        dpr * p.x,
        dpr * p.y,
      );
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      alive.push(p);
    }
    particles.current = alive;
    ctx.globalAlpha = 1;

    // The loop exists only while something is in the air.
    frame.current = alive.length > 0 ? requestAnimationFrame(tick) : 0;
  };

  const run = () => {
    if (frame.current) return;
    last.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  };

  const spray = (b: Burst, x: number, y: number, width: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const colors = readPalette(canvas);
    for (let i = 0; i < b.count; i++) {
      const angle = -Math.PI / 2 + between(-b.cone, b.cone);
      const speed = between(b.speedMin, b.speedMax);
      const shape = Math.random();
      const w = between(5, 9) * b.size;
      particles.current.push({
        x: x + between(-width * b.spread, width * b.spread),
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w,
        // Squares, slips and, in a blast, the odd long streamer.
        h:
          shape < 0.25
            ? w
            : b === BLAST && shape > 0.9
              ? w * between(1.6, 2.4)
              : w * between(0.4, 0.55),
        rotation: between(0, Math.PI * 2),
        spin: between(-6, 6),
        flipSpeed: between(6, 14),
        swaySpeed: between(3, 6),
        sway: between(15, 40),
        phase: between(0, Math.PI * 2),
        age: 0,
        life: between(b.lifeMin, b.lifeMax),
        color: pick(colors),
        alpha: between(0.75, 1),
      });
    }
    run();
  };

  const origin = () => {
    const r = buttonRef.current!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  };

  const confirm = () => {
    setChecked(true);
    clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => setChecked(false), CHECK_FOR);
  };

  const pop = (charge = 0) => {
    onCelebrate?.("pop");
    if (reduceMotion) return confirm();
    const { x, y, r } = origin();
    // A fuse let go early still counts for something: the pop grows with
    // how far it burned.
    spray(
      {
        ...POP,
        count: Math.round(POP.count + 160 * charge),
        speedMax: POP.speedMax + 700 * charge,
        cone: POP.cone + charge * 0.8,
      },
      x,
      y,
      r.width,
    );
  };

  const blast = () => {
    onCelebrate?.("blast");
    setBlasted(true);
    confirm();
    vibrate([40, 30, 80]);
    if (reduceMotion) return;
    const { x, y, r } = origin();
    spray(BLAST, x, y, r.width);
    // The button takes the recoil: it bursts outward, overshoots back and
    // wobbles to rest, like something that just went off in your hand.
    buttonRef.current?.animate(
      [
        { transform: "scale(0.88)" },
        { transform: "scale(1.18) rotate(-3deg)", offset: 0.18 },
        { transform: "scale(0.94) rotate(2deg)", offset: 0.42 },
        { transform: "scale(1.03) rotate(-1deg)", offset: 0.68 },
        { transform: "none" },
      ],
      { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
    // The shockwave: one ring, pushed out and faded, compositor only.
    ringRef.current?.animate(
      [
        { transform: "scale(0.6)", opacity: 0.55 },
        { transform: "scale(5.5)", opacity: 0 },
      ],
      { duration: 620, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  };

  const fuse = (p: number) => {
    // Burns across the button from the left, like a lit fuse.
    if (fuseRef.current)
      fuseRef.current.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0 round 9999px)`;
  };

  const settle = () => {
    const button = buttonRef.current;
    if (button) {
      button.style.transform = "";
      button.removeAttribute("data-charging");
    }
    fuse(0);
  };

  const charge = (now: number) => {
    const h = hold.current;
    const button = buttonRef.current;
    if (!h || !button) return;
    const t = now - h.start;
    if (t > HOLD_DELAY) {
      const p = Math.min((t - HOLD_DELAY) / CHARGE_MS, h.cap);
      button.setAttribute("data-charging", "");
      fuse(p);
      if (!reduceMotion) {
        // Shakes harder and faster as it nears the end, squeezing down as if
        // under pressure. Fresh jitter every frame reads as vibration.
        const a = 0.4 + 3.2 * p * p;
        const jx = between(-a, a);
        const jy = between(-a, a) * 0.6;
        const rot = between(-1, 1) * 2.5 * p * p;
        button.style.transform = `translate(${jx}px, ${jy}px) rotate(${rot}deg) scale(${0.96 - 0.08 * p})`;
        // Sparks spit from the burning end of the fuse, more as it grows.
        if (between(0, 1) < 0.15 + 0.6 * p) {
          const r = button.getBoundingClientRect();
          spray(
            {
              ...POP,
              count: 1 + Math.round(p * 2),
              cone: 0.9,
              speedMin: 120,
              speedMax: 320 + 300 * p,
              lifeMin: 0.35,
              lifeMax: 0.8,
              spread: 0,
              size: 0.55,
            },
            r.left + r.width * p,
            r.top + r.height / 2,
            0,
          );
        }
      }
      // Short buzzes that come closer together, where phones allow it.
      if (h.haptics && now - h.buzzed > 220 - 150 * p) {
        vibrate(8);
        h.buzzed = now;
      }
      if (p >= 1) {
        hold.current = null;
        settle();
        blast();
        return;
      }
    }
    h.frame = requestAnimationFrame(charge);
  };

  const press = (cap = 1, haptics = true) => {
    if (hold.current) return;
    setLayer(true);
    hold.current = { start: performance.now(), frame: 0, buzzed: 0, cap, haptics };
    hold.current.frame = requestAnimationFrame(charge);
  };

  const release = (charge?: number) => {
    const h = hold.current;
    if (!h) return;
    cancelAnimationFrame(h.frame);
    hold.current = null;
    const t = performance.now() - h.start;
    const p = charge ?? Math.min(Math.max((t - HOLD_DELAY) / CHARGE_MS, 0), h.cap);
    settle();
    // Let go before it blew: the pop grows with how far the fuse burned.
    // The canvas mounts on the press, so give it a frame to exist.
    requestAnimationFrame(() => pop(p));
  };

  const cancel = () => {
    const h = hold.current;
    if (!h) return;
    cancelAnimationFrame(h.frame);
    hold.current = null;
    settle();
  };

  // Rebuilt every render so it always calls the current handlers.
  useImperativeHandle(controls, () => ({
    hold: (o) => press(o?.cap ?? 1, o?.haptics ?? true),
    release: (o) => release(o?.charge),
    cancel,
  }));

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {layer &&
        createPortal(
          <canvas
            ref={canvasRef}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-50 size-full"
          />,
          document.body,
        )}
      <div className="relative">
        {hint && <Hint text={hint} gone={blasted} />}
        {/* Sized to the button, so the shockwave starts at its edge. */}
        <span
          ref={ringRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-marker opacity-0"
        />
        <button
          ref={buttonRef}
          type="button"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            press();
          }}
          onPointerUp={() => release()}
          onPointerCancel={cancel}
          // A long press is the whole point here; Android would otherwise
          // answer it with a context menu and cancel the charge.
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              press();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") release();
          }}
          onBlur={cancel}
          // Assistive tech can activate without pointer or key events.
          onClick={(e) => {
            if (e.detail === 0 && !hold.current) {
              setLayer(true);
              requestAnimationFrame(() => pop());
            }
          }}
          aria-describedby={`${id}-how`}
          className="relative h-10 touch-none rounded-full bg-foreground px-5 text-sm font-medium text-background shadow-raised outline-hidden transition-[scale] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] data-[charging]:transition-none motion-reduce:transition-none"
        >
          {/* The lit fuse: red-pen ink burning across the button. */}
          <span
            ref={fuseRef}
            aria-hidden
            className="absolute inset-0 rounded-full bg-marker"
            style={{ clipPath: "inset(0 100% 0 0 round 9999px)" }}
          />
          {/* Both states share one grid cell, so the swap never resizes it. */}
          <span className="relative grid">
            <span
              className={cn(
                "col-start-1 row-start-1 transition-[opacity] duration-200 ease-out",
                checked && "opacity-0",
              )}
            >
              {children}
            </span>
            <span
              aria-hidden
              className="col-start-1 row-start-1 flex items-center justify-center"
            >
              <motion.svg
                viewBox="0 0 16 16"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={
                  checked
                    ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                    : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
                }
                transition={ICON_SWAP}
              >
                <path d="m3.5 8.5 3 3 6-7" />
              </motion.svg>
            </span>
          </span>
        </button>
      </div>
      <span id={`${id}-how`} className="sr-only">
        Click to celebrate, or hold for a bigger one.
      </span>
      <span className="sr-only" aria-live="polite">
        {checked ? "Celebrated" : ""}
      </span>
    </div>
  );
}

// Hand-traced rather than geometric: uneven curves, a loop that isn't quite
// round, and a head whose barbs differ in length and angle.
const ARROW =
  "M3 9C14 3.5 29 3 40 10.5C48.5 16.5 49 28 41.5 28.8C34.5 29.6 35.2 18.6 44 19.8C53.5 21 59 33.5 61.2 47.8" +
  "C58.8 44.6 55.8 42.6 52.4 41.8C55.8 42.6 58.8 44.6 61.2 47.8C62.6 44.2 64.4 40.6 67 38.2";

// Written above and to the left, with an arrow that curls down to the
// button: the note draws in once when it comes into view.
function Hint({ text, gone }: { text: string; gone: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setDrawn(true);
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden
      data-drawn={drawn}
      className={cn(
        "group/hint pointer-events-none absolute right-[70%] bottom-[120%] flex w-max flex-col items-end text-marker transition-[opacity,filter,translate] duration-300 ease-out",
        // It said its piece; after the first blast it leaves for good.
        gone && "-translate-y-1 opacity-0 blur-[2px]",
      )}
    >
      <span
        className={cn(
          hand.className,
          "translate-y-1 -rotate-6 text-[22px] leading-none opacity-0 transition-[opacity,translate] delay-100 duration-300 ease-out group-data-[drawn=true]/hint:translate-y-0 group-data-[drawn=true]/hint:opacity-100 motion-reduce:transition-none",
        )}
      >
        {text}
      </span>
      {/* One pen stroke, never lifted: out from the note, a quick doodled
          loop, down to the button, then both barbs of the head flicked out
          by doubling back over the first. Drawn as a single path, so the
          head arrives when the pen gets there instead of appearing on its
          own. */}
      <svg
        viewBox="0 0 80 60"
        className="mt-0.5 mr-[-46px] -mb-1 h-[60px] w-20 overflow-visible"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d={ARROW}
          pathLength={1}
          strokeWidth={2.1}
          // A pen speeds up through the stroke and slows into the head.
          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-300 duration-[900ms] ease-[cubic-bezier(0.45,0,0.25,1)] group-data-[drawn=true]/hint:[stroke-dashoffset:0] motion-reduce:transition-none"
        />
        {/* A second, thinner pass a hair off the first: ink pooling where
            the nib pressed, so the line isn't a uniform vector stroke. */}
        <path
          d={ARROW}
          pathLength={1}
          strokeWidth={1.1}
          opacity={0.55}
          transform="translate(0.6 0.4)"
          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-300 duration-[900ms] ease-[cubic-bezier(0.45,0,0.25,1)] group-data-[drawn=true]/hint:[stroke-dashoffset:0] motion-reduce:transition-none"
        />
      </svg>
    </span>
  );
}

export default function ConfettiButtonDemo() {
  const play = usePreviewPlay();
  const controls = useRef<ConfettiControls>(null);

  // Index preview: someone holds the button, the fuse burns and it shakes
  // and spits sparks, then they lose their nerve and let go for a small
  // pop. Capped short of the end, so a preview can never set off the
  // full-screen blast, and it never buzzes the phone.
  useEffect(() => {
    if (!play) return;
    // The handle is rebuilt each render; read it at call time.
    const button = controls;
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      button.current?.hold({ cap: 0.75, haptics: false });
      // 180ms to count as a hold, then about 70% of the fuse.
      timer = setTimeout(() => {
        button.current?.release({ charge: 0 });
        // Confetti settles in about two seconds; then a calm beat.
        timer = setTimeout(show, 2600);
      }, 1250);
    };
    timer = setTimeout(show, 300);
    return () => {
      clearTimeout(timer);
      button.current?.cancel();
    };
  }, [play]);

  return (
    <ConfettiButton controls={controls} className="h-72 w-[360px] max-w-full" />
  );
}
