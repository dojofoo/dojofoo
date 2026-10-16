import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import { usePreviewPlay } from "~/lib/preview-play";

type Side = "left" | "right";

// Clip insets (left, right) for each resting place of the line. Hidden
// "at" a side means collapsed against that edge, so drawing from there
// grows away from it and hiding toward it shrinks into it.
const HIDDEN_AT: Record<Side, [string, string]> = {
  left: ["0%", "100%"],
  right: ["100%", "0%"],
};
const SHOWN: [string, string] = ["0%", "0%"];

function set(el: HTMLElement, [l, r]: [string, string]) {
  el.style.setProperty("--ul-l", l);
  el.style.setProperty("--ul-r", r);
}

// hidden: whether the line is fully gone. Only then is it safe to teleport
// it to the other edge; mid-exit it just reverses from where it is.
function draw(el: HTMLElement, hidden: { current: boolean }, from: Side) {
  if (hidden.current) {
    el.dataset.instant = "";
    set(el, HIDDEN_AT[from]);
    // Commits the start position before the transition is restored.
    void el.offsetWidth;
    delete el.dataset.instant;
  }
  hidden.current = false;
  delete el.dataset.leaving;
  el.dataset.on = "";
  set(el, SHOWN);
}

function erase(el: HTMLElement, toward: Side) {
  el.dataset.leaving = "";
  delete el.dataset.on;
  set(el, HIDDEN_AT[toward]);
}

function sideOf(el: HTMLElement, clientX: number): Side {
  const r = el.getBoundingClientRect();
  return clientX < r.left + r.width / 2 ? "left" : "right";
}

export function DirectionalLink({
  className,
  rest = false,
  simulate,
  children,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: ComponentProps<"a"> & {
  /** Keeps a faint line under the link at rest, for links inside prose. */
  rest?: boolean;
  /** Acts out a pointer without one: over, and the side it came in from
   * (or, once no longer over, the side it left by). For demos. */
  simulate?: { over: boolean; side: Side };
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const hidden = useRef(true);
  const hovered = useRef(false);

  const simOver = simulate?.over;
  const simSide = simulate?.side;
  useEffect(() => {
    const el = ref.current;
    if (!el || simOver === undefined || simSide === undefined) return;
    if (simOver) draw(el, hidden, simSide);
    else if (!hidden.current) erase(el, simSide);
  }, [simOver, simSide]);

  return (
    <a
      ref={ref}
      {...props}
      onPointerEnter={(e) => {
        onPointerEnter?.(e);
        if (e.pointerType === "touch") return;
        hovered.current = true;
        draw(e.currentTarget, hidden, sideOf(e.currentTarget, e.clientX));
      }}
      onPointerLeave={(e) => {
        onPointerLeave?.(e);
        if (e.pointerType === "touch") return;
        hovered.current = false;
        // Keyboard focus still owns the line.
        if (e.currentTarget.matches(":focus-visible")) return;
        erase(e.currentTarget, sideOf(e.currentTarget, e.clientX));
      }}
      onFocus={(e) => {
        onFocus?.(e);
        // Reading order: a focused link underlines from the start of the text.
        if (e.currentTarget.matches(":focus-visible")) draw(e.currentTarget, hidden, "left");
      }}
      onBlur={(e) => {
        onBlur?.(e);
        if (!hovered.current) erase(e.currentTarget, "right");
      }}
      // A pseudo-element's transitionend is dispatched on its host, so
      // target === currentTarget here means the line itself settled.
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget || e.propertyName !== "clip-path") return;
        const l = e.currentTarget.style.getPropertyValue("--ul-l");
        const r = e.currentTarget.style.getPropertyValue("--ul-r");
        hidden.current = l === "100%" || r === "100%";
      }}
      className={cn(
        "relative inline-block rounded-[2px] leading-tight whitespace-nowrap text-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground",
        // The resting hairline, for prose where a link must look like one.
        rest &&
          "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border",
        // The drawn line. Clip, not scaleX: its origin can't jump mid-flight,
        // and it can reverse from any partial state. Enter 240ms, leave 180ms.
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-foreground after:[clip-path:inset(0_var(--ul-r,100%)_0_var(--ul-l,0%))]",
        "after:transition-[clip-path] after:duration-[240ms] after:ease-[cubic-bezier(0.23,1,0.32,1)]",
        "data-leaving:after:duration-[180ms] data-instant:after:transition-none",
        // Reduced motion: the line fades in whole instead of travelling.
        "motion-reduce:after:[clip-path:none] motion-reduce:after:opacity-0 motion-reduce:after:transition-[opacity] motion-reduce:hover:after:opacity-100 motion-reduce:focus-visible:after:opacity-100 motion-reduce:data-on:after:opacity-100",
        className,
      )}
    >
      {children}
    </a>
  );
}

const NAV = ["Work", "Writing", "About", "Contact"];
// The index card's show: a cursor glides along the nav one way, then back
// the other, so each line arrives from the side the cursor did. Each link
// is crossed in ENTER_TO_LEAVE ms, with STRIDE ms between link entries.
const STRIDE = 320;
const ENTER_TO_LEAVE = 220;
const SHOW_START = 300;
// The beat between passes, and before the show repeats.
const SHOW_TURN = 900;
const SHOW_REST = 1600;
type Sim = { over: boolean; side: Side } | undefined;

export default function DirectionalUnderlineDemo() {
  const play = usePreviewPlay();
  const [sims, setSims] = useState<Sim[]>(() => NAV.map(() => undefined));

  useEffect(() => {
    if (play !== true) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (t: number, fn: () => void) => timers.push(setTimeout(fn, t));
    const patch = (i: number, sim: Sim) =>
      setSims((prev) => prev.map((s, j) => (j === i ? sim : s)));

    const pass = (start: number, from: Side) => {
      const exitTo: Side = from === "left" ? "right" : "left";
      const order = from === "left" ? NAV.map((_, i) => i) : NAV.map((_, i) => NAV.length - 1 - i);
      order.forEach((i, n) => {
        at(start + n * STRIDE, () => patch(i, { over: true, side: from }));
        at(start + n * STRIDE + ENTER_TO_LEAVE, () => patch(i, { over: false, side: exitTo }));
      });
      return start + (NAV.length - 1) * STRIDE + ENTER_TO_LEAVE;
    };
    const loop = (start: number) => {
      const back = pass(start, "left") + SHOW_TURN;
      const end = pass(back, "right");
      at(end + SHOW_REST, () => {
        timers.length = 0;
        loop(0);
      });
    };
    loop(SHOW_START);
    // Unhovering lets any drawn line leave the way it was heading.
    return () => {
      timers.forEach(clearTimeout);
      setSims((prev) =>
        prev.map((s) =>
          s?.over ? { over: false, side: s.side === "left" ? "right" : "left" } : s,
        ),
      );
    };
  }, [play]);

  return (
    <div className="flex w-[min(400px,100%)] flex-col gap-8">
      <p className="text-[15px] leading-7 text-muted-foreground">
        I build interfaces at{" "}
        <DirectionalLink rest href="#studio">
          a small studio
        </DirectionalLink>
        , write about{" "}
        <DirectionalLink rest href="#motion">
          motion
        </DirectionalLink>{" "}
        on weekends, and keep{" "}
        <DirectionalLink rest href="#reading">
          a reading list
        </DirectionalLink>{" "}
        of the good stuff.
      </p>
      <nav aria-label="Main" className="flex gap-5 text-sm font-medium">
        {NAV.map((item, i) => (
          <DirectionalLink
            key={item}
            href={`#${item.toLowerCase()}`}
            simulate={sims[i]}
            className="py-0.5"
          >
            {item}
          </DirectionalLink>
        ))}
      </nav>
    </div>
  );
}
