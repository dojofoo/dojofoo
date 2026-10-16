import { useEffect, useId, useRef, useState } from "react";
import { animate, motion, useMotionTemplate, useMotionValue } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

export type SortableGridItem = { id: string; label: string; icon: React.ReactNode };

const COLS = 3;
// Positions are in percent of a tile's own size, so the grid needs no
// measuring to render: the gap is 10% of a tile, one slot is 110%.
const PITCH = 110;
const TILE_WIDTH = `${100 / (COLS + (COLS - 1) * (PITCH / 100 - 1))}%`;
// Mouse drags start after a small move, so a sloppy click stays a click.
const MOUSE_THRESHOLD = 4;
// Touch waits for a hold instead, leaving quick swipes to scroll the page.
const LONG_PRESS = 250;
// A finger that moves this far before the hold completes is scrolling.
const TOUCH_SLOP = 8;
// How far past the grid edge a tile can be pulled, in percent of a tile,
// before it stiffens. Small enough that it never widens the page.
const EDGE_GIVE = 8;
const LIFT_SCALE = 1.05;
// The lab-wide press scale, so a tap feels the same here as on any button.
const PRESS_SCALE = 0.96;
// No bounce anywhere: a tile that overshoots its slot reads as a wrong drop.
const SHIFT = { type: "spring", duration: 0.35, bounce: 0 } as const;
// Starts from the release velocity, so a flung tile glides home.
const DROP = { type: "spring", duration: 0.4, bounce: 0 } as const;
const LIFT = { type: "spring", duration: 0.25, bounce: 0 } as const;
const PRESS = { type: "spring", duration: 0.15, bounce: 0 } as const;
// Layered and transparent so it darkens whatever is underneath. The 1px ring
// keeps the lifted edge visible in dark mode, where shadows barely show.
const LIFTED_SHADOW = [
  "0 0 0 1px light-dark(oklch(0 0 0 / 0.06), oklch(1 0 0 / 0.1))",
  "0 4px 8px light-dark(oklch(0 0 0 / 0.06), oklch(0 0 0 / 0.4))",
  "0 20px 40px -12px light-dark(oklch(0 0 0 / 0.24), oklch(0 0 0 / 0.8))",
].join(", ");

const slot = (index: number) => ({
  x: (index % COLS) * PITCH,
  y: Math.floor(index / COLS) * PITCH,
});

// Gives freely at first, then stiffens so it never passes EDGE_GIVE.
function resist(value: number, max: number) {
  if (value < 0) return EDGE_GIVE * Math.tanh(value / (EDGE_GIVE * 3));
  if (value > max) return max + EDGE_GIVE * Math.tanh((value - max) / (EDGE_GIVE * 3));
  return value;
}

export function SortableGrid({
  items,
  onReorder,
  label,
  className,
}: {
  items: SortableGridItem[];
  onReorder: (items: SortableGridItem[]) => void;
  label: string;
  className?: string;
}) {
  const reduceMotion = !!useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [held, setHeld] = useState<{ id: string; before: SortableGridItem[] } | null>(
    null,
  );
  const [focusId, setFocusId] = useState(items[0]?.id);
  const [announcement, setAnnouncement] = useState("");
  const instructions = useId();
  const rows = Math.ceil(items.length / COLS);

  // Pointer handlers outlive the render that created them.
  const latest = useRef({ items, onReorder });
  const dragging = useRef(false);
  useEffect(() => {
    latest.current = { items, onReorder };
  });

  // Once a hold turns into a drag, the page must stop scrolling. Only a
  // non-passive native listener can cancel touchmove.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const block = (e: TouchEvent) => {
      if (dragging.current && e.cancelable) e.preventDefault();
    };
    grid.addEventListener("touchmove", block, { passive: false });
    return () => grid.removeEventListener("touchmove", block);
  }, []);

  const name = (id: string) => items.find((i) => i.id === id)?.label ?? "";
  const place = (index: number) =>
    `row ${Math.floor(index / COLS) + 1}, column ${(index % COLS) + 1}`;

  const moveTo = (id: string, target: number) => {
    const list = latest.current.items;
    const from = list.findIndex((i) => i.id === id);
    const to = Math.max(0, Math.min(target, list.length - 1));
    if (from === to || from < 0) return false;
    const next = [...list];
    next.splice(to, 0, ...next.splice(from, 1));
    // Kept current right away, so moves within one frame see the new order.
    latest.current.items = next;
    latest.current.onReorder(next);
    return true;
  };

  const pointer = {
    // One percent of a tile, in px, measured when a drag starts.
    unit: () => (gridRef.current?.offsetWidth ?? 0) / (100 * COLS + (PITCH - 100) * (COLS - 1)),
    lift: (id: string) => {
      dragging.current = true;
      setDragId(id);
    },
    move: (id: string, x: number, y: number) => {
      const col = Math.max(0, Math.min(Math.round(x / PITCH), COLS - 1));
      const row = Math.max(0, Math.min(Math.round(y / PITCH), rows - 1));
      moveTo(id, row * COLS + col);
    },
    drop: (id: string) => {
      dragging.current = false;
      setDragId(null);
      const index = latest.current.items.findIndex((i) => i.id === id);
      setAnnouncement(`Dropped ${name(id)} at ${place(index)}.`);
    },
    busy: () => dragging.current || held !== null,
  };

  const onKeyDown = (id: string, e: React.KeyboardEvent) => {
    const index = items.findIndex((i) => i.id === id);
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[
      e.key
    ];

    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (e.repeat || dragging.current) return;
      if (held?.id === id) {
        setHeld(null);
        setAnnouncement(`Dropped ${name(id)} at ${place(index)}.`);
      } else {
        setHeld({ id, before: items });
        setAnnouncement(
          `Picked up ${name(id)} at ${place(index)}. Arrow keys move it, Space drops it, Escape cancels.`,
        );
      }
      return;
    }
    if (e.key === "Escape" && held?.id === id) {
      e.preventDefault();
      onReorder(held.before);
      setHeld(null);
      const back = held.before.findIndex((i) => i.id === id);
      setAnnouncement(`Cancelled. ${name(id)} is back at ${place(back)}.`);
      return;
    }
    if (delta === undefined) return;
    e.preventDefault();
    const target = index + delta;
    // Up and down stop at the edges instead of wrapping to another column.
    if (target < 0 || target >= items.length) return;
    if (held?.id === id) {
      if (moveTo(id, target)) setAnnouncement(`Moved ${name(id)} to ${place(target)}.`);
    } else {
      const next = items[target].id;
      setFocusId(next);
      buttons.current.get(next)?.focus();
    }
  };

  return (
    <div
      className={cn(
        // 28 = 16 (tile radius) + 12 (padding): concentric corners.
        "w-[min(420px,100%)] rounded-[28px] bg-muted p-3 shadow-raised",
        className,
      )}
    >
      <div
        ref={gridRef}
        role="group"
        aria-label={label}
        aria-roledescription="sortable grid"
        className="relative"
        // Height follows width, so it never shifts while tiles move.
        style={{ aspectRatio: `${COLS * 100 + (COLS - 1) * (PITCH - 100)} / ${rows * 100 + (rows - 1) * (PITCH - 100)}` }}
      >
        {/* Rendered in a stable order and placed by transform, so reordering
            never moves DOM nodes out from under focus or a drag. */}
        {[...items]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((item) => {
            const index = items.indexOf(item);
            return (
              <Tile
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                lifted={dragId === item.id || held?.id === item.id}
                held={held?.id === item.id}
                focusable={focusId === item.id}
                reduceMotion={reduceMotion}
                describedBy={instructions}
                pointer={pointer}
                buttonRef={(el) => {
                  if (el) buttons.current.set(item.id, el);
                  else buttons.current.delete(item.id);
                }}
                onFocus={() => setFocusId(item.id)}
                onBlur={() => {
                  // Tabbing away while holding a tile drops it where it is.
                  if (held?.id === item.id) {
                    setHeld(null);
                    setAnnouncement(`Dropped ${item.label} at ${place(index)}.`);
                  }
                }}
                onKeyDown={(e) => onKeyDown(item.id, e)}
              />
            );
          })}
      </div>
      <p id={instructions} className="sr-only">
        Drag to reorder, or press Space to pick up, arrow keys to move, Space
        to drop and Escape to cancel.
      </p>
      <p className="sr-only" aria-live="assertive" aria-atomic>
        {announcement}
      </p>
    </div>
  );
}

type PointerApi = {
  unit: () => number;
  lift: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  drop: (id: string) => void;
  busy: () => boolean;
};

function Tile({
  item,
  index,
  total,
  lifted,
  held,
  focusable,
  reduceMotion,
  describedBy,
  pointer,
  buttonRef,
  onFocus,
  onBlur,
  onKeyDown,
}: {
  item: SortableGridItem;
  index: number;
  total: number;
  lifted: boolean;
  held: boolean;
  focusable: boolean;
  reduceMotion: boolean;
  describedBy: string;
  pointer: PointerApi;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const home = slot(index);
  const x = useMotionValue(home.x);
  const y = useMotionValue(home.y);
  const scale = useMotionValue(1);
  const zIndex = useMotionValue(0);
  const transform = useMotionTemplate`translate(${x}%, ${y}%) scale(${scale})`;
  const dragging = useRef(false);
  const state = useRef({ index, lifted, reduceMotion, pointer });
  const cleanup = useRef<() => void>(undefined);

  useEffect(() => {
    state.current = { index, lifted, reduceMotion, pointer };
  });

  useEffect(() => () => cleanup.current?.(), []);

  const settle = (velocity?: { x: number; y: number }) => {
    const target = slot(state.current.index);
    if (state.current.reduceMotion) {
      x.jump(target.x);
      y.jump(target.y);
      if (!state.current.lifted) zIndex.set(0);
      return;
    }
    const spring = velocity ? DROP : SHIFT;
    const flights = [
      animate(x, target.x, { ...spring, velocity: velocity?.x }),
      animate(y, target.y, { ...spring, velocity: velocity?.y }),
    ];
    // Stays above its neighbours until it has landed.
    Promise.all(flights).then(() => {
      if (!state.current.lifted && !dragging.current) zIndex.set(0);
    });
  };

  // Every tile but the one under the pointer glides to its new slot. The
  // keyboard-held tile moves the same way, so both paths look alike.
  useEffect(() => {
    if (!dragging.current) settle();
    // settle reads everything else from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Keyboard lift and drop. A pointer drop lowers the tile itself, once it
  // has landed (see settle), so it never slips under a neighbour mid-flight.
  useEffect(() => {
    const keyboardDrop = !lifted && zIndex.get() === 2;
    if (lifted) zIndex.set(2);
    if (reduceMotion) {
      scale.jump(1);
      if (keyboardDrop) zIndex.set(0);
      return;
    }
    if (dragging.current) return;
    const lift = animate(scale, lifted ? LIFT_SCALE : 1, LIFT);
    if (keyboardDrop) {
      zIndex.set(1);
      lift.then(() => {
        if (!state.current.lifted) zIndex.set(0);
      });
    }
  }, [lifted, reduceMotion, scale, zIndex]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !e.isPrimary || state.current.pointer.busy()) return;
    const touch = e.pointerType === "touch";
    const start = { x: e.clientX, y: e.clientY };
    const origin = { x: x.get(), y: y.get() };
    const id = item.id;
    const max = { x: (COLS - 1) * PITCH, y: (Math.ceil(total / COLS) - 1) * PITCH };
    let unit = 1;
    let last = start;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (!state.current.reduceMotion) animate(scale, PRESS_SCALE, PRESS);

    const follow = () => {
      const nx = resist(origin.x + (last.x - start.x) / unit, max.x);
      const ny = resist(origin.y + (last.y - start.y) / unit, max.y);
      x.set(nx);
      y.set(ny);
      state.current.pointer.move(id, nx, ny);
    };

    const begin = () => {
      dragging.current = true;
      unit = state.current.pointer.unit() || 1;
      zIndex.set(2);
      state.current.pointer.lift(id);
      if (touch) navigator.vibrate?.(8);
      if (state.current.reduceMotion) scale.jump(1);
      else animate(scale, LIFT_SCALE, LIFT);
      follow();
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      last = { x: ev.clientX, y: ev.clientY };
      if (dragging.current) {
        follow();
        return;
      }
      const moved = Math.hypot(last.x - start.x, last.y - start.y);
      if (touch && moved > TOUCH_SLOP) finish(false);
      else if (!touch && moved > MOUSE_THRESHOLD) begin();
    };

    const finish = (drop: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cleanup.current = undefined;
      const wasDragging = dragging.current;
      dragging.current = false;
      if (!state.current.reduceMotion) animate(scale, 1, wasDragging ? LIFT : PRESS);
      if (!wasDragging) return;
      zIndex.set(1);
      // Keep the hand's speed, so a flick carries into the landing.
      settle(drop ? { x: x.getVelocity(), y: y.getVelocity() } : { x: 0, y: 0 });
      state.current.pointer.drop(id);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) finish(true);
    };

    // Listening on window, not with pointer capture, so the drag survives
    // anything React does to the DOM mid-gesture.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    cleanup.current = () => finish(false);
    if (touch) timer = setTimeout(begin, LONG_PRESS);
  };

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      tabIndex={focusable ? 0 : -1}
      aria-label={`${item.label}, position ${index + 1} of ${total}`}
      aria-describedby={describedBy}
      aria-pressed={held}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{
        transform,
        zIndex,
        width: TILE_WIDTH,
        boxShadow: lifted ? LIFTED_SHADOW : "var(--shadow-raised)",
      }}
      className={cn(
        "absolute top-0 left-0 flex aspect-square origin-center touch-manipulation flex-col items-center justify-center gap-2.5 rounded-2xl bg-background text-foreground outline-hidden transition-[box-shadow] duration-200 ease-out select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
        lifted ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {item.icon}
      </svg>
      <span className="text-sm">{item.label}</span>
    </motion.button>
  );
}

const APPS: SortableGridItem[] = [
  {
    id: "a",
    label: "Mail",
    icon: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
  },
  {
    id: "b",
    label: "Calendar",
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    id: "c",
    label: "Photos",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="9" cy="9.5" r="1.5" />
        <path d="m4 17.5 4.5-4.5 3.5 3.5 2.5-2.5 5.5 5" />
      </>
    ),
  },
  {
    id: "d",
    label: "Notes",
    icon: (
      <>
        <path d="M6.5 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
        <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
      </>
    ),
  },
  {
    id: "e",
    label: "Music",
    icon: (
      <>
        <path d="M9.5 17.5v-11l9-2v11" />
        <circle cx="7.5" cy="17.5" r="2" />
        <circle cx="16.5" cy="15.5" r="2" />
      </>
    ),
  },
  {
    id: "f",
    label: "Maps",
    icon: (
      <>
        <path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2Z" />
        <path d="M9 4.5v13M15 6.5v13" />
      </>
    ),
  },
  {
    id: "g",
    label: "Weather",
    icon: (
      <>
        <path d="M7.5 18.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.5 3.25 3.25 0 0 1-.2 6.5Z" />
      </>
    ),
  },
  {
    id: "h",
    label: "Clock",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
  },
  {
    id: "i",
    label: "Files",
    icon: (
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    ),
  },
];

export default function SortableGridDemo() {
  const [apps, setApps] = useState(APPS);
  return <SortableGrid items={apps} onReorder={setApps} label="Apps" />;
}
