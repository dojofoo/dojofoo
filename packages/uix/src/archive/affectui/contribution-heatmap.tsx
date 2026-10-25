"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInView } from "motion/react";
import { cn } from "~/lib/utils";
import contributions from "~/lib/contributions.json";

// `level` (0 to 4) overrides the thresholds, for data that arrives already
// bucketed, like GitHub's own graph.
export type ContributionDay = { date: string; count: number; level?: number };

// GitHub's own proportions: 10px squares on a 13px pitch.
const CELL = 10;
const PITCH = 13;
// Per column, so the whole year sweeps in under half a second (53 x 8ms)
// and reads as one left-to-right gesture rather than 53 separate ones.
const STAGGER_MS = 8;
// One hue, light to dark: the foreground ink at rising opacity. Level 0
// stays faintly visible so empty days still read as part of the grid.
const LEVELS = [
  "bg-foreground/[0.07]",
  "bg-foreground/25",
  "bg-foreground/45",
  "bg-foreground/70",
  "bg-foreground",
];
// Lower bounds for levels 1 to 4.
const THRESHOLDS = [1, 4, 7, 10];
const EASE_OUT = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const longDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const monthName = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const number = new Intl.NumberFormat("en-US");

function phrase(count: number) {
  if (count === 0) return "No contributions";
  return `${number.format(count)} contribution${count === 1 ? "" : "s"}`;
}

function levelOf(count: number, thresholds: number[]) {
  let level = 0;
  for (const t of thresholds) if (count >= t) level++;
  return level;
}

/**
 * `data` runs oldest to newest and starts on a Sunday, one entry per day,
 * so each column is one week.
 */
export function ContributionHeatmap({
  data,
  thresholds = THRESHOLDS,
  className,
}: {
  data: ContributionDay[];
  thresholds?: number[];
  className?: string;
}) {
  const weeks = Math.ceil(data.length / 7);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipText = useRef<HTMLSpanElement>(null);
  const inView = useInView(gridRef, { once: true, amount: 0.4 });
  // Roving tabindex: the grid is one tab stop, arrows move within it.
  const [focusIndex, setFocusIndex] = useState(data.length - 1);

  const cells = useMemo(
    () =>
      data.map((d) => {
        const date = new Date(`${d.date}T00:00:00Z`);
        return {
          level: d.level ?? levelOf(d.count, thresholds),
          tip: `${phrase(d.count)} on ${shortDate.format(date)}`,
          label: `${phrase(d.count)} on ${longDate.format(date)}`,
          date,
        };
      }),
    [data, thresholds],
  );

  // A month is labelled at the column holding its 1st. Labels closer than
  // 3 columns would collide, so the earlier one gives way.
  const months = useMemo(() => {
    const out: { col: number; name: string }[] = [];
    cells.forEach((cell, i) => {
      if (cell.date.getUTCDate() !== 1) return;
      const col = Math.floor(i / 7);
      if (out.length && col - out[out.length - 1].col < 3) out.pop();
      out.push({ col, name: monthName.format(cell.date) });
    });
    return out;
  }, [cells]);

  // On a narrow screen, open on the most recent weeks, the part people
  // actually look at.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // The tooltip is moved and rewritten directly, so sweeping across 371
  // cells never re-renders them. It jumps with no transition: a tooltip
  // that glides between cells lags behind the pointer.
  const show = (el: HTMLElement) => {
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    const text = tipText.current;
    const cell = cells[Number(el.dataset.i)];
    if (!wrap || !tip || !text || !cell) return;
    text.textContent = cell.tip;
    const box = wrap.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    // Undo any scale an ancestor applies, like the index preview does.
    const scale = wrap.offsetWidth / box.width || 1;
    const width = tip.offsetWidth;
    const centre = (rect.left - box.left + rect.width / 2) * scale;
    // Clamped inside the chart so it never widens the page at the edges.
    const x = Math.min(Math.max(centre - width / 2, 0), wrap.offsetWidth - width);
    const y = (rect.top - box.top) * scale - tip.offsetHeight - 6;
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.dataset.show = "true";
  };
  const hide = () => {
    if (tipRef.current) tipRef.current.dataset.show = "false";
  };

  const cellFrom = (target: EventTarget) =>
    (target as HTMLElement).closest<HTMLElement>("[data-i]");

  const move = (next: number) => {
    const i = Math.min(Math.max(next, 0), data.length - 1);
    setFocusIndex(i);
    gridRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.focus();
  };

  return (
    <div
      ref={wrapRef}
      // Sized to its content rather than a fixed width, so it only scrolls
      // when the screen is genuinely too narrow for the year.
      className={cn("relative flex w-fit max-w-full text-xs text-muted-foreground", className)}
    >
      {/* Stays put while the weeks scroll, so rows keep their names. */}
      <div aria-hidden className="mt-[23px] mr-[5px] flex shrink-0 flex-col">
        {["", "Mon", "", "Wed", "", "Fri", ""].map((day, i) => (
          <span key={i} style={{ height: PITCH, lineHeight: `${CELL}px` }}>
            {day}
          </span>
        ))}
      </div>

      <div
        ref={scrollRef}
        // 3px of room on every side, so focus and hover rings aren't clipped
        // by the scroll container.
        className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain p-[3px]"
        onScroll={hide}
      >
        <div style={{ width: weeks * PITCH - (PITCH - CELL) }}>
          <div aria-hidden className="relative h-5">
            {months.map((m) => (
              <span
                key={m.col}
                className="absolute top-0 leading-none"
                style={{ left: m.col * PITCH }}
              >
                {m.name}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={`Contributions over the last ${weeks} weeks`}
            aria-readonly
            data-shown={inView}
            className="group flex flex-col"
            style={{ gap: PITCH - CELL }}
            onPointerOver={(e) => {
              if (e.pointerType === "touch") return;
              const el = cellFrom(e.target);
              if (el) show(el);
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") return;
              const el = cellFrom(e.target);
              if (el) show(el);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== "touch") hide();
            }}
            onFocus={(e) => {
              const el = cellFrom(e.target);
              if (!el) return;
              setFocusIndex(Number(el.dataset.i));
              show(el);
            }}
            onBlur={(e) => {
              if (!gridRef.current?.contains(e.relatedTarget as Node)) hide();
            }}
            onKeyDown={(e) => {
              const el = cellFrom(e.target);
              if (!el) return;
              if (e.key === "Escape") return hide();
              const i = Number(el.dataset.i);
              const day = i % 7;
              const next = {
                ArrowUp: day > 0 ? i - 1 : i,
                ArrowDown: day < 6 ? i + 1 : i,
                ArrowLeft: i - 7,
                ArrowRight: i + 7,
                Home: day,
                End: (weeks - 1) * 7 + day,
              }[e.key];
              if (next === undefined) return;
              e.preventDefault();
              move(next);
            }}
          >
            {Array.from({ length: 7 }, (_, day) => (
              <div key={day} role="row" className="flex" style={{ gap: PITCH - CELL }}>
                {Array.from({ length: weeks }, (_, week) => {
                  const i = week * 7 + day;
                  const cell = cells[i];
                  if (!cell) return <div key={week} role="presentation" style={{ width: CELL }} />;
                  return (
                    <Cell
                      key={week}
                      index={i}
                      column={week}
                      level={cell.level}
                      label={cell.label}
                      focusable={i === focusIndex}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Appears in 100ms and leaves in 75ms, so it never lingers. */}
      <div
        ref={tipRef}
        aria-hidden
        data-show="false"
        className="pointer-events-none absolute top-0 left-0 z-10 opacity-0 transition-opacity duration-75 ease-out data-[show=true]:opacity-100 data-[show=true]:duration-100"
      >
        <span
          ref={tipText}
          className="block rounded-md bg-foreground px-2 py-1 text-[13px] font-medium whitespace-nowrap text-background"
        />
      </div>
    </div>
  );
}

// Memoised so moving focus re-renders only the two cells whose tabindex
// changed, not all 371.
const Cell = memo(function Cell({
  index,
  column,
  level,
  label,
  focusable,
}: {
  index: number;
  column: number;
  level: number;
  label: string;
  focusable: boolean;
}) {
  return (
    <div
      role="gridcell"
      data-i={index}
      tabIndex={focusable ? 0 : -1}
      aria-label={label}
      className={cn(
        "shrink-0 rounded-[2px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground",
        // Rings the hovered day outside itself, so it shows on the darkest
        // level too.
        "hover:outline-1 hover:outline-offset-1 hover:outline-foreground/50",
        // Settles from 0.6, not 0: a square growing from nothing reads as a
        // pop, one settling from slightly small reads as arriving.
        "scale-[0.6] opacity-0 transition-[opacity,scale] duration-300 group-data-[shown=true]:scale-100 group-data-[shown=true]:opacity-100",
        "motion-reduce:scale-100 motion-reduce:transition-none",
        EASE_OUT,
        LEVELS[level],
      )}
      style={{ width: CELL, height: CELL, transitionDelay: `${column * STAGGER_MS}ms` }}
    />
  );
});

export function HeatmapLegend({ className }: { className?: string }) {
  return (
    // Hidden from screen readers: every cell already names its own count.
    <div aria-hidden className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <span className="mr-1">Less</span>
      {LEVELS.map((l) => (
        <span
          key={l}
          aria-hidden
          className={cn("rounded-[2px]", l)}
          style={{ width: CELL, height: CELL }}
        />
      ))}
      <span className="ml-1">More</span>
    </div>
  );
}

// Yash's real year, refreshed from his public GitHub graph on every build
// by scripts/fetch-contributions.ts.
const YEAR: ContributionDay[] = contributions.days;
const TOTAL = YEAR.reduce((sum, d) => sum + d.count, 0);

export default function ContributionHeatmapDemo() {
  return (
    <div className="flex w-fit max-w-full flex-col gap-4">
      <p className="text-[15px] text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{number.format(TOTAL)}</span>{" "}
        contributions in the last year by{" "}
        <a
          href={`https://github.com/${contributions.user}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm font-medium text-foreground underline decoration-foreground/25 underline-offset-2 outline-hidden transition-[text-decoration-color] duration-150 ease-out hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          @{contributions.user}
        </a>
      </p>
      <ContributionHeatmap data={YEAR} />
      <HeatmapLegend className="self-end" />
    </div>
  );
}
