
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/*
 * Usage Meter – the "Usage" card of a SaaS or AI product, in a single self-contained file.
 * One big credits meter split into categories (Chat, Search, Image …) with a legend, an optional daily sparkline,
 * thin meters for plan limits (seats, storage, projects) and a button that grows more prominent near the limit.
 * Hovering a part highlights it everywhere; switching the period rolls every number to its new value while the
 * bars glide to their new widths. From 80% a small amber dot warns, at 100% it says "Limit reached".
 * The styles are injected below, so no extra files are needed.
 */

export type UsageItem = {
  label: string;
  value: number;
  /** Any CSS color – defaults to shades of the accent, then grays */
  color?: string;
};

export type UsageLimit = {
  label: string;
  used: number;
  /** Leave out (or pass null / Infinity) for unlimited */
  total?: number | null;
  /** Shown after the numbers, e.g. "GB" */
  unit?: string;
  /** Decimal places – defaults to 1 for fractional values, else 0 */
  decimals?: number;
};

export type UsageDay = {
  /** Shown on hover, e.g. "Oct 3" */
  label: string;
  /** null for days still to come in the period */
  value: number | null;
};

export type UsagePeriod = { id: string; label: string };

export type UsageState = "ok" | "warn" | "limit";

export type UsageMeterProps = {
  /** Credits included in the plan */
  total: number;
  /** What the credits were spent on in the shown period */
  used: UsageItem[];
  /** Thin meters below, e.g. seats, storage, projects */
  limits?: UsageLimit[];
  /** Options of the period switch – no switch when left out */
  periods?: UsagePeriod[];
  /** Controlled period id */
  period?: string;
  defaultPeriod?: string;
  /** Called with the new period id – pass the matching `used`, `limits` and `daily` back in */
  onPeriodChange?: (id: string) => void;
  /** When the credits reset – shown as "Resets in 9 days" */
  resetAt?: Date | string | number;
  /** Usage per day for the sparkline under the meter */
  daily?: UsageDay[];
  /** Called by the button, with the current state */
  onUpgrade?: (state: UsageState) => void;
  title?: string;
  /** Plan name next to the reset date, e.g. "Pro plan" */
  plan?: string;
  /** Unit of the credits */
  unit?: string;
  /** Share from which the meter warns (0–1) */
  warnAt?: number;
  /** Button text while there is room left */
  upgradeLabel?: string;
  /** Button text near and at the limit */
  topUpLabel?: string;
  className?: string;
};

/* ---------- Helpers ---------- */

const fmt = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
/** Number and unit with a no-break space, so "3.2 GB" never splits */
const withUnit = (text: string, unit?: string) => (unit ? `${text} ${unit}` : text);
const fmtDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function resetText(at: Date) {
  const days = Math.ceil((at.getTime() - Date.now()) / 864e5);
  if (days <= 0) return "Resets today";
  if (days === 1) return "Resets tomorrow";
  return `Resets in ${days} days`;
}

const PALETTE = ["var(--ui-um-c1)", "var(--ui-um-c2)", "var(--ui-um-c3)", "var(--ui-um-c4)", "var(--ui-um-c5)"];
const ease = (t: number) => 1 - Math.pow(1 - t, 4);
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Tweens a set of named numbers: every key rolls from where it is now to its target, new keys from zero.
 * One animation frame loop for the whole card, so numbers and bar widths move in step.
 */
function useTween(target: Record<string, number>, first: number, then: number) {
  const [shown, setShown] = useState<Record<string, number>>(() => Object.fromEntries(Object.keys(target).map((k) => [k, 0])));
  const current = useRef(shown);
  const started = useRef(false);
  const signature = JSON.stringify(target);
  useEffect(() => {
    const to = JSON.parse(signature) as Record<string, number>;
    const from = { ...current.current };
    if (reduced()) {
      current.current = to;
      setShown(to);
      return;
    }
    // The count-in from zero takes a little longer than later changes
    const live = Object.values(to).some((v) => v !== 0);
    const duration = live && !started.current ? first : then;
    if (live) started.current = true;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      const next: Record<string, number> = {};
      for (const k in to) next[k] = (from[k] ?? 0) + (to[k] - (from[k] ?? 0)) * e;
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  return (key: string) => shown[key] ?? 0;
}

/** Moves a pill under the active child of a list – no transition on the first placement, so it doesn't fly in */
function glide(list: HTMLElement | null, pill: HTMLElement | null, selector: string) {
  if (!list || !pill) return;
  const active = list.querySelector<HTMLElement>(selector);
  if (!active || !active.offsetWidth) {
    pill.style.opacity = "0";
    return;
  }
  const first = !pill.dataset.ready;
  if (first) pill.style.transition = "none";
  pill.style.opacity = "1";
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.height = `${active.offsetHeight}px`;
  pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
  if (first) {
    pill.dataset.ready = "1";
    void pill.offsetWidth;
    pill.style.transition = "";
  }
}

type Row = UsageItem & { color: string; leaving?: boolean };

/** The new rows in their order; rows that disappeared stay at their old place (at zero) while they fold away */
function merge(prev: Row[], next: Row[]) {
  const out = [...next];
  prev.forEach((p, i) => {
    if (next.some((n) => n.label === p.label)) return;
    out.splice(Math.min(i, out.length), 0, { ...p, value: 0, leaving: true });
  });
  return out;
}

/* ---------- Component ---------- */

export function UsageMeter({
  total,
  used,
  limits = [],
  periods,
  period,
  defaultPeriod,
  onPeriodChange,
  resetAt,
  daily,
  onUpgrade,
  title = "Usage",
  plan,
  unit = "credits",
  warnAt = 0.8,
  upgradeLabel = "Upgrade",
  topUpLabel = "Add credits",
  className,
}: UsageMeterProps) {
  const uid = useId();
  const root = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const switchRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const actionInner = useRef<HTMLSpanElement>(null);

  const [ownPeriod, setOwnPeriod] = useState(defaultPeriod ?? periods?.[0]?.id);
  const activePeriod = period ?? ownPeriod;
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [tipLabel, setTipLabel] = useState<string | null>(null); // the tooltip keeps its text while fading out
  const [day, setDay] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  // Stable default colors per label, so "API" keeps its shade when "Image" drops out
  const colors = useRef(new Map<string, string>());
  const colorOf = (item: UsageItem) => {
    if (item.color) return item.color;
    if (!colors.current.has(item.label)) colors.current.set(item.label, PALETTE[colors.current.size % PALETTE.length]);
    return colors.current.get(item.label)!;
  };
  const incoming: Row[] = used.map((u) => ({ ...u, color: colorOf(u) }));

  // Rows that leave fold away; the timer drops them afterwards
  const [rows, setRows] = useState<Row[]>(incoming);
  const usedKey = used.map((u) => `${u.label}:${u.value}:${u.color ?? ""}`).join("|");
  const firstRows = useRef(true);
  useLayoutEffect(() => {
    if (firstRows.current) {
      firstRows.current = false;
      return;
    }
    setRows((prev) => merge(prev.filter((p) => !p.leaving), incoming));
    const t = window.setTimeout(() => setRows((list) => list.filter((r) => !r.leaving)), 460);
    return () => clearTimeout(t);
  }, [usedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count in once the card scrolls into view
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Numbers */
  const sum = used.reduce((s, u) => s + Math.max(0, u.value), 0);
  const share = total > 0 ? sum / total : 0;
  const state: UsageState = share >= 1 ? "limit" : share >= warnAt ? "warn" : "ok";
  // Over the limit the parts fill the whole bar instead of overflowing it
  const scale = Math.max(total, sum) || 1;

  const target: Record<string, number> = { used: sum, left: Math.max(0, total - sum), pct: share * 100 };
  rows.forEach((r) => (target[`r:${r.label}`] = r.leaving ? 0 : Math.max(0, r.value)));
  limits.forEach((l) => (target[`l:${l.label}`] = l.used));
  daily?.forEach((d, i) => (target[`d:${i}`] = d.value ?? 0));
  if (!visible) for (const k in target) target[k] = 0;
  const tween = useTween(target, 1200, 650);

  // Where each part starts and ends on the bar, from the tweened values
  let cursor = 0;
  const segments = rows.map((r) => {
    const width = (tween(`r:${r.label}`) / scale) * 100;
    const seg = { ...r, left: cursor, width };
    cursor += width;
    return seg;
  });
  const activeRow = rows.find((r) => r.label === active && !r.leaving);
  const tipRow = rows.find((r) => r.label === tipLabel);
  const tipSeg = segments.find((s) => s.label === tipLabel);
  const tipCenter = tipSeg ? Math.min(100, Math.max(0, tipSeg.left + tipSeg.width / 2)) : 50;

  const highlight = (label: string | null) => {
    setActive(label);
    if (label) setTipLabel(label);
  };
  // Mouse hover shows and hides; a tap toggles, since touch has no hover to leave
  const segmentAt = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    return segments.find((s) => !s.leaving && s.width > 0 && x >= s.left && x <= s.left + s.width)?.label ?? null;
  };
  const onBarKey = (e: KeyboardEvent) => {
    const list = rows.filter((r) => !r.leaving && r.value > 0);
    if (!list.length) return;
    const i = list.findIndex((r) => r.label === active);
    if (e.key === "ArrowRight") highlight(list[(i + 1) % list.length].label);
    else if (e.key === "ArrowLeft") highlight(list[(i - 1 + list.length) % list.length].label);
    else if (e.key === "Escape") highlight(null);
    else return;
    e.preventDefault();
  };

  // The daily sparkline
  const days = daily ?? [];
  const dayMax = Math.max(1, ...days.map((d) => d.value ?? 0));
  const past = days.filter((d) => d.value !== null);
  const average = past.length ? past.reduce((s, d) => s + (d.value ?? 0), 0) / past.length : 0;
  const dayAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - box.left) / box.width) * days.length);
    return Math.min(days.length - 1, Math.max(0, i));
  };
  const onSparkKey = (e: KeyboardEvent) => {
    if (!days.length) return;
    if (e.key === "ArrowRight") setDay((d) => Math.min(days.length - 1, d === null ? 0 : d + 1));
    else if (e.key === "ArrowLeft") setDay((d) => Math.max(0, d === null ? days.length - 1 : d - 1));
    else if (e.key === "Escape") setDay(null);
    else return;
    e.preventDefault();
  };
  const hoveredDay = day !== null ? days[day] : undefined;
  // A new number of days (30 → 7) grows in fresh; the first fill comes from the count-in
  const lastLength = useRef(days.length);
  const regrow = useRef(false);
  if (lastLength.current !== days.length) {
    lastLength.current = days.length;
    regrow.current = true;
  }

  /* Period switch */
  const choose = (id: string) => {
    if (id === activePeriod) return;
    if (period === undefined) setOwnPeriod(id);
    onPeriodChange?.(id);
    setActive(null);
    setDay(null);
  };
  const onSwitchKey = (e: KeyboardEvent) => {
    if (!periods?.length) return;
    const i = periods.findIndex((p) => p.id === activePeriod);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % periods.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + periods.length) % periods.length;
    if (next < 0) return;
    e.preventDefault();
    choose(periods[next].id);
    switchRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };

  // The white pill glides to the chosen period – also when a narrow layout changes the option widths
  useLayoutEffect(() => {
    glide(switchRef.current, pillRef.current, '[aria-checked="true"]');
  });
  useLayoutEffect(() => {
    const list = switchRef.current;
    if (!list) return;
    const ro = new ResizeObserver(() => glide(list, pillRef.current, '[aria-checked="true"]'));
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  // The card glides to its new height when rows come or go
  useLayoutEffect(() => {
    const card = cardRef.current;
    const inner = innerRef.current;
    if (!card || !inner) return;
    const set = () => (card.style.height = `${inner.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // The button glides to the width of its new label
  useLayoutEffect(() => {
    const box = actionRef.current;
    const inner = actionInner.current;
    if (!box || !inner) return;
    const set = () => (box.style.width = `${inner.offsetWidth}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // Screen readers hear when the state changes
  const lastState = useRef(state);
  useEffect(() => {
    if (lastState.current === state) return;
    lastState.current = state;
    setAnnounce(
      state === "limit"
        ? `${title}: limit reached, ${fmt(sum)} of ${fmt(total)} ${unit} used`
        : state === "warn"
          ? `${title}: running low, ${Math.round(share * 100)}% of ${unit} used`
          : `${title}: ${fmt(sum)} of ${fmt(total)} ${unit} used`,
    );
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = resetAt !== undefined ? new Date(resetAt) : null;
  const strong = state !== "ok";
  const pct = tween("pct");

  return (
    <section ref={root} className={["ui-um", className].filter(Boolean).join(" ")} aria-labelledby={`${uid}-title`} data-state={state}>
      {/* React 19 hoists this into <head> once, no matter how many meters render */}
      <style href="ui-usage-meter" precedence="default">
        {css}
      </style>

      <div ref={cardRef} className="ui-um__card">
        <div ref={innerRef} className="ui-um__inner">
          <header className="ui-um__head">
            <div className="ui-um__heading">
              <h3 id={`${uid}-title`} className="ui-um__title">
                {title}
              </h3>
              {(plan || reset) && (
                <p className="ui-um__sub">
                  {plan}
                  {plan && reset && <span className="ui-um__sep">·</span>}
                  {reset && <time dateTime={reset.toISOString()} title={`Resets on ${fmtDate.format(reset)}`}>{resetText(reset)}</time>}
                </p>
              )}
            </div>
            {periods && periods.length > 1 && (
              <div ref={switchRef} className="ui-um__switch" role="radiogroup" aria-label="Period" onKeyDown={onSwitchKey}>
                <span ref={pillRef} className="ui-um__pill" aria-hidden="true" />
                {periods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === activePeriod}
                    tabIndex={p.id === activePeriod ? 0 : -1}
                    className="ui-um__option"
                    onClick={() => choose(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </header>

          {/* The credits meter */}
          <div className="ui-um__figure">
            <p className="ui-um__amount">
              <span className="ui-um__big">{fmt(tween("used"))}</span>
              <span className="ui-um__of">
                of {withUnit(fmt(total), unit)}
              </span>
            </p>
            <span className="ui-um__pct" data-state={state}>
              {strong && <span className="ui-um__dot" aria-hidden="true" />}
              {fmt(Math.min(pct, 999))}%
            </span>
          </div>

          <div
            className="ui-um__bar"
            tabIndex={0}
            role="group"
            aria-label={`${fmt(sum)} of ${fmt(total)} ${unit} used – arrow keys read each category`}
            data-active={activeRow ? "" : undefined}
            onPointerMove={(e) => e.pointerType === "mouse" && highlight(segmentAt(e))}
            onPointerLeave={(e) => e.pointerType === "mouse" && highlight(null)}
            onPointerUp={(e) => {
              if (e.pointerType === "mouse") return;
              const label = segmentAt(e);
              highlight(label === active ? null : label);
            }}
            onKeyDown={onBarKey}
            onBlur={() => highlight(null)}
          >
            <div
              className="ui-um__track"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={Math.min(sum, total)}
              aria-valuetext={`${fmt(sum)} of ${fmt(total)} ${unit}`}
            >
              {segments.map((s) => (
                <span
                  key={s.label}
                  className="ui-um__seg"
                  data-active={s.label === active || undefined}
                  style={{ width: `${s.width}%`, background: s.color }}
                />
              ))}
            </div>
            <div
              className="ui-um__tip"
              data-open={activeRow ? "" : undefined}
              style={{ left: `${tipCenter}%`, ["--ui-um-tip-x" as string]: `${-tipCenter}%` }}
              aria-live="polite"
            >
              {tipRow && (
                <>
                  <span className="ui-um__tip-label">
                    <span className="ui-um__swatch" style={{ background: tipRow.color }} />
                    {tipRow.label}
                  </span>
                  <span className="ui-um__tip-value">
                    {withUnit(fmt(tipRow.value), unit)}
                    <span className="ui-um__muted"> · {fmt(sum ? (tipRow.value / sum) * 100 : 0)}%</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <ul className="ui-um__legend" aria-label="By category" data-active={activeRow ? "" : undefined}>
            {rows.map((r) => {
              const v = tween(`r:${r.label}`);
              return (
                <li key={r.label} className="ui-um__row" data-leaving={r.leaving || undefined}>
                  <div
                    className="ui-um__item"
                    data-active={r.label === active || undefined}
                    onPointerEnter={(e) => e.pointerType === "mouse" && !r.leaving && highlight(r.label)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && highlight(null)}
                    onPointerUp={(e) => e.pointerType !== "mouse" && !r.leaving && highlight(r.label === active ? null : r.label)}
                  >
                    <span className="ui-um__swatch" style={{ background: r.color }} />
                    <span className="ui-um__label">{r.label}</span>
                    <span className="ui-um__value">{fmt(v)}</span>
                    <span className="ui-um__share">{fmt(tween("used") ? (v / tween("used")) * 100 : 0)}%</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {days.length > 0 && (
            <div className="ui-um__daily">
              <div className="ui-um__daily-head">
                <span>Per day</span>
                <span className="ui-um__daily-read" key={hoveredDay ? `d${day}` : "avg"}>
                  {hoveredDay ? (
                    <>
                      {hoveredDay.label} · <b>{hoveredDay.value === null ? "–" : withUnit(fmt(hoveredDay.value), unit)}</b>
                    </>
                  ) : (
                    <>
                      Avg <b>{fmt(average)}</b> / day
                    </>
                  )}
                </span>
              </div>
              <div
                className="ui-um__spark"
                key={days.length}
                tabIndex={0}
                role="img"
                aria-label={`${title} per day, ${fmt(average)} ${unit} on average – arrow keys read each day`}
                data-hover={day !== null || undefined}
                data-regrow={regrow.current || undefined}
                data-few={days.length <= 14 || undefined}
                onPointerMove={(e) => setDay(dayAt(e))}
                onPointerDown={(e) => setDay(dayAt(e))}
                onPointerLeave={(e) => e.pointerType === "mouse" && setDay(null)}
                onKeyDown={onSparkKey}
                onBlur={() => setDay(null)}
              >
                {days.map((d, i) => (
                  <span key={i} className="ui-um__day" data-future={d.value === null || undefined} data-active={i === day || undefined} style={{ ["--i" as string]: i }}>
                    <span style={{ height: d.value === null ? undefined : `${Math.max(4, (tween(`d:${i}`) / dayMax) * 100)}%` }} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {limits.length > 0 && (
            <ul className="ui-um__limits" aria-label="Plan limits" style={{ ["--n" as string]: Math.min(3, limits.length) }}>
              {limits.map((l) => {
                const unlimited = l.total == null || !isFinite(l.total);
                const digits = l.decimals ?? (Number.isInteger(l.used) && (unlimited || Number.isInteger(l.total)) ? 0 : 1);
                const ratio = unlimited ? 0 : l.used / Math.max(l.total!, 1e-9);
                const lstate: UsageState = unlimited ? "ok" : ratio >= 1 ? "limit" : ratio >= warnAt ? "warn" : "ok";
                const shownUsed = tween(`l:${l.label}`);
                const totalText = unlimited ? "∞" : fmt(l.total!, Number.isInteger(l.total) ? 0 : digits);
                return (
                  <li key={l.label} className="ui-um__limit" data-state={lstate}>
                    <span className="ui-um__limit-label">
                      {l.label}
                      {lstate !== "ok" && <span className="ui-um__dot" aria-label={lstate === "limit" ? "At the limit" : "Close to the limit"} />}
                    </span>
                    <span className="ui-um__limit-value">
                      {fmt(shownUsed, digits)}
                      <span className="ui-um__muted"> of {withUnit(totalText, unlimited ? undefined : l.unit)}</span>
                    </span>
                    {unlimited ? (
                      <span className="ui-um__thin" data-unlimited="" aria-label={`${l.label}: ${fmt(l.used, digits)}, unlimited`} role="img" />
                    ) : (
                      <span
                        className="ui-um__thin"
                        role="meter"
                        aria-label={l.label}
                        aria-valuemin={0}
                        aria-valuemax={l.total!}
                        aria-valuenow={Math.min(l.used, l.total!)}
                        aria-valuetext={`${fmt(l.used, digits)} of ${withUnit(totalText, l.unit)}`}
                      >
                        <span style={{ width: `${Math.min(100, (shownUsed / Math.max(l.total!, 1e-9)) * 100)}%` }} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* The tray below the card: what's left, and the button */}
      <div className="ui-um__foot">
        <span className="ui-um__status" key={state}>
          {strong && <span className="ui-um__dot" aria-hidden="true" />}
          {state === "limit" ? (
            <>
              <b>Limit reached</b>
              {sum > total && <span className="ui-um__muted">{withUnit(fmt(sum - total), "over")}</span>}
            </>
          ) : (
            <>
              {state === "warn" && <b>Running low</b>}
              <span className={state === "warn" ? "ui-um__muted" : undefined}>{withUnit(fmt(tween("left")), unit)} left</span>
            </>
          )}
        </span>
        <button ref={actionRef} type="button" className="ui-um__action" data-strong={strong || undefined} onClick={() => onUpgrade?.(state)}>
          <span ref={actionInner} className="ui-um__action-inner">
            <span key={strong ? "top-up" : "upgrade"} className="ui-um__action-text">
              {strong ? topUpLabel : upgradeLabel}
            </span>
          </span>
        </button>
      </div>

      <span className="ui-um__live" aria-live="polite">
        {announce}
      </span>
    </section>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-um */
.ui-um {
  --ui-um-tray: #f0f0f0;
  --ui-um-card: #ffffff;
  --ui-um-line: #ececec;
  --ui-um-ink: #171717;
  --ui-um-text: #404040;
  --ui-um-muted: #8f8f8f;
  --ui-um-faint: #b5b5b5;
  --ui-um-well: #f4f4f5;
  --ui-um-hover: #f4f4f5;
  --ui-um-track: #efeff1;
  --ui-um-fill: #4a4a4f;
  --ui-um-spark: #dcdce0;
  --ui-um-accent: #2f6bff;
  --ui-um-warn: #f59e0b;
  --ui-um-warn-text: #b45309;
  --ui-um-c1: #2f6bff;
  --ui-um-c2: #74a0ff;
  --ui-um-c3: #b4cbff;
  --ui-um-c4: #a8a8ae;
  --ui-um-c5: #d4d4d8;
  --ui-um-focus: rgba(23, 23, 23, 0.22);
  --ui-um-tip-shadow: var(--shadow-4);
  --ui-um-ease: cubic-bezier(0.22, 1, 0.36, 1);
  box-sizing: border-box;
  container-type: inline-size;
  position: relative;
  display: grid;
  width: 100%;
  max-width: 460px;
  padding: 4px;
  border-radius: calc(20px * var(--squircle-factor, 1));
  background: var(--ui-um-tray);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-um-text);
  -webkit-font-smoothing: antialiased;
}
.ui-um *, .ui-um *::before, .ui-um *::after { box-sizing: border-box; }
:where(.ui-um) button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; }
:where(.ui-um) :is(h3, p, ul) { margin: 0; padding: 0; }
:where(.ui-um) ul { list-style: none; }
.ui-um :is(button, [tabindex="0"]):focus-visible { outline: 2px solid var(--ui-um-focus); outline-offset: 2px; }
.ui-um b { font-weight: 500; color: var(--ui-um-ink); }
.ui-um__muted { color: var(--ui-um-muted); }

/* The white card */
.ui-um__card { overflow: hidden; border-radius: calc(16px * var(--squircle-factor, 1)); background: var(--ui-um-card); box-shadow: var(--shadow-3); transition: height 360ms var(--ui-um-ease); }
.ui-um__inner { display: flow-root; padding: 14px 16px 18px; }

/* Head: title and reset date, the period switch on the right */
.ui-um__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ui-um__heading { min-width: 0; padding-top: 2px; }
.ui-um__title { overflow: hidden; font-size: 14px; font-weight: 600; line-height: 20px; color: var(--ui-um-ink); white-space: nowrap; text-overflow: ellipsis; }
.ui-um__sub { font-size: 12.5px; color: var(--ui-um-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ui-um__sep { margin: 0 6px; color: var(--ui-um-faint); }

.ui-um__switch { position: relative; display: grid; grid-auto-columns: auto; grid-auto-flow: column; flex: none; padding: 2px; border-radius: calc(10px * var(--squircle-factor, 1)); background: var(--ui-um-well); }
.ui-um__pill {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: calc(8px * var(--squircle-factor, 1));
  background: var(--ui-um-card);
  box-shadow: var(--shadow-3);
  opacity: 0;
  pointer-events: none;
  transition: transform 320ms var(--ui-um-ease), width 320ms var(--ui-um-ease), height 320ms var(--ui-um-ease), opacity 200ms ease;
}
.ui-um__option { position: relative; z-index: 1; min-width: 0; height: 26px; padding: 0 9px; overflow: hidden; border-radius: calc(8px * var(--squircle-factor, 1)); font-size: 12px; font-weight: 500; color: var(--ui-um-muted); white-space: nowrap; text-overflow: ellipsis; transition: color 200ms ease; }
.ui-um__option:hover, .ui-um__option[aria-checked="true"] { color: var(--ui-um-ink); }

/* The big number and its share */
.ui-um__figure { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 18px; }
.ui-um__amount { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; min-width: 0; }
.ui-um__big { font-size: 28px; font-weight: 600; line-height: 34px; letter-spacing: -0.02em; color: var(--ui-um-ink); font-variant-numeric: tabular-nums; }
.ui-um__of { font-size: 13px; color: var(--ui-um-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ui-um__pct { display: inline-flex; flex: none; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--ui-um-text); font-variant-numeric: tabular-nums; transition: color 260ms ease; }
.ui-um__pct[data-state="warn"] { color: var(--ui-um-warn-text); }
.ui-um__pct[data-state="limit"] { color: var(--ui-um-ink); }
/* The only place amber shows up: a small dot */
.ui-um__dot { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; corner-shape: round; background: var(--ui-um-warn); animation: ui-um-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.ui-um[data-state="limit"] .ui-um__pct .ui-um__dot, .ui-um[data-state="limit"] .ui-um__status .ui-um__dot, .ui-um__limit[data-state="limit"] .ui-um__dot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-um-warn) 22%, transparent); }

/* The stacked bar */
.ui-um__bar { position: relative; margin-top: 10px; padding: 4px 0; border-radius: calc(6px * var(--squircle-factor, 1)); cursor: default; }
.ui-um__track { display: flex; height: 10px; overflow: hidden; border-radius: calc(5px * var(--squircle-factor, 1)); background: var(--ui-um-track); }
.ui-um__seg { position: relative; flex: none; height: 100%; overflow: hidden; transition: opacity 200ms ease; }
/* A thin cut between the parts */
.ui-um__seg::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; width: 2px; background: var(--ui-um-card); }
.ui-um__bar[data-active] .ui-um__seg:not([data-active]) { opacity: 0.28; }

/* Tooltip: anchored to the middle of the part, shifted so it never leaves the card */
.ui-um__tip {
  position: absolute;
  bottom: calc(100% + 6px);
  z-index: 2;
  display: grid;
  gap: 1px;
  padding: 7px 10px 8px;
  border-radius: calc(10px * var(--squircle-factor, 1));
  background: var(--ui-um-card);
  box-shadow: var(--ui-um-tip-shadow);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(var(--ui-um-tip-x), 4px) scale(0.97);
  transition: left 260ms var(--ui-um-ease), transform 260ms var(--ui-um-ease), opacity 160ms ease;
}
.ui-um__tip[data-open] { opacity: 1; transform: translate(var(--ui-um-tip-x), 0); }
.ui-um__tip-label { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--ui-um-muted); }
.ui-um__tip-value { font-size: 13px; font-weight: 500; color: var(--ui-um-ink); font-variant-numeric: tabular-nums; }
.ui-um__tip-value .ui-um__muted { font-weight: 400; }

/* Legend: one row per category, highlighted with the bar */
.ui-um__legend { display: grid; margin-top: 10px; }
.ui-um__row { display: grid; grid-template-rows: 1fr; animation: ui-um-grow 380ms var(--ui-um-ease) both; transition: grid-template-rows 320ms var(--ui-um-ease) 80ms, opacity 200ms ease; }
.ui-um__row[data-leaving] { grid-template-rows: 0fr; opacity: 0; pointer-events: none; }
.ui-um__item { display: flex; align-items: center; gap: 10px; min-height: 0; height: 30px; margin: 0 -8px; padding: 0 8px; overflow: hidden; border-radius: calc(8px * var(--squircle-factor, 1)); transition: background-color 160ms ease, opacity 200ms ease; }
.ui-um__row[data-leaving] .ui-um__item { background: none; }
.ui-um__item[data-active] { background: var(--ui-um-hover); }
.ui-um__legend[data-active] .ui-um__item:not([data-active]) { opacity: 0.45; }
.ui-um__swatch { flex: none; width: 8px; height: 8px; border-radius: calc(2.5px * var(--squircle-factor, 1)); }
.ui-um__label { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--ui-um-text); }
.ui-um__value { color: var(--ui-um-ink); font-weight: 500; font-variant-numeric: tabular-nums; }
.ui-um__share { width: 40px; text-align: right; color: var(--ui-um-muted); font-variant-numeric: tabular-nums; }

/* Daily sparkline */
.ui-um__daily { margin-top: 12px; }
.ui-um__daily-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--ui-um-muted); white-space: nowrap; }
.ui-um__daily-read { font-variant-numeric: tabular-nums; animation: ui-um-in 220ms var(--ui-um-ease) both; }
.ui-um__spark { display: flex; align-items: stretch; gap: 2px; height: 34px; margin-top: 8px; border-radius: calc(4px * var(--squircle-factor, 1)); cursor: default; }
/* A week gets wider gaps, so seven bars don't read as one block */
.ui-um__spark[data-few] { gap: 5px; }
.ui-um__day { display: flex; flex: 1 1 0; align-items: flex-end; min-width: 0; }
.ui-um__day > span { width: 100%; border-radius: calc(2px * var(--squircle-factor, 1)); background: var(--ui-um-spark); transform-origin: bottom; transition: background-color 160ms ease, opacity 160ms ease; }
.ui-um__spark[data-regrow] .ui-um__day > span { animation: ui-um-rise 520ms var(--ui-um-ease) both; animation-delay: calc(var(--i) * 18ms); }
.ui-um__day[data-future] > span { height: 2px; background: var(--ui-um-track); }
.ui-um__spark[data-hover] .ui-um__day:not([data-active]) > span { opacity: 0.6; }
.ui-um__day[data-active] > span { background: var(--ui-um-accent); }

/* Plan limits: thin meters, side by side on wide cards */
.ui-um__limits { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: 12px 18px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--ui-um-line); }
.ui-um__limit { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; min-width: 0; }
.ui-um__limit-label { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; font-size: 12px; color: var(--ui-um-muted); white-space: nowrap; }
.ui-um__limit-value { overflow: hidden; color: var(--ui-um-ink); font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; text-overflow: ellipsis; }
.ui-um__limit-value .ui-um__muted { font-weight: 400; }
.ui-um__thin { position: relative; display: block; height: 4px; margin-top: 7px; overflow: hidden; border-radius: calc(2px * var(--squircle-factor, 1)); background: var(--ui-um-track); }
.ui-um__thin > span { position: absolute; top: 0; bottom: 0; left: 0; border-radius: inherit; background: var(--ui-um-fill); }
/* Unlimited: a quiet striped track instead of a fill */
.ui-um__thin[data-unlimited] { background: repeating-linear-gradient(-45deg, var(--ui-um-track) 0 3px, transparent 3px 6px); }

/* The tray below the card */
.ui-um__foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 6px 2px 2px 12px; font-size: 12.5px; color: var(--ui-um-muted); }
.ui-um__status { display: flex; align-items: center; gap: 7px; min-width: 0; overflow: hidden; white-space: nowrap; font-variant-numeric: tabular-nums; animation: ui-um-in 260ms var(--ui-um-ease) both; }
.ui-um__status > :last-child { overflow: hidden; text-overflow: ellipsis; }
.ui-um__action {
  display: inline-flex;
  flex: none;
  justify-content: center;
  height: 32px;
  overflow: hidden;
  border-radius: calc(14px * var(--squircle-factor, 1));
  font-size: 13px;
  font-weight: 500;
  color: var(--ui-um-ink);
  background: var(--ui-um-card);
  box-shadow: var(--shadow-2);
  transition: background-color 280ms ease, color 280ms ease, box-shadow 280ms ease, width 320ms var(--ui-um-ease), transform 140ms ease;
}
.ui-um__action:hover { background: var(--ui-um-hover); }
.ui-um__action:active { transform: scale(0.97); }
.ui-um__action[data-strong] { background: var(--ui-um-ink); color: var(--ui-um-card); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12), 0 6px 14px -6px rgba(0, 0, 0, 0.35); animation: ui-um-nudge 520ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.ui-um__action[data-strong]:hover { background: var(--ui-um-ink); opacity: 0.88; }
.ui-um__action-inner { display: inline-flex; align-items: center; flex: none; height: 100%; padding: 0 14px; white-space: nowrap; }
.ui-um__action-text { animation: ui-um-in 260ms var(--ui-um-ease) both; }
.ui-um__live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

@keyframes ui-um-in { from { opacity: 0; transform: translateY(3px); filter: blur(2px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes ui-um-grow { from { grid-template-rows: 0fr; opacity: 0; } to { grid-template-rows: 1fr; opacity: 1; } }
@keyframes ui-um-rise { from { transform: scaleY(0); } to { transform: none; } }
@keyframes ui-um-pop { 0% { transform: scale(0.3); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes ui-um-nudge { 0% { transform: scale(0.94); } 60% { transform: scale(1.04); } 100% { transform: scale(1); } }

/* Narrow (phones): the switch gets its own full-width row, limits stack as rows */
@container (max-width: 400px) {
  .ui-um__inner { padding: 12px 14px 16px; }
  .ui-um__head { flex-direction: column; align-items: stretch; gap: 12px; }
  .ui-um__switch { grid-auto-columns: minmax(0, auto); }
  .ui-um__option { padding: 0 6px; }
  .ui-um__big { font-size: 26px; }
  .ui-um__limits { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .ui-um__limit { grid-template-columns: minmax(0, 1fr) auto; column-gap: 12px; }
  .ui-um__limit-value { font-size: 12.5px; }
  .ui-um__thin { grid-column: 1 / -1; margin-top: 6px; }
}
@container (max-width: 300px) {
  .ui-um__of { font-size: 12px; }
  .ui-um__share { width: 34px; }
}
/* Touch screens: bigger targets */
@media (hover: none) and (pointer: coarse) {
  .ui-um__option { height: 34px; }
  .ui-um__item { height: 36px; }
  .ui-um__action { height: 38px; border-radius: calc(13px * var(--squircle-factor, 1)); }
  .ui-um__foot { min-height: 50px; }
  .ui-um__bar { padding: 10px 0; margin-top: 4px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-um *, .ui-um *::before, .ui-um *::after { animation: none !important; transition: none !important; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-um {
  --ui-um-tray: #111113;
  --ui-um-card: #19191b;
  --ui-um-line: #2a2a2e;
  --ui-um-ink: #ededed;
  --ui-um-text: #c8c8cc;
  --ui-um-muted: #8b8b92;
  --ui-um-faint: #5c5c63;
  --ui-um-well: #111113;
  --ui-um-hover: #232326;
  --ui-um-track: #2a2a2e;
  --ui-um-fill: #b4b4ba;
  --ui-um-spark: #3a3a40;
  --ui-um-accent: #6d8bff;
  --ui-um-warn: #f5a524;
  --ui-um-warn-text: #f5b350;
  --ui-um-c1: #6d8bff;
  --ui-um-c2: #4c66c9;
  --ui-um-c3: #34468a;
  --ui-um-c4: #6b6b72;
  --ui-um-c5: #45454b;
  --ui-um-focus: rgba(255, 255, 255, 0.3);
}
:where(.dark, [data-theme="dark"]) .ui-um__tip { background: #2a2a2d; border-color: rgba(255, 255, 255, 0.1); }
`;
