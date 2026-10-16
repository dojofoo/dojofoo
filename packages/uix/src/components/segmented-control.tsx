import { useLayoutEffect, useRef, useState } from "react";
import { animate, motion, useMotionTemplate, useMotionValue } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

// The pill travels like an inchworm: the edge facing the move leaves first
// and lands first, the trailing edge follows on a softer spring and settles
// with a touch of give. Both springs keep their velocity, so a second click
// mid-move bends the pill toward the new target instead of restarting it.
// The trailing edge settles by ~360ms; the leading edge has already landed
// at ~180ms, which is the moment the label turns and the eye reads "done".
const LEAD = { type: "spring", visualDuration: 0.18, bounce: 0 } as const;
const TRAIL = { type: "spring", visualDuration: 0.36, bounce: 0.15 } as const;
// Arrow keys fire in quick runs: both edges move together, briefly.
const KEYS = { type: "spring", visualDuration: 0.15, bounce: 0 } as const;

/*
 * uix's one segmented control – the evals filter and the brief's tabs both use it. Sizes sit on Fluid
 * Functionalism's control ladder: the track's padding plus the button adds back up to the control height
 * (default 4 + 28 = 36px, compact 2 + 24 = 28px). The track is a hover tint on whatever surface is below; the
 * selected button is a pill on --pill-surface (surface 4 in light, 5 in dark) with shadow 3, and its label turns
 * semibold with the paired optical size, so the width holds while the pill glides.
 */
const sizes = {
  default: { track: "p-1 rounded-[10px]", item: "h-7 px-3 rounded-[6px]", text: "text-[length:var(--fs-body,13px)]", radius: 6 },
  compact: { track: "p-0.5 rounded-[8px]", item: "h-6 px-2.5 rounded-[6px]", text: "text-[length:var(--fs-caption,12px)]", radius: 6 },
} as const;

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  size = "default",
  fill = false,
  kind = "radio",
  className,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Default 36px, compact 28px – a dense row (a toolbar, a table's header) takes compact */
  size?: keyof typeof sizes;
  /** Share the width equally, e.g. tabs across a panel */
  fill?: boolean;
  /** "tabs" when the options switch what's shown below (tablist), "radio" when they set a value */
  kind?: "radio" | "tabs";
  className?: string;
}) {
  const s = sizes[size];
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  // The pill's insets as motion values – they place the pill and clip the label copy, and no frame of the move
  // re-renders React.
  const top = useMotionValue(0);
  const right = useMotionValue(0);
  const bottom = useMotionValue(0);
  const left = useMotionValue(0);
  const clipPath = useMotionTemplate`inset(${top}px ${right}px ${bottom}px ${left}px round ${s.radius}px)`;
  // Starts "place" so the pill is set without sliding in on page load.
  const mode = useRef<"place" | "click" | "key">("place");

  useLayoutEffect(() => {
    const list = listRef.current;
    const overlay = overlayRef.current;
    const tab = tabRefs.current.get(value);
    if (!list || !overlay || !tab) return;

    const measure = (resize: boolean) => {
      const nextLeft = tab.offsetLeft;
      const nextRight = list.clientWidth - nextLeft - tab.offsetWidth;
      top.jump(tab.offsetTop);
      bottom.jump(list.clientHeight - tab.offsetTop - tab.offsetHeight);
      const how = resize || reduceMotion ? "place" : mode.current;
      if (how === "place") {
        left.jump(nextLeft);
        right.jump(nextRight);
      } else if (how === "key") {
        animate(left, nextLeft, KEYS);
        animate(right, nextRight, KEYS);
      } else {
        // Moving right, the right edge leads; moving left, the left does.
        const toRight = nextLeft > left.get();
        animate(left, nextLeft, toRight ? TRAIL : LEAD);
        animate(right, nextRight, toRight ? LEAD : TRAIL);
      }
      overlay.style.visibility = "visible";
    };

    measure(false);
    let first = true;
    const observer = new ResizeObserver(() => {
      // The observer fires once on subscribe; that is not a resize.
      if (first) first = false;
      else measure(true);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, reduceMotion, top, right, bottom, left]);

  const select = (next: string, fromKeyboard: boolean) => {
    mode.current = fromKeyboard ? "key" : "click";
    onChange(next);
  };

  const tabs = kind === "tabs";
  const layout = cn(fill ? "flex w-full" : "inline-flex", "relative", s.track);
  const cell = cn("flex items-center justify-center whitespace-nowrap", fill && "flex-1", s.item, s.text);

  return (
    <div
      ref={listRef}
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      className={cn(
        layout,
        "bg-[var(--fluid-hover)] has-focus-visible:outline-1 has-focus-visible:outline-solid has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--focus-ring)]",
        className,
      )}
      onKeyDown={(e) => {
        const index = options.indexOf(value);
        const target = {
          ArrowRight: index + 1,
          ArrowDown: index + 1,
          ArrowLeft: index - 1,
          ArrowUp: index - 1,
          Home: 0,
          End: options.length - 1,
        }[e.key];
        if (target === undefined) return;
        e.preventDefault();
        const next = options[(target + options.length) % options.length];
        select(next, true);
        tabRefs.current.get(next)?.focus();
      }}
    >
      {options.map((option) => (
        <button
          key={option}
          ref={(el) => {
            if (el) tabRefs.current.set(option, el);
            else tabRefs.current.delete(option);
          }}
          type="button"
          role={tabs ? "tab" : "radio"}
          {...(tabs ? { "aria-selected": option === value } : { "aria-checked": option === value })}
          tabIndex={option === value ? 0 : -1}
          onClick={() => select(option, false)}
          style={{ fontVariationSettings: '"wght" 400, "opsz" 14' }}
          className={cn(cell, "text-[var(--fluid-muted)] transition-[color] duration-[var(--motion-fast,100ms)] ease-out outline-hidden hover:text-[var(--fluid-foreground)]")}
        >
          {option}
        </button>
      ))}

      {/* The pill – a surface with shadow 3 – and over it a copy of the row in the selected style, clipped to the
          pill, so each label recolors exactly as the pill's edge crosses it */}
      <div ref={overlayRef} aria-hidden className="pointer-events-none invisible absolute inset-0">
        <motion.div className="absolute" style={{ top, right, bottom, left, borderRadius: s.radius, background: "var(--pill-surface)", boxShadow: "var(--shadow-3)" }} />
        <motion.div style={{ clipPath }} className={cn(layout, "inset-0 h-full w-full text-[var(--fluid-foreground)]")}>
          {options.map((option) => (
            <span key={option} className={cell} style={{ fontVariationSettings: '"wght" 550, "opsz" 18' }}>
              {option}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

const RANGES = ["Day", "Week", "Month", "Year"] as const;

export default function SegmentedControlDemo() {
  const [range, setRange] = useState<string>("Week");

  return (
    <SegmentedControl
      label="Range"
      options={RANGES}
      value={range}
      onChange={setRange}
    />
  );
}
