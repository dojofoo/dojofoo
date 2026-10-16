import { useState, type KeyboardEvent, type PointerEvent } from "react";

/*
 * KPI Chart – a metric card with a multi-line chart and a hover tooltip, in a single self-contained file.
 * The styles are injected below, so no extra files are needed.
 */

export type KpiSeries = {
  label: string;
  /** Line color, any CSS color */
  color: string;
  /** One value per label, same length as `labels` */
  values: number[];
};

export type KpiChartProps = {
  title: string;
  /** Headline value, already formatted, e.g. "$96.4k" */
  value: string;
  /** Change against the previous period – positive is green, negative red */
  delta?: number;
  /** Short labels along the x-axis, e.g. "Mar 4" */
  labels: string[];
  /** Longer labels for the tooltip header, e.g. "Tue, Mar 4" – falls back to `labels` */
  tooltipLabels?: string[];
  series: KpiSeries[];
  /** Formats the axis, tooltip and delta values */
  format?: (n: number) => string;
  /** Line under the chart */
  footer?: string;
  /** Point that stays highlighted while nobody hovers – leave empty to hide the tooltip at rest */
  defaultIndex?: number;
  className?: string;
};

const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${+(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`;

/** Rounds the top of the axis up to a value that halves cleanly: 30 → 15 → 0, $8k → $4k → $0 */
function niceMax(max: number) {
  const half = max / 2 || 1;
  const pow = 10 ** Math.floor(Math.log10(half));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= half) ?? 10;
  return step * pow * 2;
}

export function KpiChart({
  title,
  value,
  delta,
  labels,
  tooltipLabels,
  series,
  format = compact,
  footer,
  defaultIndex,
  className,
}: KpiChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? defaultIndex ?? null;
  // The tooltip keeps its last content while it fades out
  const [shown, setShown] = useState(active ?? 0);
  if (active !== null && active !== shown) setShown(active);

  const count = labels.length;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const x = (i: number) => (count > 1 ? (i / (count - 1)) * 100 : 50);
  const y = (v: number) => (1 - v / max) * 100;

  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    return Math.round(ratio * (count - 1));
  };

  const onKey = (e: KeyboardEvent) => {
    const from = active ?? (e.key === "ArrowLeft" ? count : -1);
    if (e.key === "ArrowRight") setHover(Math.min(count - 1, from + 1));
    else if (e.key === "ArrowLeft") setHover(Math.max(0, from - 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const rows = series
    .map((s) => ({ ...s, value: s.values[shown] ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const flip = x(shown) > 50;
  const axis = [0, Math.round(count / 2 - 0.5), count - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <>
      <style href="ui-kpi-chart" precedence="default">
        {css}
      </style>
      <section className={["ui-kpi", className].filter(Boolean).join(" ")}>
        <h3 className="ui-kpi__title">{title}</h3>
        <p className="ui-kpi__value">
          {value}
          {delta !== undefined && delta !== 0 && (
            <span className="ui-kpi__delta" data-trend={delta > 0 ? "up" : "down"}>
              {delta > 0 ? "+" : "−"}
              {format(Math.abs(delta))}
            </span>
          )}
        </p>

        <div className="ui-kpi__chart">
          <div className="ui-kpi__yaxis" aria-hidden="true">
            <span>{format(max)}</span>
            <span>{format(max / 2)}</span>
            <span>{format(0)}</span>
          </div>

          <div
            className="ui-kpi__plot"
            tabIndex={0}
            role="group"
            aria-label={`${title} chart – use the arrow keys to read the values per day`}
            onPointerMove={(e) => setHover(indexAt(e))}
            onPointerDown={(e) => setHover(indexAt(e))}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={onKey}
          >
            <span className="ui-kpi__grid" style={{ top: "0%" }} />
            <span className="ui-kpi__grid" style={{ top: "50%" }} />
            <span className="ui-kpi__grid" style={{ top: "100%" }} />

            <svg className="ui-kpi__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {series.map((s) => (
                <polyline
                  key={s.label}
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  style={{ stroke: s.color }}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            <div className="ui-kpi__marker" data-open={active !== null || undefined} aria-hidden="true">
              <span className="ui-kpi__guide" style={{ left: `${x(shown)}%` }} />
              {series.map((s) => (
                <span
                  key={s.label}
                  className="ui-kpi__dot"
                  style={{ left: `${x(shown)}%`, top: `${y(s.values[shown] ?? 0)}%`, background: s.color }}
                />
              ))}
            </div>

            <div
              className="ui-kpi__tooltip"
              data-open={active !== null || undefined}
              data-side={flip ? "left" : "right"}
              style={{ left: `${x(shown)}%` }}
              role="status"
              aria-live="polite"
            >
              <p className="ui-kpi__date">{(tooltipLabels ?? labels)[shown]}</p>
              <ul>
                {rows.map((r) => (
                  <li key={r.label}>
                    <span className="ui-kpi__swatch" style={{ background: r.color }} />
                    <span className="ui-kpi__label">{r.label}</span>
                    <span className="ui-kpi__num">{format(r.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="ui-kpi__xaxis" aria-hidden="true">
            {axis.map((i) => (
              <span key={i} style={{ left: `${x(i)}%` }} data-edge={i === 0 ? "start" : i === count - 1 ? "end" : undefined}>
                {labels[i]}
              </span>
            ))}
          </div>
        </div>

        {footer && <p className="ui-kpi__footer">{footer}</p>}
      </section>
    </>
  );
}

const css = /* css */ `
.ui-kpi {
  --ui-kpi-card: #ffffff;
  --ui-kpi-line: #ebebeb;
  --ui-kpi-grid: #f0f0f0;
  --ui-kpi-ink: #171717;
  --ui-kpi-muted: #8f8f8f;
  --ui-kpi-up: #1f8a4c;
  --ui-kpi-down: #e5484d;
  --ui-kpi-guide: #d9d9d9;
  --ui-kpi-label: #525252;
  --ui-kpi-ring-gap: #fff;
  --ui-kpi-ring: rgba(23, 23, 23, 0.25);
  /* Surface shadows: a card at level 3, its tooltip floating at 4 – no border of their own */
  --ui-kpi-shadow: var(--shadow-3);
  --ui-kpi-tip-shadow: var(--shadow-4);
  --ui-kpi-ease: cubic-bezier(0.22, 1, 0.36, 1);
  box-sizing: border-box;
  width: 100%;
  max-width: 460px;
  padding: 20px 20px 18px;
  background: var(--ui-kpi-card);
  border-radius: 20px;
  box-shadow: var(--ui-kpi-shadow);
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--ui-kpi-ink);
  -webkit-font-smoothing: antialiased;
  font-variant-numeric: tabular-nums;
}
.ui-kpi *, .ui-kpi *::before, .ui-kpi *::after { box-sizing: border-box; }

.ui-kpi__title {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  color: var(--ui-kpi-muted);
}
.ui-kpi__value {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 8px 0 0;
  font-size: 28px;
  font-weight: 500;
  line-height: 34px;
  letter-spacing: -0.02em;
}
.ui-kpi__delta {
  font-size: 14px;
  font-weight: 450;
  letter-spacing: 0;
}
.ui-kpi__delta[data-trend="up"] { color: var(--ui-kpi-up); }
.ui-kpi__delta[data-trend="down"] { color: var(--ui-kpi-down); }

/* Chart: y labels on the left, plot on the right, x labels below */
.ui-kpi__chart {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 116px 20px;
  column-gap: 12px;
  row-gap: 8px;
  margin-top: 24px;
}
.ui-kpi__yaxis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin: -9px 0;
  font-size: 12px;
  line-height: 18px;
  text-align: right;
  color: var(--ui-kpi-muted);
}
.ui-kpi__plot {
  position: relative;
  touch-action: pan-y;
  outline: none;
  cursor: crosshair;
}
.ui-kpi__plot:focus-visible {
  border-radius: 4px;
  box-shadow: 0 0 0 4px var(--ui-kpi-ring-gap), 0 0 0 6px var(--ui-kpi-ring);
}
.ui-kpi__grid {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--ui-kpi-grid);
}
.ui-kpi__lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: ui-kpi-draw 1100ms var(--ui-kpi-ease) both;
}
.ui-kpi__lines polyline {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Hover marker: thin guide and one dot per line */
.ui-kpi__marker {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease;
}
.ui-kpi__marker[data-open] { opacity: 1; }
.ui-kpi__guide,
.ui-kpi__dot {
  position: absolute;
  transition: left 220ms var(--ui-kpi-ease), top 220ms var(--ui-kpi-ease);
}
.ui-kpi__guide {
  top: -4px;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: var(--ui-kpi-guide);
}
.ui-kpi__dot {
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--ui-kpi-card);
}

/* Tooltip: sits beside the guide, flips to the left on the right half */
.ui-kpi__tooltip {
  position: absolute;
  top: -12px;
  z-index: 2;
  min-width: 176px;
  padding: 10px 12px 12px;
  background: var(--ui-kpi-card);
  border-radius: 12px;
  box-shadow: var(--ui-kpi-tip-shadow);
  pointer-events: none;
  opacity: 0;
  transform: translateX(var(--ui-kpi-shift)) scale(0.97);
  transition:
    left 220ms var(--ui-kpi-ease),
    opacity 160ms ease,
    transform 220ms var(--ui-kpi-ease);
}
.ui-kpi__tooltip[data-side="right"] { --ui-kpi-shift: 14px; transform-origin: left top; }
.ui-kpi__tooltip[data-side="left"] { --ui-kpi-shift: calc(-100% - 14px); transform-origin: right top; }
.ui-kpi__tooltip[data-open] {
  opacity: 1;
  transform: translateX(var(--ui-kpi-shift));
}
.ui-kpi__date {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--ui-kpi-muted);
}
.ui-kpi__tooltip ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ui-kpi__tooltip li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 20px;
}
.ui-kpi__swatch {
  flex: none;
  width: 10px;
  height: 2px;
  border-radius: 1px;
}
.ui-kpi__label {
  flex: 1;
  white-space: nowrap;
  color: var(--ui-kpi-label);
}
.ui-kpi__num {
  padding-left: 16px;
  font-weight: 500;
}

.ui-kpi__xaxis {
  position: relative;
  grid-column: 2;
  font-size: 12px;
  line-height: 20px;
  color: var(--ui-kpi-muted);
}
.ui-kpi__xaxis span {
  position: absolute;
  top: 0;
  white-space: nowrap;
  transform: translateX(-50%);
}
.ui-kpi__xaxis span[data-edge="start"] { transform: none; }
.ui-kpi__xaxis span[data-edge="end"] { transform: translateX(-100%); }

.ui-kpi__footer {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--ui-kpi-muted);
}

@keyframes ui-kpi-draw {
  from { clip-path: inset(-10% 100% -10% 0); }
  to { clip-path: inset(-10% -2% -10% 0); }
}

@media (prefers-reduced-motion: reduce) {
  .ui-kpi__lines { animation: none; }
  .ui-kpi__marker, .ui-kpi__guide, .ui-kpi__dot, .ui-kpi__tooltip { transition: none; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-kpi {
  --ui-kpi-card: #232326;
  --ui-kpi-line: rgba(255, 255, 255, 0.08);
  --ui-kpi-grid: rgba(255, 255, 255, 0.06);
  --ui-kpi-ink: #ededed;
  --ui-kpi-muted: #8f8f8f;
  --ui-kpi-up: #3dd68c;
  --ui-kpi-down: #ff6369;
  --ui-kpi-guide: rgba(255, 255, 255, 0.2);
  --ui-kpi-label: #c4c4c4;
  --ui-kpi-ring-gap: #232326;
  --ui-kpi-ring: rgba(237, 237, 237, 0.35);
}
:where(.dark, [data-theme="dark"]) .ui-kpi__tooltip {
  background: #2a2a2d;
  border-color: rgba(255, 255, 255, 0.1);
}
`;
