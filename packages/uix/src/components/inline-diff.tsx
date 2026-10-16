import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";

/*
 * Inline Diff – review an AI's edits to a piece of prose, in a single self-contained file.
 * The original and the suggested text are diffed word by word and shown as one flowing paragraph:
 * removed words struck through on a soft red tint, new words on a soft green one. Hover or focus a
 * change and a small popover offers Accept and Reject; accepting shrinks the old words away and
 * settles the new ones into the text, rejecting does the opposite. Tab moves between changes,
 * Y / Enter accepts, N / Backspace rejects. A toolbar counts what's left, steps to the previous /
 * next pending change with its arrows and turns into "All changes reviewed" with an Undo at the end.
 * The white card sits on a gray tray that also holds the optional label above it.
 * The styles are injected below, so no extra files are needed.
 */

/** A run of unchanged text, or one change (removed and/or inserted text) */
export type DiffSegment = { type: "equal"; text: string } | { type: "change"; remove: string; insert: string };

export type InlineDiffVerdict = "accepted" | "rejected";

/** Imperative controls, e.g. for a guided tour or your own buttons */
export type InlineDiffHandle = {
  /** Show the popover on a change (by its index among the changes) without moving focus; null hides it */
  highlight: (index: number | null) => void;
  accept: (index: number) => void;
  reject: (index: number) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** Restores the last decision (or the last "all" batch) */
  undo: () => void;
  /** Back to every change pending */
  reset: () => void;
};

export type InlineDiffProps = {
  /** The text as it is now */
  original?: string;
  /** The text the AI suggests */
  suggested?: string;
  /** Pre-computed segments instead of original + suggested */
  changes?: DiffSegment[];
  /** Called on every decision (and undo) with the text so far – pending changes keep the original words */
  onChange?: (text: string) => void;
  /** Called once no change is pending, with the final text */
  onDone?: (text: string) => void;
  /** Small line on the gray tray above the card, e.g. "Suggested by AI · Make it shorter" */
  label?: string;
  ref?: Ref<InlineDiffHandle>;
  className?: string;
};

/* ---------- Word diff ---------- */

// Words (letters, digits, apostrophes), runs of whitespace, and single punctuation marks
const TOKEN = /\s+|[\p{L}\p{N}_'’]+|[^\s\p{L}\p{N}_]/gu;
const isSpace = (s: string) => /^\s+$/.test(s);

/** Word-level diff of two texts (LCS over word and whitespace tokens), grouped into equal runs and changes */
export function diffWords(original: string, suggested: string): DiffSegment[] {
  const a = original.match(TOKEN) ?? [];
  const b = suggested.match(TOKEN) ?? [];

  // Strip the common start and end so the table only covers the middle
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const x = a.slice(pre, a.length - suf);
  const y = b.slice(pre, b.length - suf);
  const n = x.length;
  const m = y.length;

  type Op = { t: 0 | 1 | 2; s: string }; // 0 equal, 1 removed, 2 inserted
  const ops: Op[] = a.slice(0, pre).map((s) => ({ t: 0, s }));

  if (n * m > 4_000_000) {
    // Huge texts: one replacement instead of a slow table
    x.forEach((s) => ops.push({ t: 1, s }));
    y.forEach((s) => ops.push({ t: 2, s }));
  } else {
    const w = m + 1;
    const L = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        L[i * w + j] = x[i] === y[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        ops.push({ t: 0, s: x[i] });
        i++;
        j++;
      } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) ops.push({ t: 1, s: x[i++] });
      else ops.push({ t: 2, s: y[j++] });
    }
    while (i < n) ops.push({ t: 1, s: x[i++] });
    while (j < m) ops.push({ t: 2, s: y[j++] });
  }
  a.slice(a.length - suf).forEach((s) => ops.push({ t: 0, s }));

  // A pure removal or insertion that starts with a space slides right, so the space trails the words
  for (let s = 0; s < ops.length; s++) {
    if (ops[s].t === 0 || (s > 0 && ops[s - 1].t !== 0)) continue;
    const t = ops[s].t;
    let e = s;
    while (e < ops.length && ops[e].t === t) e++;
    if (e < ops.length && ops[e].t !== 0) continue; // mixed change – leave it
    while (e < ops.length && ops[e].t === 0 && ops[e].s === ops[s].s && isSpace(ops[s].s)) {
      ops[e] = { t, s: ops[e].s };
      ops[s] = { t: 0, s: ops[s].s };
      s++;
      e++;
    }
    s = e - 1;
  }

  // Group into segments
  const raw: DiffSegment[] = [];
  for (const op of ops) {
    const last = raw[raw.length - 1];
    if (op.t === 0) {
      if (last?.type === "equal") last.text += op.s;
      else raw.push({ type: "equal", text: op.s });
    } else {
      if (last?.type !== "change") raw.push({ type: "change", remove: "", insert: "" });
      const c = raw[raw.length - 1] as Extract<DiffSegment, { type: "change" }>;
      if (op.t === 1) c.remove += op.s;
      else c.insert += op.s;
    }
  }

  // Changes split only by a space read as one edit: "a lot faster" → "twice as fast"
  const merged: DiffSegment[] = [];
  for (let k = 0; k < raw.length; k++) {
    const seg = raw[k];
    const prev = merged[merged.length - 1];
    const next = raw[k + 1];
    if (seg.type === "equal" && isSpace(seg.text) && prev?.type === "change" && next?.type === "change") {
      prev.remove += seg.text + next.remove;
      prev.insert += seg.text + next.insert;
      k++;
      continue;
    }
    merged.push({ ...seg });
  }

  // Whitespace both sides share at their edges belongs to the surrounding text
  const out: DiffSegment[] = [];
  const pushEqual = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.type === "equal") last.text += text;
    else out.push({ type: "equal", text });
  };
  for (const seg of merged) {
    if (seg.type === "equal") {
      pushEqual(seg.text);
      continue;
    }
    let { remove, insert } = seg;
    let lead = "";
    let trail = "";
    if (remove && insert) {
      const l = remove.match(/^\s+/)?.[0] ?? "";
      if (l && insert.startsWith(l) && l.length < remove.length && l.length < insert.length) {
        lead = l;
        remove = remove.slice(l.length);
        insert = insert.slice(l.length);
      }
      const t = remove.match(/\s+$/)?.[0] ?? "";
      if (t && insert.endsWith(t) && t.length < remove.length && t.length < insert.length) {
        trail = t;
        remove = remove.slice(0, -t.length);
        insert = insert.slice(0, -t.length);
      }
    }
    pushEqual(lead);
    out.push({ type: "change", remove, insert });
    pushEqual(trail);
  }
  return out;
}

/* ---------- Component ---------- */

type Decisions = Partial<Record<number, InlineDiffVerdict>>;

const plural = (n: number) => `${n} suggestion${n === 1 ? "" : "s"}`;
const quote = (s: string) => `“${s.trim()}”`;
const describe = (c: { remove: string; insert: string }) =>
  c.remove.trim() && c.insert.trim()
    ? `replace ${quote(c.remove)} with ${quote(c.insert)}`
    : c.insert.trim()
      ? `add ${quote(c.insert)}`
      : `remove ${quote(c.remove)}`;

export function InlineDiff({ original = "", suggested = "", changes, onChange, onDone, label, ref, className }: InlineDiffProps) {
  const segments = useMemo(() => changes ?? diffWords(original, suggested), [changes, original, suggested]);
  const signature = useMemo(() => JSON.stringify(segments), [segments]);

  // Index of every change among the segments
  const list = useMemo(() => {
    const out: { seg: number; remove: string; insert: string }[] = [];
    segments.forEach((s, i) => {
      if (s.type === "change") out.push({ seg: i, remove: s.remove, insert: s.insert });
    });
    return out;
  }, [segments]);

  const [decisions, setDecisions] = useState<Decisions>({});
  const [history, setHistory] = useState<number[][]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  // New text in → start over
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setDecisions({});
    setHistory([]);
    setHover(null);
    setFocused(null);
    setHighlighted(null);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLSpanElement | null)[]>([]);
  const leaveTimer = useRef(0);
  const focusAfter = useRef<"undo" | number | null>(null);
  // The change the arrows step from: the last one shown, navigated to or decided
  const cursor = useRef<number | null>(null);
  const callbacks = useRef({ onChange, onDone });
  callbacks.current = { onChange, onDone };

  const pending = list.map((_, i) => i).filter((i) => !decisions[i]);
  const done = list.length > 0 && pending.length === 0;

  const textFor = (d: Decisions) =>
    segments
      .map((s, i) => {
        if (s.type === "equal") return s.text;
        const ci = list.findIndex((c) => c.seg === i);
        return d[ci] === "accepted" ? s.insert : s.remove;
      })
      .join("");

  // Latest values for the handlers below, so the imperative handle never goes stale
  const live = useRef({ decisions, history, list, pending });
  live.current = { decisions, history, list, pending };

  const decide = (ids: number[], verdict: InlineDiffVerdict, moveFocus = false) => {
    const { decisions: d, list: l } = live.current;
    const fresh = ids.filter((i) => i >= 0 && i < l.length && !d[i]);
    if (!fresh.length) return;
    const next = { ...d };
    fresh.forEach((i) => (next[i] = verdict));
    const left = l.length - Object.keys(next).length;
    setDecisions(next);
    setHistory((h) => [...h, fresh]);
    setHighlighted(null);
    cursor.current = Math.max(...fresh);
    const word = verdict === "accepted" ? "Accepted" : "Rejected";
    const what = fresh.length === 1 ? describe(l[fresh[0]]).replace(/^./, (c) => c.toUpperCase()) : `${fresh.length} suggestions`;
    setMessage(`${word}: ${what}. ${left ? `${plural(left)} left.` : "All changes reviewed."}`);
    if (moveFocus) {
      const after = Math.max(...fresh);
      const rest = l.map((_, i) => i).filter((i) => !next[i]);
      focusAfter.current = left ? (rest.find((i) => i > after) ?? rest[0]) : "undo";
    }
    const text = textFor(next);
    callbacks.current.onChange?.(text);
    if (!left) callbacks.current.onDone?.(text);
  };

  const undo = (moveFocus = false) => {
    const { decisions: d, history: h } = live.current;
    const last = h[h.length - 1];
    if (!last) return;
    const next = { ...d };
    last.forEach((i) => delete next[i]);
    setDecisions(next);
    setHistory(h.slice(0, -1));
    setMessage(`Undone. ${plural(live.current.list.length - Object.keys(next).length)} left.`);
    if (moveFocus) focusAfter.current = Math.min(...last);
    callbacks.current.onChange?.(textFor(next));
  };

  const reset = () => {
    setDecisions({});
    setHistory([]);
    setHighlighted(null);
    setHover(null);
    setMessage("");
    cursor.current = null;
  };

  useImperativeHandle(ref, () => ({
    highlight: (i) => setHighlighted(i),
    accept: (i) => decide([i], "accepted"),
    reject: (i) => decide([i], "rejected"),
    acceptAll: () => decide(live.current.pending, "accepted"),
    rejectAll: () => decide(live.current.pending, "rejected"),
    undo: () => undo(),
    reset,
  }));

  // Move focus once the DOM shows the new state (the Undo layer is inert until then)
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    if (target === "undo") undoRef.current?.focus();
    else items.current[target]?.focus();
  }, [decisions]);

  // Which change shows the popover: the hovered one, else the focused one, else a highlighted one
  const candidates = [hover, focused, highlighted];
  const active = candidates.find((i): i is number => i !== null && !decisions[i] && i < list.length) ?? null;
  useEffect(() => {
    if (active !== null) cursor.current = active;
  }, [active]);

  /*
   * Prev / next: highlight the neighbouring pending change (wrapping around) and show its popover.
   * The arrows never take focus (see onMouseDown below), so the highlight can't be lost to a blur;
   * if a change has keyboard focus, focus follows. The page only scrolls when the change is out of view.
   */
  const step = (dir: 1 | -1) => {
    const p = live.current.pending;
    if (!p.length) return;
    const from = active ?? cursor.current ?? (dir === 1 ? -1 : Infinity);
    const target = dir === 1 ? (p.find((i) => i > from) ?? p[0]) : ([...p].reverse().find((i) => i < from) ?? p[p.length - 1]);
    window.clearTimeout(leaveTimer.current);
    setHover(null);
    setHighlighted(target);
    cursor.current = target;
    const el = items.current[target];
    if (!el) return;
    if (focused !== null) el.focus({ preventScroll: true });
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: still ? "auto" : "smooth" });
  };

  // A highlight from the arrows stays until a decision, Esc or a click outside the component
  useEffect(() => {
    if (highlighted === null) return;
    const outside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setHighlighted(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [highlighted]);

  // Place the popover above the first line of the active change, kept inside the card
  const [pos, setPos] = useState<{ left: number; top: number; snap: boolean } | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    const place = () => {
      const root = cardRef.current;
      const pop = popRef.current;
      const el = active === null ? null : items.current[active];
      if (!root || !pop || !el) return;
      const r = root.getBoundingClientRect();
      // Works inside CSS zoom or transforms: convert viewport pixels back to the card's own pixels
      const scale = r.width ? root.offsetWidth / r.width : 1;
      const first = el.getClientRects()[0] ?? el.getBoundingClientRect();
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      const center = (first.left - r.left + first.width / 2) * scale;
      const left = Math.min(Math.max(center - pw / 2, 8), Math.max(8, root.offsetWidth - pw - 8));
      const top = (first.top - r.top) * scale - ph - 6;
      setPos({ left, top, snap: !wasOpen.current });
      wasOpen.current = true;
    };
    if (active === null) {
      wasOpen.current = false;
      return;
    }
    place();
    const ro = new ResizeObserver(place);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [active, decisions]);

  const enter = (i: number) => {
    window.clearTimeout(leaveTimer.current);
    setHover(i);
  };
  const leave = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHover(null), 140);
  };
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "y" || k === "enter") {
      e.preventDefault();
      decide([i], "accepted", true);
    } else if (k === "n" || k === "backspace" || k === "delete") {
      e.preventDefault();
      decide([i], "rejected", true);
    } else if (k === "escape") {
      (e.currentTarget as HTMLElement).blur();
    }
  };

  const total = list.length;
  let ci = -1;

  return (
    <div
      ref={rootRef}
      className={["ui-df", className].filter(Boolean).join(" ")}
      data-done={done || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && highlighted !== null) setHighlighted(null);
      }}
    >
      {/* React 19 hoists this into <head> once, no matter how many diffs render */}
      <style href="ui-inline-diff" precedence="default">
        {css}
      </style>

      {/* The label sits on the gray tray, above the white card */}
      {label && (
        <div className="ui-df__label">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.75c.3 2.9 1.35 3.95 4.25 4.25-2.9.3-3.95 1.35-4.25 4.25C7.7 7.35 6.65 6.3 3.75 6 6.65 5.7 7.7 4.65 8 1.75Z" />
            <path d="M12.5 10.25c.15 1.25.6 1.7 1.75 1.75-1.15.15-1.6.6-1.75 1.75-.15-1.15-.6-1.6-1.75-1.75 1.15-.05 1.6-.5 1.75-1.75Z" />
          </svg>
          <span>{label}</span>
        </div>
      )}

      <div ref={cardRef} className="ui-df__card">
        <div className="ui-df__head">
          <div className="ui-df__bar">
            <div className="ui-df__layer" data-show={!done || undefined} inert={done} aria-hidden={done || undefined}>
              <span className="ui-df__count">
                <span className="ui-df__num">{pending.length}</span>
                <span className="ui-df__word">{pending.length === 1 ? "suggestion" : "suggestions"}</span>
              </span>
              <span className="ui-df__actions">
                {/* Not focus-stealing on click: a focused change keeps focus, so its highlight can't blur away */}
                <span className="ui-df__nav" onMouseDown={(e) => e.preventDefault()}>
                  <button type="button" className="ui-df__icon" onClick={() => step(-1)} disabled={!pending.length} aria-label="Previous suggestion">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M10 12.5 5.5 8 10 3.5" />
                    </svg>
                  </button>
                  <button type="button" className="ui-df__icon" onClick={() => step(1)} disabled={!pending.length} aria-label="Next suggestion">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M6 3.5 10.5 8 6 12.5" />
                    </svg>
                  </button>
                </span>
                <button type="button" className="ui-df__btn" onClick={() => decide(pending, "rejected")} disabled={!pending.length}>
                  Reject all
                </button>
                <button type="button" className="ui-df__btn ui-df__btn--primary" onClick={() => decide(pending, "accepted")} disabled={!pending.length}>
                  Accept all
                </button>
              </span>
            </div>

            <div className="ui-df__layer" data-show={done || undefined} inert={!done} aria-hidden={!done || undefined}>
              <span className="ui-df__count ui-df__count--done">
                <svg className="ui-df__ok" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3.75 8.4 6.6 11.1 12.25 5" pathLength={1} />
                </svg>
                All changes reviewed
              </span>
              <button ref={undoRef} type="button" className="ui-df__btn" onClick={() => undo(true)} disabled={!history.length}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5.5 4 2.75 6.75 5.5 9.5" />
                  <path d="M3 6.75h6.5a3.75 3.75 0 0 1 0 7.5H7.5" />
                </svg>
                Undo
              </button>
            </div>
          </div>
        </div>

        <div className="ui-df__body">
          <p className="ui-df__text">
            {segments.map((s, i) => {
              if (s.type === "equal") return <span key={i}>{s.text}</span>;
              ci++;
              const idx = ci;
              const state: InlineDiffVerdict | "pending" = decisions[idx] ?? "pending";
              const open = state === "pending";
              return (
                <span
                  key={i}
                  ref={(el) => {
                    items.current[idx] = el;
                  }}
                  className="ui-df__chg"
                  data-state={state}
                  data-active={active === idx || undefined}
                  tabIndex={open ? 0 : undefined}
                  role={open ? "button" : undefined}
                  aria-label={
                    open ? `Suggestion ${idx + 1} of ${total}: ${describe(s)}. Press Y to accept, N to reject` : undefined
                  }
                  onKeyDown={open ? (e) => onKey(e, idx) : undefined}
                  onFocus={() => setFocused(idx)}
                  onBlur={() => setFocused((f) => (f === idx ? null : f))}
                  onMouseEnter={() => enter(idx)}
                  onMouseLeave={leave}
                >
                  {s.remove && (
                    <del className="ui-df__del" aria-hidden={state === "accepted" || undefined}>
                      {s.remove}
                    </del>
                  )}
                  {s.insert && (
                    <ins className="ui-df__ins" aria-hidden={state === "rejected" || undefined}>
                      {s.insert}
                    </ins>
                  )}
                </span>
              );
            })}
          </p>
        </div>

        <div
          ref={popRef}
          className="ui-df__pop"
          data-open={active !== null || undefined}
          data-snap={pos?.snap || undefined}
          style={pos ? { left: pos.left, top: pos.top } : undefined}
          role="group"
          aria-label="Review suggestion"
          aria-hidden={active === null || undefined}
          onMouseEnter={() => active !== null && enter(active)}
          onMouseLeave={leave}
          // Keep focus on the change while clicking the popover
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            tabIndex={-1}
            className="ui-df__pbtn"
            aria-label="Accept suggestion"
            onClick={() => active !== null && decide([active], "accepted", focused === active)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.75 8.4 6.6 11.1 12.25 5" />
            </svg>
            Accept
            <kbd>Y</kbd>
          </button>
          <span className="ui-df__sep" aria-hidden="true" />
          <button
            type="button"
            tabIndex={-1}
            className="ui-df__pbtn"
            aria-label="Reject suggestion"
            onClick={() => active !== null && decide([active], "rejected", focused === active)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
            </svg>
            Reject
            <kbd>N</kbd>
          </button>
        </div>
      </div>

      <span className="ui-df__sr" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}

const css = /* css */ `
.ui-df {
  --ui-df-ink: #171717;
  --ui-df-text: #525252;
  --ui-df-muted: #8a8a8a;
  --ui-df-tray: #f0f0f0;
  --ui-df-line: #ececec;
  --ui-df-bg: #ffffff;
  --ui-df-soft: #f5f5f5;
  --ui-df-add: rgba(34, 160, 90, 0.1);
  --ui-df-add-strong: rgba(34, 160, 90, 0.18);
  --ui-df-add-ink: #18794e;
  --ui-df-del: rgba(220, 60, 60, 0.08);
  --ui-df-del-strong: rgba(220, 60, 60, 0.15);
  --ui-df-del-ink: #b42318;
  --ui-df-strike: rgba(180, 35, 24, 0.55);
  --ui-df-ok: #1f8a4c;
  --ui-df-pop: #171717;
  --ui-df-pop-ink: #ffffff;
  --ui-df-pop-soft: rgba(255, 255, 255, 0.14);
  --ui-df-pop-kbd: rgba(255, 255, 255, 0.55);
  --ui-df-primary: #171717;
  --ui-df-primary-ink: #ffffff;
  --ui-df-focus: rgba(23, 23, 23, 0.35);
  --ui-df-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  --ui-df-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  box-sizing: border-box;
  display: grid;
  width: 100%;
  min-width: 0;
  padding: 4px;
  border-radius: 20px;
  background: var(--ui-df-tray);
  color: var(--ui-df-text);
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  -webkit-font-smoothing: antialiased;
  text-align: left;
}
.ui-df *, .ui-df *::before, .ui-df *::after { box-sizing: border-box; }

/* The optional label sits on the gray tray, above the card */
.ui-df__label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px 4px;
  color: var(--ui-df-muted);
  font-size: 12.5px;
  line-height: 1.3;
  letter-spacing: -0.003em;
}
.ui-df__label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-df__label svg { flex: none; width: 13px; height: 13px; fill: currentColor; }

/* The white card: toolbar, paragraph and the popover (positioned relative to it) */
.ui-df__card {
  position: relative;
  min-width: 0;
  border-radius: 16px;
  background: var(--ui-df-bg);
  box-shadow: var(--shadow-3);
}
.ui-df__head {
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--ui-df-line);
}

/* The two toolbars share one cell and cross-fade */
.ui-df__bar { display: grid; }
.ui-df__layer {
  grid-area: 1 / 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  filter: blur(2px);
  transition: opacity 260ms ease, transform 420ms var(--ui-df-ease), filter 260ms ease, visibility 0s 420ms;
}
.ui-df__layer[data-show] {
  opacity: 1;
  visibility: visible;
  transform: none;
  filter: none;
  transition: opacity 320ms ease 80ms, transform 460ms var(--ui-df-ease) 80ms, filter 320ms ease 80ms, visibility 0s;
}
/* Narrow cards (e.g. a side panel): the count keeps only its number, so the toolbar stays on one line */
.ui-df__card { container: ui-df-card / inline-size; }
@container ui-df-card (max-width: 400px) {
  .ui-df__word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
}
.ui-df__count {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-df-ink);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.006em;
  white-space: nowrap;
}
.ui-df__num {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ui-df-add);
  color: var(--ui-df-add-ink);
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ui-df__ok {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--ui-df-ok);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}
.ui-df[data-done] .ui-df__ok { animation: ui-df-draw 420ms var(--ui-df-ease) 220ms forwards; }
.ui-df__actions { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
.ui-df__nav { display: inline-flex; gap: 2px; margin-right: 2px; }

.ui-df__btn,
.ui-df__icon {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  margin: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-df-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.006em;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, opacity 160ms ease, transform 160ms var(--ui-df-ease);
  -webkit-tap-highlight-color: transparent;
}
.ui-df__btn { padding: 0 11px; box-shadow: var(--shadow-2); }
.ui-df__icon { width: 28px; color: var(--ui-df-muted); }
.ui-df__btn svg,
.ui-df__icon svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ui-df__btn:hover:not(:disabled) { background: var(--ui-df-soft); }
.ui-df__icon:hover:not(:disabled) { background: var(--ui-df-soft); color: var(--ui-df-ink); }
.ui-df__btn--primary { background: var(--ui-df-primary); color: var(--ui-df-primary-ink); box-shadow: none; }
.ui-df__btn--primary:hover:not(:disabled) { background: var(--ui-df-primary); opacity: 0.88; }
.ui-df__btn:active:not(:disabled),
.ui-df__icon:active:not(:disabled) { transform: scale(0.97); }
.ui-df__btn:disabled,
.ui-df__icon:disabled { opacity: 0.4; cursor: default; }
.ui-df__btn:focus-visible,
.ui-df__icon:focus-visible { outline: 2px solid var(--ui-df-focus); outline-offset: 2px; }

/* The prose */
.ui-df__body { padding: 16px 18px 18px; }
.ui-df__text {
  margin: 0;
  color: var(--ui-df-text);
  font-size: 15px;
  line-height: 1.65;
  letter-spacing: -0.006em;
  white-space: pre-line; /* line breaks stay, doubled spaces around a settled change collapse */
  overflow-wrap: anywhere;
}

.ui-df__chg { border-radius: 4px; cursor: pointer; scroll-margin: 64px 0 24px; }
.ui-df__chg:not([data-state="pending"]) { cursor: auto; }
.ui-df__chg:focus { outline: none; }
.ui-df__chg:focus-visible { outline: 2px solid var(--ui-df-focus); outline-offset: 2px; }

.ui-df__del,
.ui-df__ins {
  padding: 1px 2px;
  border-radius: 4px;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  font-size: 1em;
  transition:
    background-color 360ms ease,
    color 360ms ease,
    text-decoration-color 300ms ease,
    font-size 460ms var(--ui-df-ease),
    padding 460ms var(--ui-df-ease),
    margin 460ms var(--ui-df-ease),
    opacity 300ms ease;
}
.ui-df__del {
  background: var(--ui-df-del);
  color: var(--ui-df-del-ink);
  text-decoration: line-through;
  text-decoration-color: var(--ui-df-strike);
  text-decoration-thickness: 1.2px;
}
.ui-df__ins {
  background: var(--ui-df-add);
  color: var(--ui-df-add-ink);
  text-decoration: none;
}
.ui-df__del + .ui-df__ins { margin-left: 3px; }
.ui-df__chg[data-active] .ui-df__del { background: var(--ui-df-del-strong); }
.ui-df__chg[data-active] .ui-df__ins { background: var(--ui-df-add-strong); }

/* Accepted: the old words shrink away, the new ones settle into the text */
.ui-df__chg[data-state="accepted"] .ui-df__del,
.ui-df__chg[data-state="rejected"] .ui-df__ins {
  font-size: 0;
  padding: 0;
  margin: 0;
  opacity: 0;
}
.ui-df__chg[data-state="accepted"] .ui-df__ins,
.ui-df__chg[data-state="rejected"] .ui-df__del {
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  text-decoration-color: transparent;
}

/* Popover */
.ui-df__pop {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--ui-df-pop);
  color: var(--ui-df-pop-ink);
  box-shadow: 0 6px 20px -6px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.2);
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px) scale(0.96);
  transform-origin: 50% 100%;
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 260ms var(--ui-df-ease),
    left 320ms var(--ui-df-ease),
    top 320ms var(--ui-df-ease),
    visibility 0s 260ms;
}
.ui-df__pop[data-open] {
  opacity: 1;
  visibility: visible;
  transform: none;
  pointer-events: auto;
  transition:
    opacity 180ms ease,
    transform 300ms var(--ui-df-ease),
    left 320ms var(--ui-df-ease),
    top 320ms var(--ui-df-ease),
    visibility 0s;
}
.ui-df__pop[data-snap] { transition-property: opacity, transform, visibility; }
.ui-df__pbtn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0;
  padding: 0 8px 0 7px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease;
}
.ui-df__pbtn:hover { background: var(--ui-df-pop-soft); }
.ui-df__pbtn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ui-df__pbtn kbd {
  display: inline-grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--ui-df-pop-soft);
  color: var(--ui-df-pop-kbd);
  font: inherit;
  font-size: 10.5px;
  font-weight: 500;
}
.ui-df__sep { width: 1px; height: 16px; background: var(--ui-df-pop-soft); }

.ui-df__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@keyframes ui-df-draw { to { stroke-dashoffset: 0; } }

/* Narrow screens: the arrows step aside (Tab still moves between changes) */
@media (max-width: 400px) {
  .ui-df__nav { display: none; }
  .ui-df__head { padding-left: 14px; }
  .ui-df__label { padding-left: 6px; }
  .ui-df__body { padding: 14px 14px 16px; }
}
@media (hover: none) and (pointer: coarse) {
  .ui-df__pbtn kbd { display: none; }
  .ui-df__pbtn { height: 34px; padding: 0 11px 0 9px; }
}

@media (prefers-reduced-motion: reduce) {
  .ui-df *, .ui-df *::before, .ui-df *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
    transition-delay: 0ms !important;
  }
  .ui-df__layer { filter: none; transform: none; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-df {
  --ui-df-ink: #ededed;
  --ui-df-text: #b4b4b8;
  --ui-df-muted: #8b8b92;
  --ui-df-tray: #111113;
  --ui-df-line: #2a2a2e;
  --ui-df-bg: #19191b;
  --ui-df-soft: #232326;
  --ui-df-add: rgba(60, 200, 120, 0.13);
  --ui-df-add-strong: rgba(60, 200, 120, 0.22);
  --ui-df-add-ink: #6ee7a8;
  --ui-df-del: rgba(240, 90, 90, 0.12);
  --ui-df-del-strong: rgba(240, 90, 90, 0.2);
  --ui-df-del-ink: #ff8a80;
  --ui-df-strike: rgba(255, 138, 128, 0.6);
  --ui-df-ok: #5fd68f;
  --ui-df-pop: #f4f4f5;
  --ui-df-pop-ink: #171717;
  --ui-df-pop-soft: rgba(0, 0, 0, 0.08);
  --ui-df-pop-kbd: rgba(0, 0, 0, 0.5);
  --ui-df-primary: #ededed;
  --ui-df-primary-ink: #19191b;
  --ui-df-focus: rgba(255, 255, 255, 0.35);
  --ui-df-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
`;
