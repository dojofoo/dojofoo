import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/utils";

/*
 * ArrowCallout – a note whose arrow draws itself to whatever it points at, after Xevrion's
 * (lab.xevrion.dev/lab/arrow-callout). Set in the page's own face, bold italic, in the brand color: the note reads as
 * an annotation without bringing a handwriting font along.
 */

type Pt = { x: number; y: number };
/** arc: a pen flick bulging to one side; straight: a ruled line; elbow: out of the note's side, then down into the target */
export type ArrowShape = "arc" | "straight" | "elbow";
type Box = { left: number; top: number; width: number; height: number };

const round = (n: number) => Math.round(n * 10) / 10;
// Room between the arrow tip and the target, so it points rather than stabs.
const TIP_GAP = 8;
// Padding around the path's box so round caps and the head never clip.
const PAD = 6;

// The curve lives in the note's own coordinates: (0,0) is the note's top left.
function geometry(note: Box, target: Box, flip = false, loop = false, shape: ArrowShape = "arc") {
  const tc = {
    x: target.left + target.width / 2 - note.left,
    y: target.top + target.height / 2 - note.top,
  };
  const dx = tc.x - note.width / 2;
  const dy = tc.y - note.height / 2;

  // Leaves from the side of the note that faces the target, a little below
  // the middle, the way a note-taker starts an arrow near the last word.
  let s: Pt;
  if (Math.abs(dx) > Math.abs(dy)) s = { x: dx < 0 ? -6 : note.width + 6, y: note.height * 0.6 };
  else s = { x: note.width * 0.35, y: dy < 0 ? -4 : note.height + 4 };

  // Aims at the target's centre and stops where that line meets its edge.
  const hw = target.width / 2 + TIP_GAP;
  const hh = target.height / 2 + TIP_GAP;
  const ax = s.x - tc.x;
  const ay = s.y - tc.y;
  const k = Math.min(ax ? hw / Math.abs(ax) : Infinity, ay ? hh / Math.abs(ay) : Infinity);
  let e = k < 1 ? { x: tc.x + ax * k, y: tc.y + ay * k } : tc;
  // An elbow leaves the side of the note facing the target, level, and comes down onto the target's top
  if (shape === "elbow") {
    s = { x: tc.x < note.width / 2 ? -6 : note.width + 6, y: note.height / 2 };
    e = { x: tc.x, y: target.top - note.top - TIP_GAP };
  }

  // A pen arc: bulges to one side (always upward, like a flick of the
  // wrist) by about a third of its length, capped so long arrows stay calm.
  const vx = e.x - s.x;
  const vy = e.y - s.y;
  const len = Math.hypot(vx, vy) || 1;
  let nx = -vy / len;
  let ny = vx / len;
  if (ny > 0 !== flip) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = Math.min(len * 0.32, 56);
  // Asymmetric handles: a quick start, a longer approach into the tip.
  const c1 = shape === "straight" ? { x: s.x + vx / 3, y: s.y + vy / 3 }
    : shape === "elbow" ? { x: s.x + Math.min(vx * 0.9, -40), y: s.y }
    : { x: s.x + vx * 0.15 + nx * bulge, y: s.y + vy * 0.15 + ny * bulge };
  const c2 = shape === "straight" ? { x: s.x + (vx * 2) / 3, y: s.y + (vy * 2) / 3 }
    : shape === "elbow" ? { x: e.x, y: e.y - vy * 0.9 }
    : { x: s.x + vx * 0.7 + nx * bulge * 0.75, y: s.y + vy * 0.7 + ny * bulge * 0.75 };

  // The head follows the curve's last tangent, two unequal barbs like a
  // quick hand would draw them.
  const angle = Math.atan2(e.y - c2.y, e.x - c2.x);
  const barb = (spread: number, length: number) => ({
    x: e.x - Math.cos(angle + spread) * length,
    y: e.y - Math.sin(angle + spread) * length,
  });
  const b1 = barb(0.5, 9);
  const b2 = barb(-0.45, 7.5);

  // A loop halfway, the way a pen curls: the stroke rises off the curve, swings back over itself and carries on a
  // little further along (a looped cycloid), then finishes the curve to the tip
  const shaft: Pt[] = [];
  if (loop) {
    const at = (t: number) => {
      const u = 1 - t;
      return {
        x: u * u * u * s.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
        y: u * u * u * s.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
      };
    };
    const steps = 32;
    // An elbow loops in its corner; an arc a little before halfway
    const start = shape === "elbow" ? 0.5 : 0.42;
    for (let i = 0; i <= steps; i++) shaft.push(at((i / steps) * start));
    const from = at(start);
    const ahead = at(start + 0.001);
    const tl = Math.hypot(ahead.x - from.x, ahead.y - from.y) || 1;
    const tx = (ahead.x - from.x) / tl;
    const ty = (ahead.y - from.y) / tl;
    // Curls to the outside of the bend
    const side = flip ? -1 : 1;
    const nx = -ty * side;
    const ny = tx * side;
    // Moves k along per radian while circling at radius R; R > k makes it cross itself
    const k = 3;
    const R = 10;
    for (let i = 1; i <= 48; i++) {
      const phi = (i / 48) * Math.PI * 2;
      const along = k * phi + R * Math.sin(phi);
      const across = R * (1 - Math.cos(phi));
      shaft.push({ x: from.x + tx * along + nx * across, y: from.y + ty * along + ny * across });
    }
    // Rejoins the curve: the gap between where the loop ends and the curve point it resumes from fades out by the tip
    const resume = Math.min(0.95, start + (2 * Math.PI * k) / len);
    const end = shaft[shaft.length - 1]!;
    const rejoin = at(resume);
    for (let i = 1; i <= steps; i++) {
      const pt = at(resume + (i / steps) * (1 - resume));
      const fade = (1 - i / steps) ** 2;
      shaft.push({ x: pt.x + (end.x - rejoin.x) * fade, y: pt.y + (end.y - rejoin.y) * fade });
    }
  }

  const xs = [s.x, c1.x, c2.x, e.x, b1.x, b2.x, ...shaft.map((pt) => pt.x)];
  const ys = [s.y, c1.y, c2.y, e.y, b1.y, b2.y, ...shaft.map((pt) => pt.y)];
  const box = {
    x: Math.min(...xs) - PAD,
    y: Math.min(...ys) - PAD,
    w: Math.max(...xs) - Math.min(...xs) + PAD * 2,
    h: Math.max(...ys) - Math.min(...ys) + PAD * 2,
  };
  const p = (pt: Pt) => `${round(pt.x)} ${round(pt.y)}`;
  return {
    box,
    body: shaft.length ? `M${shaft.map(p).join("L")}` : `M${p(s)}C${p(c1)} ${p(c2)} ${p(e)}`,
    head: `M${p(b1)}L${p(e)}L${p(b2)}`,
  };
}

export function ArrowCallout({
  target,
  follow = false,
  flip = false,
  loop = false,
  shape = "arc",
  children,
  className,
}: {
  /** The element the arrow points at. It can live anywhere on the page. */
  target: RefObject<HTMLElement | null>;
  /** Track the target every frame, for when a script (not a pointer) moves it. */
  follow?: boolean;
  /** Bends the arrow the other way: downward instead of the usual upward flick */
  flip?: boolean;
  /** Curls the shaft once halfway, a flourish of the pen */
  loop?: boolean;
  /** How the arrow runs to its target (arc, the default; straight; or elbow) */
  shape?: ArrowShape;
  children: ReactNode;
  className?: string;
}) {
  const note = useRef<HTMLSpanElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const body = useRef<SVGPathElement>(null);
  const head = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = note.current;
    const to = target.current;
    const art = svg.current;
    if (!el || !to || !art) return;

    // Straight DOM writes: this runs every frame while the target moves, and
    // a React render per frame would be wasted work.
    const layout = () => {
      const n = el.getBoundingClientRect();
      const t = to.getBoundingClientRect();
      // Rects are post-transform, but the svg is drawn in the note's own
      // pixels: inside a scaled container, divide the scale back out.
      const k = el.offsetWidth ? n.width / el.offsetWidth : 1;
      const g = geometry(
        { left: 0, top: 0, width: n.width / k, height: n.height / k },
        {
          left: (t.left - n.left) / k,
          top: (t.top - n.top) / k,
          width: t.width / k,
          height: t.height / k,
        },
        flip,
        loop,
        shape,
      );
      art.style.left = `${round(g.box.x)}px`;
      art.style.top = `${round(g.box.y)}px`;
      art.setAttribute("width", String(round(g.box.w)));
      art.setAttribute("height", String(round(g.box.h)));
      art.setAttribute("viewBox", `${round(g.box.x)} ${round(g.box.y)} ${round(g.box.w)} ${round(g.box.h)}`);
      body.current?.setAttribute("d", g.body);
      head.current?.setAttribute("d", g.head);
    };
    layout();

    // Any layout change around either end reshapes the arrow.
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    ro.observe(to);
    ro.observe(document.documentElement);

    // Transforms don't trigger ResizeObserver, so while the target is being
    // handled (dragged, springing back) follow it frame by frame, and sleep
    // once it has held still for a few frames.
    let raf = 0;
    let still = 0;
    let last = "";
    let held = follow;
    const track = () => {
      const r = to.getBoundingClientRect();
      const now = `${r.left},${r.top},${r.width},${r.height}`;
      if (now !== last) {
        last = now;
        still = 0;
        layout();
      } else still++;
      if (held || still < 12) raf = requestAnimationFrame(track);
    };
    const wake = () => {
      cancelAnimationFrame(raf);
      still = 0;
      raf = requestAnimationFrame(track);
    };
    const down = () => {
      held = true;
      wake();
    };
    const up = () => {
      held = false;
    };
    to.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    to.addEventListener("transitionrun", wake);
    if (follow) wake();

    // Draws once, when the note is properly on screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        art.dataset.drawn = "true";
        io.disconnect();
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      to.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      to.removeEventListener("transitionrun", wake);
    };
  }, [target, follow, flip, loop, shape]);

  const ink = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    pathLength: 1,
  } as const;

  return (
    <span ref={note} className={cn("relative inline-block text-(--brand)", className)}>
      <span className="inline-block text-[15px] leading-tight font-bold italic whitespace-nowrap">
        {children}
      </span>
      <svg
        ref={svg}
        aria-hidden
        data-drawn="false"
        className="group/arrow pointer-events-none absolute overflow-visible"
      >
        {/* A pen stroke: eases into the line and off it, 650ms because the
            drawing is the point and it plays once. The head lands after. */}
        <path
          ref={body}
          {...ink}
          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-200 duration-[650ms] ease-[cubic-bezier(0.65,0,0.35,1)] group-data-[drawn=true]/arrow:[stroke-dashoffset:0] motion-reduce:[stroke-dashoffset:0] motion-reduce:transition-none"
        />
        <path
          ref={head}
          {...ink}
          className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] delay-[830ms] duration-[160ms] ease-out group-data-[drawn=true]/arrow:[stroke-dashoffset:0] motion-reduce:[stroke-dashoffset:0] motion-reduce:transition-none"
        />
      </svg>
    </span>
  );
}
