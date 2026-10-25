import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
// The iOS drawer curve for the height: quick to start, long soft settle, so
// the page below glides rather than lurches.
const DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";

export function AnnouncementBanner({
  open,
  onDismiss,
  icon,
  link,
  label = "Announcement",
  className,
  children,
}: {
  open: boolean;
  onDismiss: () => void;
  icon?: React.ReactNode;
  link?: { href: string; label: string };
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  // The very first appearance slides down from above; later ones (after a
  // dismiss) reverse the dismissal instead: open the space, then fade in.
  const [shown, setShown] = useState(open);
  const [firstShow, setFirstShow] = useState(true);
  if (open !== shown) {
    setShown(open);
    if (!open) setFirstShow(false);
  }

  const rows = reduceMotion
    ? "none"
    : open
      ? `grid-template-rows 280ms ${DRAWER}`
      : // Waits for the content to mostly fade, so the text never gets
        // squeezed while it's still readable.
        `grid-template-rows 240ms ${DRAWER} 80ms`;

  const content = open
    ? reduceMotion
      ? `opacity 200ms ${EASE}`
      : firstShow
        ? `translate 280ms ${DRAWER}, opacity 200ms ${EASE}, filter 200ms ${EASE}`
        : // Starts once the space has mostly opened.
          `opacity 200ms ${EASE} 120ms, filter 200ms ${EASE} 120ms`
    : `opacity 120ms ${EASE}, filter 120ms ${EASE}`;

  return (
    <div
      className="grid"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: rows }}
    >
      <div className="min-h-0 overflow-hidden">
        <section
          aria-label={label}
          inert={!open}
          tabIndex={-1}
          className={cn(
            "flex h-11 items-center gap-2.5 bg-foreground pr-1.5 pl-4 text-sm text-background outline-hidden",
            className,
          )}
          style={{
            opacity: open ? 1 : 0,
            filter: open || reduceMotion ? "blur(0px)" : "blur(2px)",
            translate:
              !open && firstShow && !reduceMotion ? "0 -100%" : "0 0",
            transition: content,
          }}
        >
          {icon && (
            <span aria-hidden className="flex shrink-0">
              {icon}
            </span>
          )}
          <p className="min-w-0 truncate">{children}</p>
          {link && (
            <a
              href={link.href}
              className="shrink-0 rounded-sm font-medium underline decoration-background/40 underline-offset-[3px] outline-hidden transition-[text-decoration-color] duration-150 ease-out hover:decoration-background focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-background"
            >
              {link.label}
            </a>
          )}
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={onDismiss}
            className={cn(
              "relative ml-auto flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-background/70 outline-hidden transition-[scale,color,background-color] duration-150 ease-out select-none hover:bg-background/15 hover:text-background focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-background active:scale-[0.96] motion-reduce:transition-[color,background-color]",
              // Grows the hit area to 40px without growing the circle.
              "after:absolute after:-inset-1 after:rounded-full",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
            </svg>
          </button>
        </section>
      </div>
    </div>
  );
}

const STORAGE_KEY = "ui-lab:announcement-dismissed";

function readDismissed() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(dismissed: boolean) {
  try {
    if (dismissed) sessionStorage.setItem(STORAGE_KEY, "1");
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows can refuse storage; the banner just won't remember.
  }
}

export default function AnnouncementBannerDemo() {
  const frameRef = useRef<HTMLDivElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  // Unknown (null) on the server and the first client render, then decided,
  // so the entrance plays and a remembered dismissal never mismatches
  // hydration. While unknown, neither the banner nor "Show again" shows.
  const [open, setOpen] = useState<boolean | null>(null);
  // Focus can only move once the target has lost its inert attribute.
  const pendingFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    pendingFocus.current?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [open]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = frameRef.current;
      if (!el) return;
      // Reading layout commits the closed state first, so the opening is a
      // real transition even when this mounts without a server render.
      void el.offsetHeight;
      // The index preview always shows it; a dismissal there couldn't be undone.
      setOpen(el.closest("[inert]") !== null || !readDismissed());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const dismiss = () => {
    const hadFocus = frameRef.current
      ?.querySelector("section")
      ?.contains(document.activeElement);
    setOpen(false);
    writeDismissed(true);
    // The dismiss button is going away; hand focus to the one way back.
    if (hadFocus) pendingFocus.current = againRef.current;
  };

  const restore = () => {
    setOpen(true);
    writeDismissed(false);
    pendingFocus.current = frameRef.current?.querySelector("section") ?? null;
  };

  return (
    <div
      ref={frameRef}
      className="relative h-[300px] w-[min(520px,100%)] overflow-hidden rounded-2xl bg-background shadow-raised"
    >
      <AnnouncementBanner
        open={open === true}
        onDismiss={dismiss}
        link={{ href: "#changelog", label: "See what changed" }}
        icon={
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
          >
            <path d="M9 1.75 3.5 9h4l-.75 5.25L12.5 7h-4L9 1.75Z" />
          </svg>
        }
      >
        Deploys now build twice as fast.
      </AnnouncementBanner>

      {/* In normal flow under the banner, so it rides the same height
          transition up and down with no animation of its own. */}
      <div className="flex h-12 items-center gap-5 border-b border-border px-5 text-sm">
        <span className="font-semibold text-foreground">Northwind</span>
        <span className="text-foreground">Overview</span>
        <span className="hidden text-muted-foreground sm:inline">Deployments</span>
        <span className="text-muted-foreground">Settings</span>
        <span aria-hidden className="ml-auto size-7 rounded-full bg-muted" />
      </div>
      <div className="px-5 pt-5">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          Overview
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Three deploys today, all healthy.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Requests", "1.2M"],
            ["Latency", "84 ms"],
            ["Errors", "0.02%"],
          ].map(([name, value]) => (
            <div key={name} className="rounded-xl bg-muted px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{name}</p>
              <p className="mt-0.5 text-[15px] font-medium text-foreground tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Pinned to the frame rather than the page flow, so it stays exactly
          under the cursor while the banner reopens and pushes content down.
          Arrives after the banner has closed, leaves at once. */}
      <button
        ref={againRef}
        type="button"
        onClick={restore}
        inert={open !== false}
        className={cn(
          "absolute right-3 bottom-3 flex h-9 touch-manipulation items-center rounded-full bg-muted px-3.5 text-sm font-medium text-foreground shadow-raised outline-hidden transition-[opacity,filter,translate,scale] ease-[cubic-bezier(0.23,1,0.32,1)] select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-[opacity]",
          open !== false
            ? "translate-y-1 opacity-0 blur-[2px] duration-100 motion-reduce:translate-y-0 motion-reduce:blur-[0px]"
            : "translate-y-0 opacity-100 blur-[0px] delay-200 duration-200",
        )}
      >
        Show again
      </button>
    </div>
  );
}
