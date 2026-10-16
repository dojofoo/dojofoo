import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/*
 * Model Picker – the model menu of an AI chat, in a single self-contained file.
 * A small trigger (glyph, model name, chevron) sits in your composer toolbar; it opens a menu that unfolds softly from it:
 *   · one row per model with three tiny strength bars – Speed, Quality, Cost. Point at a row and its bars fill,
 *     the other rows step back
 *   · Extended thinking and Web search as switches; the Effort control (Low / Medium / High) unfolds under thinking
 *   · the line on the gray tray says what the model you point at costs you – first-token time and price –
 *     and its numbers roll when the model or the effort changes
 *   · arrows move, Enter picks, Tab reaches the switches, Esc or a click outside closes
 * The styles are injected below, so no extra files are needed.
 */

export type PickerModel = {
  id: string;
  name: string;
  /** One short line under the name, e.g. "Hardest problems" */
  description?: string;
  /** Glyph in front of the name – any node, sized to 18px. Defaults to the first letter on a soft tile */
  icon?: ReactNode;
  /** Strengths from 1 to 5. Cost 5 is the most expensive. Leave all three out for a router like "Auto" */
  speed?: number;
  quality?: number;
  cost?: number;
  /** Typical time to the first token without extended thinking, in milliseconds */
  latencyMs?: number;
  /** Price per million output tokens, in dollars */
  pricePerM?: number;
};

export type ModelEffort = "low" | "medium" | "high";

export type ModelPickerProps = {
  models: PickerModel[];
  /** Id of the chosen model (controlled) */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Extended thinking switch */
  thinking?: boolean;
  defaultThinking?: boolean;
  onThinkingChange?: (on: boolean) => void;
  /** Web search switch */
  webSearch?: boolean;
  defaultWebSearch?: boolean;
  onWebSearchChange?: (on: boolean) => void;
  /** How hard the model thinks – only shown while extended thinking is on */
  effort?: ModelEffort;
  defaultEffort?: ModelEffort;
  onEffortChange?: (effort: ModelEffort) => void;
  /** Controlled open state of the menu */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which edge of the trigger the menu lines up with */
  align?: "start" | "end";
  /** Whether the menu opens below or above the trigger – above suits a composer at the bottom of the screen */
  side?: "bottom" | "top";
  className?: string;
};

/* ---------- Helpers ---------- */

const EFFORTS: { id: ModelEffort; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];
/** How much longer the first token takes while the model thinks first */
const THINK_FACTOR: Record<ModelEffort, number> = { low: 1.6, medium: 2.5, high: 4 };
const STRENGTHS = [
  { key: "speed", label: "Speed" },
  { key: "quality", label: "Quality" },
  { key: "cost", label: "Cost" },
] as const;

const ease = (t: number) => 1 - Math.pow(1 - t, 4);
const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n)));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const dollars = (n: number, target: number) =>
  `$${n.toFixed(Number.isInteger(target) ? 0 : 2)}`;

/** Rolls a set of named numbers from where they are to their targets, in one animation frame loop */
function useRolling(target: Record<string, number>, duration: number) {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  const signature = JSON.stringify(target);
  useEffect(() => {
    const to = JSON.parse(signature) as Record<string, number>;
    const from = { ...current.current };
    if (reduced() || Object.keys(to).every((k) => from[k] === to[k])) {
      current.current = to;
      setShown(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      const next: Record<string, number> = {};
      for (const k in to)
        next[k] = (from[k] ?? to[k]) + (to[k] - (from[k] ?? to[k])) * e;
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [signature, duration]);
  return shown;
}

/**
 * Text that changes without a jump: the old line stays for a moment and fades out underneath while the new one fades in.
 * Quick changes just retarget – nothing piles up.
 */
function Swap({ id, children }: { id: string; children: ReactNode }) {
  type Line = { id: string; node: ReactNode };
  const last = useRef<Line>({ id, node: children });
  const [shownId, setShownId] = useState(id);
  const [out, setOut] = useState<Line | null>(null);
  if (shownId !== id) {
    setShownId(id);
    setOut(last.current);
  }
  last.current = { id, node: children };
  useEffect(() => {
    if (!out) return;
    const timer = window.setTimeout(() => setOut(null), 260);
    return () => window.clearTimeout(timer);
  }, [out]);
  return (
    <span className="ui-mdp__swap">
      {out && (
        <span key={`out-${out.id}`} className="ui-mdp__swap-item" data-out="" aria-hidden="true">
          {out.node}
        </span>
      )}
      <span key={id} className="ui-mdp__swap-item">
        {children}
      </span>
    </span>
  );
}

/* ---------- Icons ---------- */

const line = {
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const ChevronIcon = () => (
  <svg className="ui-mdp__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="m3 4.5 3 3 3-3" {...line} />
  </svg>
);
const CheckIcon = () => (
  <svg className="ui-mdp__check" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="m3.4 7.3 2.4 2.4 4.8-5.2" {...line} strokeWidth={1.6} />
  </svg>
);
const ThinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5.3 10.6h3.4M5.8 12.3h2.4M7 1.7a3.9 3.9 0 0 0-2.3 7c.4.3.6.7.6 1.1v.1h3.4v-.1c0-.4.2-.8.6-1.1A3.9 3.9 0 0 0 7 1.7Z" {...line} />
  </svg>
);
const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="5.3" {...line} />
    <path d="M1.9 7h10.2M7 1.7c1.4 1.5 2 3.3 2 5.3s-.6 3.8-2 5.3c-1.4-1.5-2-3.3-2-5.3s.6-3.8 2-5.3Z" {...line} />
  </svg>
);

function Glyph({ model }: { model: PickerModel }) {
  return (
    <span className="ui-mdp__glyph" aria-hidden="true">
      {model.icon ?? model.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ModelPicker({
  models,
  value,
  defaultValue,
  onChange,
  thinking,
  defaultThinking = false,
  onThinkingChange,
  webSearch,
  defaultWebSearch = false,
  onWebSearchChange,
  effort,
  defaultEffort = "medium",
  onEffortChange,
  open,
  defaultOpen = false,
  onOpenChange,
  align = "start",
  side = "bottom",
  className,
}: ModelPickerProps) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Every value works on its own; pass the value and its callback to keep the truth outside
  const [innerValue, setInnerValue] = useState(defaultValue ?? models[0]?.id);
  const [innerThinking, setInnerThinking] = useState(defaultThinking);
  const [innerSearch, setInnerSearch] = useState(defaultWebSearch);
  const [innerEffort, setInnerEffort] = useState<ModelEffort>(defaultEffort);
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const chosenId = value ?? innerValue;
  const isThinking = thinking ?? innerThinking;
  const isSearching = webSearch ?? innerSearch;
  const effortNow = effort ?? innerEffort;
  const isOpen = open ?? innerOpen;

  const chosenIndex = Math.max(0, models.findIndex((m) => m.id === chosenId));
  const chosen = models[chosenIndex];

  /** The row the arrows (or the pointer) are on, and whether someone is actually pointing at a row */
  const [active, setActive] = useState(chosenIndex);
  const [pointing, setPointing] = useState(false);
  /** A switch under the pointer or the focus – the tray then talks about it */
  const [hint, setHint] = useState<"search" | null>(null);

  const lit = models[pointing ? active : chosenIndex] ?? chosen;

  /* ---------- Opening and closing ---------- */

  const setOpen = (next: boolean, focus?: "list" | "trigger") => {
    if (next !== isOpen) {
      if (next) {
        setActive(chosenIndex);
        setPointing(false);
      } else setHint(null);
      setInnerOpen(next);
      onOpenChange?.(next);
    }
    // Focus only moves for people – a parent opening the menu through `open` leaves the focus where it is
    if (focus === "list") requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
    if (focus === "trigger") triggerRef.current?.focus({ preventScroll: true });
  };
  // The parent may open the menu itself – start on the chosen row
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setActive(chosenIndex);
      setPointing(false);
    }
    wasOpen.current = isOpen;
  }, [isOpen, chosenIndex]);

  // Near the edge of the screen the menu slides in just enough to stay whole
  const popRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const width = popRef.current?.offsetWidth ?? 0;
      if (!trigger || !width) return;
      const room = document.documentElement.clientWidth;
      const left = align === "end" ? trigger.right - width : trigger.left;
      const margin = 12;
      setShift(
        left < margin
          ? margin - left
          : left + width > room - margin
            ? Math.min(0, room - margin - (left + width))
            : 0,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isOpen, align]);

  // While open, a press outside closes it
  useEffect(() => {
    if (!isOpen) return;
    const down = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const focusInside = () => rootRef.current?.contains(document.activeElement) ?? false;

  /* ---------- Changing things ---------- */

  const pick = (index: number) => {
    const m = models[index];
    if (!m) return;
    setInnerValue(m.id);
    if (m.id !== chosenId) onChange?.(m.id);
    setOpen(false, focusInside() ? "trigger" : undefined);
  };
  const toggleThinking = () => {
    setInnerThinking(!isThinking);
    onThinkingChange?.(!isThinking);
  };
  const toggleSearch = () => {
    setInnerSearch(!isSearching);
    onWebSearchChange?.(!isSearching);
  };
  const chooseEffort = (next: ModelEffort) => {
    setInnerEffort(next);
    if (next !== effortNow) onEffortChange?.(next);
  };

  /* ---------- Keyboard ---------- */

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true, "list");
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    const n = models.length;
    if (!n) return;
    const move = (to: number) => {
      e.preventDefault();
      setActive(((to % n) + n) % n);
      setPointing(true);
    };
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(n - 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    }
  };
  const onEffortKey = (e: KeyboardEvent) => {
    const i = EFFORTS.findIndex((x) => x.id === effortNow);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = EFFORTS[(i + step + EFFORTS.length) % EFFORTS.length];
    chooseEffort(next.id);
    rootRef.current?.querySelector<HTMLElement>(`[data-effort="${next.id}"]`)?.focus();
  };
  const onRootKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !isOpen) return;
    e.stopPropagation();
    setOpen(false, "trigger");
  };

  /* ---------- What the tray says ---------- */

  const factor = isThinking ? THINK_FACTOR[effortNow] : 1;
  const latency = (lit?.latencyMs ?? 0) * factor;
  const price = lit?.pricePerM ?? 0;
  const rolled = useRolling({ latency, price }, 560);
  const hasStats = lit?.latencyMs !== undefined || lit?.pricePerM !== undefined;

  let caption: ReactNode;
  let captionKey: string;
  let spoken: string;
  if (hint === "search") {
    caption = isSearching ? "Looks things up on the web when it helps" : "Answers from what it already knows";
    captionKey = `search-${isSearching}`;
    spoken = caption as string;
  } else if (!hasStats) {
    caption = lit?.description ?? lit?.name ?? "";
    captionKey = `plain-${lit?.id}`;
    spoken = `${lit?.name ?? ""}: ${caption as string}`;
  } else {
    const parts: ReactNode[] = [];
    const words: string[] = [];
    if (lit.latencyMs !== undefined) {
      parts.push(<span key="l">~<b>{seconds(rolled.latency ?? latency)}</b> first token</span>);
      words.push(`about ${seconds(latency)} to the first token`);
    }
    if (lit.pricePerM !== undefined) {
      parts.push(<span key="p"><b>{dollars(rolled.price ?? price, price)}</b> / M tokens</span>);
      words.push(`${dollars(price, price)} per million tokens`);
    }
    caption = parts.flatMap((p, i) => (i ? [<span key={`d${i}`} className="ui-mdp__dot"> · </span>, p] : [p]));
    // One key for every model with numbers – the numbers roll instead of the line swapping
    captionKey = "stats";
    spoken = `${lit.name}: ${words.join(", ")}`;
  }

  const activeId = models[active] ? `${uid}-opt-${models[active].id}` : undefined;

  return (
    <div
      ref={rootRef}
      className={["ui-mdp", className].filter(Boolean).join(" ")}
      data-open={isOpen ? "" : undefined}
      data-align={align}
      data-side={side}
      onKeyDown={onRootKey}
      onBlur={(e) => {
        if (isOpen && e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <style href="ui-model-picker" precedence="default">
        {css}
      </style>

      <button
        ref={triggerRef}
        type="button"
        className="ui-mdp__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={`${uid}-menu`}
        aria-label={`Model: ${chosen?.name ?? "none"}${isThinking ? ", extended thinking" : ""}`}
        onClick={() => setOpen(!isOpen, isOpen ? undefined : "list")}
        onKeyDown={onTriggerKey}
      >
        {chosen && <Glyph model={chosen} />}
        <span className="ui-mdp__name">
          <Swap id={chosen?.id ?? "none"}>{chosen?.name ?? "Choose a model"}</Swap>
        </span>
        {/* A small bulb unfolds next to the name while extended thinking is on */}
        <span className="ui-mdp__flag" data-on={isThinking ? "" : undefined} aria-hidden="true">
          <span>
            <ThinkIcon />
          </span>
        </span>
        <ChevronIcon />
      </button>

      <div
        id={`${uid}-menu`}
        ref={popRef}
        className="ui-mdp__pop"
        style={shift ? { translate: `${shift}px 0` } : undefined}
        role="dialog"
        aria-label="Model settings"
        inert={!isOpen}
      >
        <div className="ui-mdp__card">
          <div className="ui-mdp__head" aria-hidden="true">
            <span>Model</span>
            <span className="ui-mdp__cols">
              {STRENGTHS.map((s) => (
                <span key={s.key}>{s.label}</span>
              ))}
            </span>
          </div>

          <div
            ref={listRef}
            className="ui-mdp__list"
            role="listbox"
            aria-label="Model"
            tabIndex={0}
            aria-activedescendant={isOpen ? activeId : undefined}
            data-pointing={pointing ? "" : undefined}
            onKeyDown={onListKey}
            onPointerLeave={() => setPointing(false)}
          >
            {models.map((m, i) => {
              const rated = m.speed !== undefined || m.quality !== undefined || m.cost !== undefined;
              return (
                <div
                  key={m.id}
                  id={`${uid}-opt-${m.id}`}
                  role="option"
                  aria-selected={i === chosenIndex}
                  aria-label={`${m.name}${m.description ? `, ${m.description}` : ""}${rated ? `. Speed ${m.speed ?? 0}, quality ${m.quality ?? 0}, cost ${m.cost ?? 0} of 5` : ""}`}
                  className="ui-mdp__option"
                  data-active={i === active ? "" : undefined}
                  data-lit={m.id === lit?.id ? "" : undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "mouse") return;
                    setActive(i);
                    setPointing(true);
                  }}
                  onClick={() => pick(i)}
                >
                  <Glyph model={m} />
                  <span className="ui-mdp__text">
                    <span className="ui-mdp__title">
                      <span className="ui-mdp__title-name">{m.name}</span>
                      {i === chosenIndex && <CheckIcon />}
                    </span>
                    {m.description && <span className="ui-mdp__desc">{m.description}</span>}
                  </span>
                  {rated ? (
                    <span className="ui-mdp__bars" aria-hidden="true">
                      {STRENGTHS.map((s, c) => {
                        const level = clamp(m[s.key] ?? 0);
                        return (
                          <span key={s.key} className="ui-mdp__meter" style={{ ["--c" as string]: c }}>
                            {[0, 1, 2, 3, 4].map((k) => (
                              <span
                                key={k}
                                className="ui-mdp__seg"
                                data-on={k < level ? "" : undefined}
                                style={{ ["--s" as string]: k }}
                              />
                            ))}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span className="ui-mdp__varies" aria-hidden="true">
                      Varies
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ui-mdp__settings">
            <button
              type="button"
              role="switch"
              aria-checked={isThinking}
              className="ui-mdp__toggle"
              onClick={toggleThinking}
            >
              <span className="ui-mdp__toggle-icon">
                <ThinkIcon />
              </span>
              <span className="ui-mdp__toggle-label">Extended thinking</span>
              <span className="ui-mdp__switch" aria-hidden="true" />
            </button>

            {/* Effort unfolds under thinking, in place */}
            <div className="ui-mdp__fold" data-open={isThinking ? "" : undefined} inert={!isThinking}>
              <div className="ui-mdp__clip">
                <div className="ui-mdp__effort">
                  <span className="ui-mdp__effort-label" id={`${uid}-effort`}>
                    Effort
                  </span>
                  <div
                    className="ui-mdp__segmented"
                    role="radiogroup"
                    aria-labelledby={`${uid}-effort`}
                    style={{ ["--i" as string]: EFFORTS.findIndex((x) => x.id === effortNow) }}
                    onKeyDown={onEffortKey}
                  >
                    <span className="ui-mdp__thumb" aria-hidden="true" />
                    {EFFORTS.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        role="radio"
                        aria-checked={x.id === effortNow}
                        tabIndex={x.id === effortNow ? 0 : -1}
                        data-effort={x.id}
                        className="ui-mdp__seg-btn"
                        onClick={() => chooseEffort(x.id)}
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isSearching}
              className="ui-mdp__toggle"
              onClick={toggleSearch}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHint("search")}
              onPointerLeave={() => setHint(null)}
              onFocus={() => setHint("search")}
              onBlur={() => setHint(null)}
            >
              <span className="ui-mdp__toggle-icon">
                <GlobeIcon />
              </span>
              <span className="ui-mdp__toggle-label">Web search</span>
              <span className="ui-mdp__switch" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* The tray: what the model you point at costs you */}
        <div className="ui-mdp__foot">
          <span className="ui-mdp__caption" aria-hidden="true">
            <Swap id={captionKey}>{caption}</Swap>
          </span>
          <span className="ui-mdp__keys" aria-hidden="true">
            <kbd>↑↓</kbd>
            <kbd>↵</kbd>
          </span>
          <span className="ui-mdp__sr" aria-live="polite">
            {isOpen ? spoken : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

const css = /* css */ `
.ui-mdp {
  --ui-mdp-tray: #f0f0f0;
  --ui-mdp-card: #ffffff;
  --ui-mdp-line: #ececec;
  --ui-mdp-ink: #171717;
  --ui-mdp-text: #404040;
  --ui-mdp-muted: #8f8f8f;
  --ui-mdp-well: #f4f4f5;
  --ui-mdp-bar: #d4d4d9;
  --ui-mdp-bar-off: #e6e6ea;
  --ui-mdp-switch: #dcdce0;
  --ui-mdp-knob: #ffffff;
  --ui-mdp-focus: rgba(23, 23, 23, 0.22);
  --ui-mdp-ease: cubic-bezier(0.32, 0.72, 0.24, 1);
  position: relative;
  display: inline-block;
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 13px;
  line-height: 20px;
  color: var(--ui-mdp-text);
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
.ui-mdp *, .ui-mdp *::before, .ui-mdp *::after { box-sizing: border-box; }
:where(.ui-mdp) button { margin: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ui-mdp button:focus-visible, .ui-mdp__list:focus-visible { outline: 2px solid var(--ui-mdp-focus); outline-offset: 2px; }
.ui-mdp svg { display: block; flex: none; }
.ui-mdp b { font-weight: 500; color: var(--ui-mdp-ink); }
.ui-mdp__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* ----- Trigger ----- */
.ui-mdp__trigger { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; height: 30px; padding: 0 8px 0 6px; border-radius: 10px; font-weight: 500; color: var(--ui-mdp-ink); white-space: nowrap; transition: background-color 160ms ease; }
.ui-mdp__trigger:hover, .ui-mdp[data-open] .ui-mdp__trigger { background: var(--ui-mdp-well); }
.ui-mdp__trigger .ui-mdp__glyph { width: 18px; height: 18px; }
.ui-mdp__name { display: grid; min-width: 0; }
.ui-mdp__chevron { color: var(--ui-mdp-muted); transition: transform 300ms var(--ui-mdp-ease); }
.ui-mdp[data-open] .ui-mdp__chevron { transform: rotate(180deg); }
.ui-mdp__flag { display: grid; grid-template-columns: 0fr; margin-left: -7px; opacity: 0; color: var(--ui-mdp-muted); transition: grid-template-columns 360ms var(--ui-mdp-ease), margin 360ms var(--ui-mdp-ease), opacity 220ms ease; }
.ui-mdp__flag > span { min-width: 0; overflow: hidden; }
.ui-mdp__flag[data-on] { grid-template-columns: 1fr; margin-left: -3px; opacity: 1; transition: grid-template-columns 360ms var(--ui-mdp-ease), margin 360ms var(--ui-mdp-ease), opacity 280ms ease 80ms; }

.ui-mdp__glyph { display: grid; flex: none; place-items: center; width: 22px; height: 22px; overflow: hidden; border-radius: 6px; background: var(--ui-mdp-card); box-shadow: var(--shadow-2); font-size: 10.5px; font-weight: 600; line-height: 1; color: var(--ui-mdp-ink); }
.ui-mdp__glyph > svg, .ui-mdp__glyph > img { width: 12px; height: 12px; }

/* ----- Menu: unfolds softly from the trigger ----- */
.ui-mdp__pop {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  width: min(320px, calc(100vw - 32px));
  container-type: inline-size;
  padding: 4px;
  border-radius: 20px;
  background: var(--ui-mdp-tray);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.04);
  transform-origin: top left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px) scale(0.96);
  transition: opacity 160ms ease, transform 220ms var(--ui-mdp-ease), visibility 0s linear 220ms;
}
.ui-mdp[data-align="end"] .ui-mdp__pop { left: auto; right: 0; transform-origin: top right; }
.ui-mdp[data-side="top"] .ui-mdp__pop { top: auto; bottom: calc(100% + 6px); transform-origin: bottom left; transform: translateY(4px) scale(0.96); }
.ui-mdp[data-side="top"][data-align="end"] .ui-mdp__pop { transform-origin: bottom right; }
.ui-mdp[data-open] .ui-mdp__pop { opacity: 1; visibility: visible; transform: none; transition: opacity 200ms ease, transform 320ms var(--ui-mdp-ease), visibility 0s; }

.ui-mdp__card { padding: 6px; border-radius: 16px; background: var(--ui-mdp-card); box-shadow: var(--shadow-3); }
.ui-mdp__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 24px; padding: 0 10px; font-size: 11px; line-height: 16px; color: var(--ui-mdp-muted); }
.ui-mdp__cols { display: grid; grid-template-columns: repeat(3, 34px); gap: 8px; }
.ui-mdp__cols > span { display: flex; justify-content: center; white-space: nowrap; }

/* ----- Rows ----- */
.ui-mdp__list { display: grid; gap: 1px; border-radius: 10px; }
.ui-mdp__option { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 10px; border-radius: 10px; cursor: pointer; transition: background-color 160ms ease, opacity 220ms ease; }
.ui-mdp__list[data-pointing] .ui-mdp__option[data-active] { background: var(--ui-mdp-well); }
.ui-mdp__list:focus-visible { outline: none; }
.ui-mdp__list:focus-visible .ui-mdp__option[data-active] { background: var(--ui-mdp-well); box-shadow: inset 0 0 0 1.5px var(--ui-mdp-focus); }
.ui-mdp__list[data-pointing] .ui-mdp__option:not([data-active]) { opacity: 0.5; }
.ui-mdp__text { display: grid; flex: 1; min-width: 0; }
.ui-mdp__title { display: flex; align-items: center; gap: 4px; min-width: 0; font-weight: 500; color: var(--ui-mdp-ink); }
.ui-mdp__title-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ui-mdp__check { color: var(--ui-mdp-ink); animation: ui-mdp-pop 320ms var(--ui-mdp-ease) both; }
.ui-mdp__desc { overflow: hidden; font-size: 12px; line-height: 17px; color: var(--ui-mdp-muted); white-space: nowrap; text-overflow: ellipsis; }

/* Strength bars: five small segments each. The lit row fills them one after another */
.ui-mdp__bars { display: grid; flex: none; grid-template-columns: repeat(3, 34px); gap: 8px; }
.ui-mdp__meter { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; height: 5px; }
.ui-mdp__seg { border-radius: 1.5px; background: var(--ui-mdp-bar-off); transition: background-color 180ms ease, transform 260ms var(--ui-mdp-ease); }
.ui-mdp__seg[data-on] { background: var(--ui-mdp-bar); }
.ui-mdp__option[data-lit] .ui-mdp__seg[data-on] { background: var(--ui-mdp-ink); transition-delay: calc(var(--c) * 70ms + var(--s) * 45ms); animation: ui-mdp-fill 360ms var(--ui-mdp-ease) both; animation-delay: calc(var(--c) * 70ms + var(--s) * 45ms); }
.ui-mdp__varies { flex: none; width: 118px; font-size: 11.5px; color: var(--ui-mdp-muted); text-align: center; }

/* ----- Switches and effort ----- */
.ui-mdp__settings { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--ui-mdp-line); }
.ui-mdp__toggle { display: flex; align-items: center; gap: 10px; width: 100%; height: 34px; padding: 0 10px; border-radius: 10px; color: var(--ui-mdp-text); transition: background-color 160ms ease; }
.ui-mdp__toggle:hover { background: var(--ui-mdp-well); }
.ui-mdp__toggle-icon { display: grid; flex: none; place-items: center; width: 22px; color: var(--ui-mdp-muted); transition: color 200ms ease; }
.ui-mdp__toggle[aria-checked="true"] .ui-mdp__toggle-icon { color: var(--ui-mdp-ink); }
.ui-mdp__toggle-label { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ui-mdp__switch { position: relative; flex: none; width: 28px; height: 16px; border-radius: 8px; background: var(--ui-mdp-switch); transition: background-color 220ms ease; }
.ui-mdp__switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--ui-mdp-knob); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); transition: transform 280ms var(--ui-mdp-ease); }
.ui-mdp__toggle[aria-checked="true"] .ui-mdp__switch { background: var(--ui-mdp-ink); }
.ui-mdp__toggle[aria-checked="true"] .ui-mdp__switch::after { transform: translateX(12px); }

.ui-mdp__fold { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 420ms var(--ui-mdp-ease), opacity 220ms ease; }
.ui-mdp__fold[data-open] { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 420ms var(--ui-mdp-ease), opacity 320ms ease 100ms; }
.ui-mdp__clip { min-height: 0; overflow: hidden; }
.ui-mdp__effort { display: flex; align-items: center; gap: 10px; padding: 2px 10px 6px 42px; }
.ui-mdp__effort-label { flex: 1; min-width: 0; font-size: 12.5px; color: var(--ui-mdp-muted); }
.ui-mdp__segmented { position: relative; display: grid; flex: none; grid-template-columns: repeat(3, 58px); padding: 2px; border-radius: 9px; background: var(--ui-mdp-well); }
.ui-mdp__thumb { position: absolute; top: 2px; bottom: 2px; left: 2px; width: 58px; border-radius: 7px; background: var(--ui-mdp-card); box-shadow: var(--shadow-3); transform: translateX(calc(var(--i) * 100%)); transition: transform 320ms var(--ui-mdp-ease); }
.ui-mdp__seg-btn { position: relative; height: 24px; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--ui-mdp-muted); text-align: center !important; transition: color 200ms ease; }
.ui-mdp__seg-btn[aria-checked="true"] { color: var(--ui-mdp-ink); }
.ui-mdp__seg-btn:hover { color: var(--ui-mdp-ink); }

/* ----- Tray ----- */
.ui-mdp__foot { display: flex; align-items: center; gap: 8px; height: 38px; padding: 4px 8px 0 12px; }
.ui-mdp__caption { flex: 1; min-width: 0; overflow: hidden; font-size: 12.5px; color: var(--ui-mdp-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ui-mdp__dot { color: var(--ui-mdp-muted); }
.ui-mdp__swap { display: grid; min-width: 0; }
.ui-mdp__swap-item { grid-area: 1 / 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; animation: ui-mdp-swap-in 320ms ease both; }
.ui-mdp__swap-item[data-out] { animation: ui-mdp-swap-out 220ms ease both; }
.ui-mdp__keys { display: flex; flex: none; gap: 3px; }
.ui-mdp__keys kbd { display: grid; place-items: center; min-width: 20px; height: 18px; padding: 0 4px; border-radius: 5px; background: var(--ui-mdp-card); box-shadow: var(--shadow-2); font-family: inherit; font-size: 10.5px; line-height: 1; color: var(--ui-mdp-muted); }

@keyframes ui-mdp-swap-in { from { opacity: 0; filter: blur(2px); } }
@keyframes ui-mdp-swap-out { from { opacity: 1; } to { opacity: 0; filter: blur(2px); } }
@keyframes ui-mdp-pop { from { opacity: 0; transform: scale(0.6); } }
@keyframes ui-mdp-fill { 0% { transform: scaleY(1); } 45% { transform: scaleY(1.6); } 100% { transform: scaleY(1); } }

/* Narrow menus: the bars move closer and the glyphs in the rows give way */
@container (max-width: 300px) {
  .ui-mdp__option .ui-mdp__glyph { display: none; }
  .ui-mdp__cols, .ui-mdp__bars { grid-template-columns: repeat(3, 30px); gap: 6px; }
  .ui-mdp__varies { width: 102px; }
  .ui-mdp__keys { display: none; }
  .ui-mdp__effort { padding-left: 10px; }
  .ui-mdp__segmented { grid-template-columns: repeat(3, 52px); }
  .ui-mdp__thumb { width: 52px; }
}

@media (pointer: coarse) {
  .ui-mdp__trigger { height: 36px; }
  .ui-mdp__option { min-height: 54px; }
  .ui-mdp__toggle { height: 42px; }
  .ui-mdp__seg-btn { height: 30px; }
  .ui-mdp__keys { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ui-mdp *, .ui-mdp *::before, .ui-mdp *::after { animation: none !important; transition: none !important; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-mdp {
  --ui-mdp-tray: #111113;
  --ui-mdp-card: #19191b;
  --ui-mdp-line: #2a2a2e;
  --ui-mdp-ink: #ededed;
  --ui-mdp-text: #c8c8cc;
  --ui-mdp-muted: #8b8b92;
  --ui-mdp-well: #222225;
  --ui-mdp-bar: #55555c;
  --ui-mdp-bar-off: #303035;
  --ui-mdp-switch: #3a3a40;
  --ui-mdp-knob: #ededed;
  --ui-mdp-focus: rgba(255, 255, 255, 0.3);
}
:where(.dark, [data-theme="dark"]) .ui-mdp__toggle[aria-checked="true"] .ui-mdp__switch::after { background: #19191b; }
`;
