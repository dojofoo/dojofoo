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
 * uix's one segmented control – the evals filter, the settings' tabs and the appearance switch all use it. The track
 * is a hover tint on whatever surface is below; the selected option is a pill on --pill-surface (surface 4 in light,
 * 5 in dark) with shadow 3, and its label turns semibold with the paired optical size, so the width holds while the
 * pill glides.
 *
 * Sizes, as track padding + option height: default 4 + 28 = 36px, compact 3 + 26 = 32px – the smallest that still
 * takes a finger, and on a touch screen (coarse pointer) compact grows to the default. Corners are concentric: the
 * track's radius is the pill's plus the padding, so the gap around the pill is even at the corners as on the sides.
 * Out of room, options shorten their labels with an ellipsis rather than spill. `fill` shares the width in equal
 * columns; given `width: auto` (a className), the columns are each as wide as the longest label instead.
 */
const sizes = ["default", "compact"] as const;

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
  /** Default 36px, compact 32px – a dense row (a toolbar, a table's header) takes compact */
  size?: (typeof sizes)[number];
  /** Share the width equally, e.g. tabs across a panel */
  fill?: boolean;
  /** "tabs" when the options switch what's shown below (tablist), "radio" when they set a value */
  kind?: "radio" | "tabs";
  className?: string;
}) {
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
  const clipPath = useMotionTemplate`inset(${top}px ${right}px ${bottom}px ${left}px)`;
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

  return (
    <div
      ref={listRef}
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      data-size={size}
      data-fill={fill || undefined}
      className={cn("ui-seg", className)}
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
          title={option}
          className="ui-seg__item"
        >
          <Label text={option} />
        </button>
      ))}

      {/* The pill – a surface with shadow 3 – and over it a copy of the row in the selected style, clipped to the
          pill, so each label recolors exactly as the pill's edge crosses it */}
      <div ref={overlayRef} aria-hidden className="ui-seg__overlay">
        <motion.div className="ui-seg__pill" style={{ top, right, bottom, left }} />
        <motion.div style={{ clipPath }} className="ui-seg__copy">
          {options.map((option) => (
            <span key={option} className="ui-seg__item">
              <Label text={option} />
            </span>
          ))}
        </motion.div>
      </div>
      <style href="ui-seg" precedence="default">{css}</style>
    </div>
  );
}

/** A label as wide as its semibold self, so the selected copy never runs out of room the regular one had */
function Label({ text }: { text: string }) {
  return <span className="ui-seg__label" data-text={text}><span>{text}</span></span>;
}

const css = /* css */ `
.ui-seg {
  --seg-pad: 4px;
  --seg-item: 28px;
  --seg-r: calc(6px * var(--squircle-factor, 1));
  --seg-px: 12px;
  --seg-fs: var(--fs-body, 13px);
  position: relative;
  display: inline-flex;
  max-width: 100%;
  padding: var(--seg-pad);
  border-radius: calc(var(--seg-r) + var(--seg-pad));
  background: var(--fluid-hover);
}
.ui-seg[data-size="compact"] { --seg-pad: 3px; --seg-item: 26px; --seg-px: 10px; --seg-fs: var(--fs-caption, 12px); }
@media (pointer: coarse) {
  .ui-seg[data-size="compact"] { --seg-pad: 4px; --seg-item: 28px; --seg-px: 12px; --seg-fs: var(--fs-body, 13px); }
}
/* Fill: equal columns – across the given width, or, given none, each as wide as the longest label */
.ui-seg[data-fill], .ui-seg[data-fill] .ui-seg__copy { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; }
.ui-seg[data-fill] { width: 100%; }
.ui-seg:has(:focus-visible) { outline: 1px solid var(--focus-ring); outline-offset: 2px; }
.ui-seg__item {
  all: unset; corner-shape: inherit;
  box-sizing: border-box;
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: var(--seg-item);
  padding: 0 var(--seg-px);
  border-radius: var(--seg-r);
  color: var(--fluid-muted);
  font-size: var(--seg-fs);
  line-height: 1;
  font-variation-settings: "wght" 400, "opsz" 14;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--motion-fast, 100ms) ease-out;
}
.ui-seg > .ui-seg__item:hover { color: var(--fluid-foreground); }
.ui-seg__label { display: grid; min-width: 0; }
.ui-seg__label > span, .ui-seg__label::after { grid-area: 1 / 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-seg__label::after { content: attr(data-text); height: 0; font-variation-settings: "wght" 550, "opsz" 18; visibility: hidden; }
/* The pill and, over it, a copy of the row in the selected style, clipped to the pill */
.ui-seg__overlay { position: absolute; inset: 0; visibility: hidden; pointer-events: none; }
.ui-seg__pill { position: absolute; border-radius: var(--seg-r); background: var(--pill-surface); box-shadow: var(--shadow-3); }
.ui-seg__copy { position: absolute; inset: 0; display: flex; padding: var(--seg-pad); color: var(--fluid-foreground); }
.ui-seg__copy > .ui-seg__item { color: inherit; font-variation-settings: "wght" 550, "opsz" 18; cursor: default; }
`;

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
