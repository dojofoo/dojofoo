import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Reorder, motion, useDragControls, type Variants } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

export type ReorderListItem = { id: string; label: string; meta?: string };

// No bounce: rows that overshoot their slot would read as the wrong order.
const SLIDE = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Lifting is a touch slower than setting down, so the drop feels decisive.
const LIFT = { type: "spring", duration: 0.25, bounce: 0 } as const;
const SETTLE = { type: "spring", duration: 0.2, bounce: 0 } as const;
// Enough to read as picked up without the row outgrowing the column.
const LIFT_SCALE = 1.02;
// Critically damped (damping = 2 * sqrt(stiffness)): the released row glides
// home carrying its release velocity and stops dead in its slot.
const HOME = { bounceStiffness: 500, bounceDamping: 45 };
// Effectively instant, for reduced motion.
const SNAP = { bounceStiffness: 1e6, bounceDamping: 1e7 };
// A little give past the ends of the list, never enough to grow the page.
const EDGE_GIVE = 0.08;
// Layered and transparent so it darkens whatever is underneath. The 1px ring
// keeps the lifted edge visible in dark mode, where shadows barely show.
const LIFTED_SHADOW = [
  "0 0 0 1px light-dark(oklch(0 0 0 / 0.06), oklch(1 0 0 / 0.08))",
  "0 2px 4px light-dark(oklch(0 0 0 / 0.06), oklch(0 0 0 / 0.4))",
  "0 16px 32px -8px light-dark(oklch(0 0 0 / 0.18), oklch(0 0 0 / 0.7))",
].join(", ");

type Grab = { id: string; before: ReorderListItem[] };

/**
 * Drag a row by its handle, or from the keyboard: focus a handle, Space (or
 * Enter) picks the row up, arrows / Home / End move it, Space drops it and
 * Escape puts it back. Without a row held, the arrows move between handles.
 */
export function ReorderList({
  items,
  onReorder,
  label,
  className,
}: {
  items: ReorderListItem[];
  onReorder: (items: ReorderListItem[]) => void;
  label: string;
  className?: string;
}) {
  const reduceMotion = !!useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [grab, setGrab] = useState<Grab | null>(null);
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const instructions = useId();

  // For callbacks that fire after later renders than the one that made them.
  const latest = useRef({ items, grab });
  useEffect(() => {
    latest.current = { items, grab };
  });

  // React moves the held row's DOM node when the order changes, which can
  // drop focus. Put it back before paint so the next arrow press still lands.
  useLayoutEffect(() => {
    if (!grab) return;
    const handle = handles.current.get(grab.id);
    if (handle && document.activeElement !== handle) {
      handle.focus({ preventScroll: true });
    }
  }, [grab, items]);

  const name = (id: string, list = items) =>
    list.find((i) => i.id === id)?.label ?? "";
  const position = (id: string, list = items) =>
    `position ${list.findIndex((i) => i.id === id) + 1} of ${list.length}`;

  const pickUp = (id: string) => {
    setGrab({ id, before: items });
    setAnnouncement(`Picked up ${name(id)}, ${position(id)}.`);
  };

  const drop = () => {
    if (!grab) return;
    setGrab(null);
    setAnnouncement(`Dropped ${name(grab.id)} at ${position(grab.id)}.`);
  };

  const cancel = () => {
    if (!grab) return;
    onReorder(grab.before);
    setGrab(null);
    setAnnouncement(
      `Cancelled. ${name(grab.id)} returned to ${position(grab.id, grab.before)}.`,
    );
  };

  const moveTo = (id: string, to: number) => {
    const from = items.findIndex((i) => i.id === id);
    const target = Math.max(0, Math.min(to, items.length - 1));
    if (target === from) return;
    const next = [...items];
    next.splice(target, 0, ...next.splice(from, 1));
    onReorder(next);
    setAnnouncement(`Moved ${name(id)} to ${position(id, next)}.`);
  };

  const onKeyDown = (id: string, event: React.KeyboardEvent) => {
    const index = items.findIndex((i) => i.id === id);
    const held = grab?.id === id;
    const focus = (offset: number) =>
      handles.current.get(items[index + offset]?.id)?.focus();
    const keys: Record<string, (() => void) | undefined> = {
      " ": () => (held ? drop() : pickUp(id)),
      Enter: () => (held ? drop() : pickUp(id)),
      Escape: held ? cancel : undefined,
      ArrowUp: () => (held ? moveTo(id, index - 1) : focus(-1)),
      ArrowDown: () => (held ? moveTo(id, index + 1) : focus(1)),
      Home: held ? () => moveTo(id, 0) : undefined,
      End: held ? () => moveTo(id, items.length - 1) : undefined,
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  };

  // Tabbing or clicking away sets the row down where it is. Checked a frame
  // later, because a reorder can blur the handle for a moment before the
  // layout effect above refocuses it.
  const onBlur = (id: string) => {
    requestAnimationFrame(() => {
      const { grab: current, items: list } = latest.current;
      if (current?.id !== id) return;
      if (document.activeElement === handles.current.get(id)) return;
      setGrab(null);
      setAnnouncement(`Dropped ${name(id, list)} at ${position(id, list)}.`);
    });
  };

  return (
    <div className={cn("w-[400px] max-w-full", className)}>
      <Reorder.Group
        ref={listRef}
        axis="y"
        values={items}
        onReorder={onReorder}
        aria-label={label}
        className={cn(
          "flex flex-col gap-3",
          // Keeps a fast drag from painting a selection across the list.
          dragging && "cursor-grabbing select-none",
        )}
      >
        {items.map((item) => (
          <Row
            key={item.id}
            item={item}
            lifted={grab?.id === item.id}
            reduceMotion={reduceMotion}
            constraints={listRef}
            describedBy={instructions}
            handleRef={(node) => {
              if (node) handles.current.set(item.id, node);
              else handles.current.delete(item.id);
            }}
            onKeyDown={(e) => onKeyDown(item.id, e)}
            onBlur={() => onBlur(item.id)}
            onDragStart={() => {
              drop();
              setDragging(true);
            }}
            onDragEnd={() => {
              setDragging(false);
              const { items: list } = latest.current;
              setAnnouncement(
                `Dropped ${name(item.id, list)} at ${position(item.id, list)}.`,
              );
            }}
          />
        ))}
      </Reorder.Group>

      <p id={instructions} className="sr-only">
        Press Space to pick up. While holding, use the arrow keys to move,
        Space to drop, or Escape to cancel.
      </p>
      <p className="sr-only" aria-live="assertive" aria-atomic>
        {announcement}
      </p>
    </div>
  );
}

function Row({
  item,
  lifted,
  reduceMotion,
  constraints,
  describedBy,
  handleRef,
  onKeyDown,
  onBlur,
  onDragStart,
  onDragEnd,
}: {
  item: ReorderListItem;
  lifted: boolean;
  reduceMotion: boolean;
  constraints: React.RefObject<HTMLUListElement | null>;
  describedBy: string;
  handleRef: (node: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onBlur: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();

  // Scale goes through Motion alongside the x/y that Reorder drives, so they
  // compose into one transform. A CSS scale class here would fight them.
  const row: Variants = {
    rest: { scale: 1, transition: SETTLE },
    lifted: { scale: reduceMotion ? 1 : LIFT_SCALE, transition: LIFT },
  };
  // The shadow fades on its own layer: opacity is cheap to animate, and the
  // shadow can use light-dark(), which Motion can't interpolate.
  const shadow: Variants = {
    rest: { opacity: 0, transition: SETTLE },
    lifted: { opacity: 1, transition: LIFT },
  };

  return (
    <Reorder.Item
      value={item}
      // Rows never change size, so only position is projected and the text
      // inside can't stretch mid-slide.
      layout="position"
      dragListener={false}
      dragControls={controls}
      dragConstraints={constraints}
      dragElastic={EDGE_GIVE}
      dragTransition={reduceMotion ? SNAP : HOME}
      transition={{ layout: reduceMotion ? { duration: 0 } : SLIDE }}
      initial={false}
      animate={lifted ? "lifted" : "rest"}
      whileDrag="lifted"
      variants={row}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "relative flex items-center gap-3 rounded-[16px] bg-muted p-1.5 pr-4",
        // Reorder only raises a row while it's pointer-dragged, so a row
        // moved from the keyboard needs this to slide over its neighbours.
        lifted && "z-10!",
      )}
    >
      <motion.span
        aria-hidden
        variants={shadow}
        style={{ boxShadow: LIFTED_SHADOW }}
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
      />
      {/* 6px row padding around 10px corners keeps the radii concentric: 16 = 10 + 6,
          and the 40px handle plus that padding makes a 52px row.
          No press scale: pressing lifts the whole row, which is the feedback. */}
      <button
        ref={handleRef}
        type="button"
        aria-label={`Reorder ${item.label}`}
        aria-describedby={describedBy}
        onPointerDown={(e) => {
          // Stops the press from starting a text selection or moving focus.
          e.preventDefault();
          controls.start(e);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={cn(
          "relative flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-[10px] text-muted-foreground outline-hidden transition-[color,background-color] duration-150 ease-out select-none hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:cursor-grabbing",
          lifted && "bg-foreground/5 text-foreground",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className="size-5"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="6" cy="4" r="1.25" />
          <circle cx="10" cy="4" r="1.25" />
          <circle cx="6" cy="8" r="1.25" />
          <circle cx="10" cy="8" r="1.25" />
          <circle cx="6" cy="12" r="1.25" />
          <circle cx="10" cy="12" r="1.25" />
        </svg>
      </button>
      <span className="relative min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
        {item.label}
      </span>
      {item.meta && (
        <span className="relative shrink-0 text-[13px] text-muted-foreground tabular-nums">
          {item.meta}
        </span>
      )}
    </Reorder.Item>
  );
}

const TRACKS: ReorderListItem[] = [
  { id: "a", label: "Nuvole bianche", meta: "5:57" },
  { id: "b", label: "Holocene", meta: "5:37" },
  { id: "c", label: "Retrograde", meta: "3:43" },
  { id: "d", label: "Weightless", meta: "8:09" },
  { id: "e", label: "Svefn-g-englar", meta: "10:04" },
];

export default function ReorderListDemo() {
  const [tracks, setTracks] = useState(TRACKS);
  return <ReorderList items={tracks} onReorder={setTracks} label="Playlist" />;
}
