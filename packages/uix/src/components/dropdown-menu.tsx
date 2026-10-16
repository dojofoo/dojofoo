import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

export type DropdownItem =
  | {
      type?: "item";
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      destructive?: boolean;
    }
  | { type: "separator" };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Enters over 180ms; leaves in 100ms with a smaller scale change, so closing
// never holds the eye.
const ENTER = { duration: 0.18, ease: EASE_OUT };
const EXIT = { duration: 0.1, ease: EASE_OUT };
// Letters typed within this window extend the search instead of restarting.
const TYPEAHEAD_RESET = 500;

type FocusTarget = "first" | "last" | "menu";

export function DropdownMenu({
  label,
  items,
  align = "start",
  onSelect,
  className,
}: {
  label: string;
  items: DropdownItem[];
  align?: "start" | "end";
  onSelect?: (label: string) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const triggerId = `${id}-trigger`;
  const menuId = `${id}-menu`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const focusTarget = useRef<FocusTarget>("menu");
  const lastPointerType = useRef("");
  // True while the press that opened the menu is still held, so releasing
  // it over an item selects that item, like a native menu.
  const pressFromTrigger = useRef(false);
  const typeahead = useRef({ query: "", timer: 0 });

  const actionable = items.flatMap((item, i) =>
    item.type === "separator" ? [] : [i],
  );

  const focusItem = (index: number) => {
    itemRefs.current[index]?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const target = focusTarget.current;
    if (target === "first") focusItem(actionable[0]);
    else if (target === "last") focusItem(actionable[actionable.length - 1]);
    else menuRef.current?.focus({ preventScroll: true });
    // Only when the menu opens; the item list is static while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const state = typeahead.current;
    return () => clearTimeout(state.timer);
  }, []);

  const openMenu = (target: FocusTarget) => {
    focusTarget.current = target;
    setActive(-1);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const select = (index: number) => {
    const item = items[index];
    if (!item || item.type === "separator") return;
    onSelect?.(item.label);
    close(true);
  };

  const move = (step: number) => {
    const at = actionable.indexOf(active);
    const from = at === -1 ? (step > 0 ? -1 : 0) : at;
    const next = (from + step + actionable.length) % actionable.length;
    focusItem(actionable[next]);
  };

  const search = (char: string) => {
    const state = typeahead.current;
    clearTimeout(state.timer);
    state.query += char.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.query = "";
    }, TYPEAHEAD_RESET);

    // Pressing the same letter repeatedly cycles through its matches.
    const repeated = [...state.query].every((c) => c === state.query[0]);
    const query = repeated ? state.query[0] : state.query;
    const at = actionable.indexOf(active);
    const start = repeated ? at + 1 : Math.max(at, 0);
    for (let n = 0; n < actionable.length; n++) {
      const index = actionable[(start + n) % actionable.length];
      const item = items[index];
      if (
        item.type !== "separator" &&
        item.label.toLowerCase().startsWith(query)
      ) {
        focusItem(index);
        return;
      }
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        return;
      case "Home":
        e.preventDefault();
        focusItem(actionable[0]);
        return;
      case "End":
        e.preventDefault();
        focusItem(actionable[actionable.length - 1]);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (active !== -1) select(active);
        return;
      case "Escape":
        e.preventDefault();
        close(true);
        return;
      case "Tab":
        // Focus moves on to the next control as usual; the menu just gets
        // out of the way.
        close(false);
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      search(e.key);
    }
  };

  // Both states pass the same keys, so Motion never keeps a stale transform.
  const hidden = { opacity: 0, transform: reduceMotion ? "scale(1)" : "scale(0.95)" };
  const leaving = {
    opacity: 0,
    transform: reduceMotion ? "scale(1)" : "scale(0.97)",
    transition: EXIT,
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onPointerDown={(e) => {
          lastPointerType.current = e.pointerType;
          // Touch opens on click instead, so a scroll that starts on the
          // trigger doesn't pop the menu.
          if (e.pointerType !== "mouse" || e.button !== 0 || e.ctrlKey) return;
          if (open) {
            close(false);
            return;
          }
          // Keeps focus off the trigger; the menu takes it on open.
          e.preventDefault();
          pressFromTrigger.current = true;
          const release = () => {
            pressFromTrigger.current = false;
          };
          // Window listeners run after React's, so an item's pointerup still
          // sees the flag set.
          window.addEventListener("pointerup", release, { once: true });
          window.addEventListener("pointercancel", release, { once: true });
          openMenu("menu");
        }}
        onClick={() => {
          const pointer = lastPointerType.current;
          lastPointerType.current = "";
          // Mouse presses were handled on pointerdown. This covers touch and
          // assistive tech, which can click without any keydown.
          if (pointer === "mouse") return;
          if (open) close(false);
          else openMenu(pointer ? "menu" : "first");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            openMenu("first");
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openMenu("last");
          }
        }}
        className="flex h-9 touch-manipulation items-center gap-1.5 rounded-lg bg-muted pr-2.5 pl-3.5 text-sm font-medium text-foreground shadow-raised outline-hidden transition-[scale] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none"
      >
        {label}
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={cn(
            "size-4 text-muted-foreground transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <Panel
            ref={menuRef}
            id={menuId}
            labelledBy={triggerId}
            align={align}
            initial={hidden}
            exit={leaving}
            onKeyDown={onMenuKeyDown}
            onPointerLeave={(e) => {
              if (e.pointerType === "touch" || active === -1) return;
              // Parks focus on the menu so the highlight clears but arrow
              // keys keep working.
              menuRef.current?.focus({ preventScroll: true });
              setActive(-1);
            }}
            onBlur={(e) => {
              // Covers clicking outside, tabbing away and leaving the window.
              if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
                close(false);
              }
            }}
          >
            {items.map((item, i) => {
              if (item.type === "separator") {
                return (
                  <div
                    key={`separator-${i}`}
                    role="separator"
                    className="-mx-1 my-1 h-px bg-border"
                  />
                );
              }
              const highlighted = active === i;
              return (
                <div
                  key={item.label}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  onFocus={() => setActive(i)}
                  onPointerMove={(e) => {
                    if (e.pointerType === "touch" || highlighted) return;
                    focusItem(i);
                  }}
                  onPointerUp={() => {
                    if (pressFromTrigger.current) select(i);
                  }}
                  onClick={() => select(i)}
                  // No transition on the highlight: it moves on every hover,
                  // so any easing reads as lag.
                  className={cn(
                    "flex h-8 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm outline-hidden select-none",
                    item.destructive ? "text-destructive" : "text-foreground",
                    highlighted &&
                      (item.destructive ? "bg-destructive/10" : "bg-foreground/[0.06]"),
                  )}
                >
                  {item.icon && (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        !item.destructive && !highlighted && "text-muted-foreground",
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {item.icon}
                    </svg>
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.shortcut && (
                    <kbd
                      className={cn(
                        "font-sans text-xs tracking-wide",
                        item.destructive ? "text-destructive/70" : "text-muted-foreground",
                      )}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

function Panel({
  ref,
  id,
  labelledBy,
  align,
  initial,
  exit,
  onKeyDown,
  onPointerLeave,
  onBlur,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  id: string;
  labelledBy: string;
  align: "start" | "end";
  initial: { opacity: number; transform: string };
  exit: { opacity: number; transform: string; transition: typeof EXIT };
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onBlur: (e: React.FocusEvent) => void;
  children: React.ReactNode;
}) {
  // A closing menu stops taking pointer input at once, so it never blocks
  // the next click while it fades.
  const isPresent = useIsPresent();
  return (
    <motion.div
      ref={ref}
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      initial={initial}
      animate={{ opacity: 1, transform: "scale(1)" }}
      exit={exit}
      transition={ENTER}
      onKeyDown={onKeyDown}
      onPointerLeave={onPointerLeave}
      onBlur={onBlur}
      // Grows out of the trigger's corner, not its own center.
      style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
      // 12px radius around 4px padding keeps the 8px items concentric.
      className={cn(
        "absolute top-full z-50 mt-1.5 w-52 rounded-xl bg-muted p-1 shadow-raised outline-hidden",
        align === "end" ? "right-0" : "left-0",
        !isPresent && "pointer-events-none",
      )}
    >
      {children}
    </motion.div>
  );
}

const DEMO_ITEMS: DropdownItem[] = [
  {
    label: "Edit",
    icon: <path d="M10.25 3.25 12.75 5.75 6 12.5H3.5V10l6.75-6.75Z" />,
  },
  {
    label: "Duplicate",
    shortcut: "⌘D",
    icon: (
      <>
        <rect x="5.25" y="5.25" width="8" height="8" rx="1.75" />
        <path d="M10.75 5.25V4.5a1.75 1.75 0 0 0-1.75-1.75H4.5A1.75 1.75 0 0 0 2.75 4.5V9a1.75 1.75 0 0 0 1.75 1.75h.75" />
      </>
    ),
  },
  {
    label: "Rename",
    icon: (
      <path d="M2.75 5.75h6M2.75 10.25h4M11.75 3v10M10.25 3h3M10.25 13h3" />
    ),
  },
  {
    label: "Share",
    icon: (
      <path d="M8 2.75v7M5.25 5.5 8 2.75l2.75 2.75M3.75 8.75v3a1.5 1.5 0 0 0 1.5 1.5h5.5a1.5 1.5 0 0 0 1.5-1.5v-3" />
    ),
  },
  {
    label: "Archive",
    icon: (
      <path d="M2.75 3.25h10.5v2.5H2.75zM3.75 5.75v6a1.5 1.5 0 0 0 1.5 1.5h5.5a1.5 1.5 0 0 0 1.5-1.5v-6M6.5 8.25h3" />
    ),
  },
  { type: "separator" },
  {
    label: "Delete",
    shortcut: "⌘⌫",
    destructive: true,
    icon: (
      <path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4 4.25l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1M6.75 7v3.75M9.25 7v3.75" />
    ),
  },
];

export default function DropdownMenuDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every pick, so choosing the same item again still replays
  // the confirmation.
  const [pick, setPick] = useState(0);

  return (
    <div className="flex flex-col items-center gap-3">
      <DropdownMenu
        label="Options"
        items={DEMO_ITEMS}
        onSelect={(label) => {
          setSelected(label);
          setPick((n) => n + 1);
        }}
      />
      {/* Height reserved up front, so the confirmation never shifts the
          trigger above it. */}
      <p className="h-5 text-sm text-muted-foreground" aria-live="polite">
        {selected && (
          <motion.span
            key={pick}
            className="block"
            initial={{
              opacity: 0,
              filter: "blur(4px)",
              transform: "translateY(2px)",
            }}
            animate={{
              opacity: 1,
              filter: "blur(0px)",
              transform: "translateY(0px)",
            }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            Selected: <span className="text-foreground">{selected}</span>
          </motion.span>
        )}
      </p>
    </div>
  );
}
