"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

/*
 * A code in boxes – affectUI's OTP Input (Clean), its fields and error state only, drawn as our fields are (the
 * onboarding's .ui-ob-input: the card's surface, a ring, the ink ring on focus, the red ring on an error).
 * One real input sits under the boxes, so typing, Backspace, paste and SMS autofill all work natively; the boxes only
 * draw what it holds. The focus ring glides from box to box, characters pop in, a wrong code shakes, turns red and
 * says why below.
 */

export type CodeInputProps = {
  /** Number of boxes */
  length?: number;
  /** A small dash after this many boxes */
  separator?: number;
  /** Digits only (numeric keyboard on phones); `false` allows letters too, shown in capitals */
  numeric?: boolean;
  value: string;
  onChange: (code: string) => void;
  /** Called once the last box is filled – typed, pasted or autofilled */
  onComplete?: (code: string) => void;
  /** Shown below the boxes; the boxes turn red and shake when it appears */
  error?: ReactNode;
  autoFocus?: boolean;
  /** Accessible name of the field */
  label?: string;
  id?: string;
  className?: string;
};

/** Full-width (１２３) and Arabic-Indic digits (٤٨٢) count as the digits they are */
const normalize = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function CodeInput({ length = 6, separator = 0, numeric = true, value, onChange, onComplete, error, autoFocus = false, label = "Code", id: idProp, className }: CodeInputProps) {
  /** Keeps allowed characters only – spaces and dashes of a pasted "WDJB-MJHT" fall away */
  const clean = (text: string) => {
    let out = "";
    for (const ch of normalize(String(text ?? ""))) {
      const c = numeric ? (/[0-9]/.test(ch) ? ch : "") : /[a-z0-9]/i.test(ch) ? ch.toUpperCase() : "";
      if (c && out.length < length) out += c;
    }
    return out;
  };

  const code = clean(value);
  const [idx, setIdx] = useState(Math.min(code.length, length - 1));
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const slots = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const boxes = useRef<(HTMLSpanElement | null)[]>([]);
  const fallbackId = useId();
  const id = idProp ?? fallbackId;

  // Every character remembers when it arrived, so it pops in once; pasted codes arrive one after another
  const prevCode = useRef(code);
  const stamps = useRef<number[]>([]);
  const delays = useRef<number[]>([]);
  const counter = useRef(0);
  if (prevCode.current !== code) {
    const before = prevCode.current;
    const changed = [...code].map((c, i) => c !== before[i]);
    const first = changed.indexOf(true);
    const bulk = changed.filter(Boolean).length > 1;
    changed.forEach((ch, i) => {
      if (!ch) return;
      stamps.current[i] = ++counter.current;
      delays.current[i] = bulk ? (i - first) * 45 : 0;
    });
    prevCode.current = code;
  }

  const active = Math.min(idx, code.length, length - 1);
  const sepAt = separator > 0 && separator < length ? separator : 0;
  const showError = Boolean(error);
  const showRing = focused;

  const commit = (next: string, nextIdx: number) => {
    if (next !== code) onChange(next);
    setIdx(Math.max(0, Math.min(nextIdx, next.length, length - 1)));
    if (next.length === length && next !== code) onComplete?.(next);
  };

  const onInput = (el: HTMLInputElement) => {
    const raw = el.value;
    const next = clean(raw);
    // The caret counts the kept characters in front of it
    const caret = clean(raw.slice(0, el.selectionStart ?? raw.length)).length;
    if (next === code) {
      el.value = code;
      syncSelection();
      return;
    }
    commit(next, caret);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = clean(e.clipboardData.getData("text"));
    if (!text) return;
    // A whole code replaces everything; a part is written from the active box on
    if (text.length >= length) return commit(text.slice(0, length), length - 1);
    commit((code.slice(0, active) + text + code.slice(active + text.length)).slice(0, length), active + text.length);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = Math.min(code.length, length - 1);
    const moves: Record<string, number> = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: last, ArrowUp: 0, ArrowDown: last };
    if (e.key in moves && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      setIdx(Math.max(0, Math.min(moves[e.key], last)));
    }
  };

  /** A tap or click picks the box under the pointer – never beyond the first empty one */
  const pick = (x: number) => {
    let i = boxes.current.findIndex((b) => b && x < b.getBoundingClientRect().right + 4);
    if (i < 0) i = length - 1;
    setIdx(Math.min(i, code.length, length - 1));
    requestAnimationFrame(syncSelection);
  };

  // The real input selects the active character, so typing replaces it and Backspace removes it
  const syncSelection = () => {
    const el = input.current;
    if (!el || document.activeElement !== el) return;
    const i = Math.min(idx, code.length, length - 1);
    if (i < code.length) el.setSelectionRange(i, i + 1);
    else el.setSelectionRange(i, i);
  };
  useLayoutEffect(syncSelection);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // The ring glides to the active box
  const place = () => {
    const r = ring.current;
    const box = boxes.current[active];
    if (!r || !box) return;
    const first = !r.dataset.ready;
    if (first) r.style.transition = "none";
    r.style.width = `${box.offsetWidth}px`;
    r.style.height = `${box.offsetHeight}px`;
    r.style.transform = `translate(${box.offsetLeft}px, ${box.offsetTop}px)`;
    if (first) {
      r.dataset.ready = "1";
      void r.offsetWidth;
      r.style.transition = "";
    }
  };
  useLayoutEffect(place);
  useEffect(() => {
    const s = slots.current;
    if (!s) return;
    const ro = new ResizeObserver(place);
    ro.observe(s);
    return () => ro.disconnect();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // A calm shake when an error appears
  const hadError = useRef(showError);
  useEffect(() => {
    if (showError && !hadError.current && !reduced()) {
      slots.current?.animate(
        [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(2px)" }, { transform: "none" }],
        { duration: 420, easing: "ease-out" },
      );
    }
    hadError.current = showError;
  }, [showError]);

  const cells: ReactNode[] = [];
  for (let i = 0; i < length; i++) {
    if (sepAt && i === sepAt) cells.push(<span key="sep" className="ui-code__sep" />);
    const ch = code[i];
    cells.push(
      <span key={i} ref={(el) => { boxes.current[i] = el; }} className="ui-code__box" data-filled={ch ? "" : undefined}>
        {ch && <span key={stamps.current[i]} className="ui-code__char" style={{ animationDelay: `${delays.current[i] ?? 0}ms` }}>{ch}</span>}
      </span>,
    );
  }

  return (
    <div className={["ui-code", className].filter(Boolean).join(" ")} data-error={showError || undefined}>
      <style href="ui-code-input" precedence="default">{css}</style>
      <div ref={slots} className="ui-code__slots" dir="ltr" style={{ "--n": length, "--sep-w": sepAt ? "calc(var(--ui-code-gap) + 8px)" : "0px" } as CSSProperties}>
        {cells}
        <span ref={ring} className="ui-code__ring" data-show={showRing || undefined} aria-hidden="true">
          <span className="ui-code__caret" data-show={(focused && !code[active]) || undefined} />
        </span>
        <input
          ref={input}
          id={id}
          className="ui-code__input"
          type="text"
          value={code}
          inputMode={numeric ? "numeric" : "text"}
          pattern={numeric ? "[0-9]*" : undefined}
          autoComplete="one-time-code"
          autoCapitalize={numeric ? "off" : "characters"}
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label={`${label}, ${length} ${numeric ? "digits" : "characters"}`}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${id}-msg` : undefined}
          onChange={(e) => onInput(e.currentTarget)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onFocus={() => { setFocused(true); requestAnimationFrame(syncSelection); }}
          onBlur={() => setFocused(false)}
          onPointerUp={(e) => pick(e.clientX)}
          onSelect={(e) => {
            // A native caret move (long press, mouse drag) snaps back to a single box
            const el = e.currentTarget;
            const want = active < code.length ? [active, active + 1] : [active, active];
            if (el.selectionStart !== want[0] || el.selectionEnd !== want[1]) syncSelection();
          }}
        />
      </div>

      {/* The error message grows in below and folds away once it's gone */}
      <div className="ui-code__msg" data-show={showError || undefined}>
        <div className="ui-code__msg-inner">
          <p id={`${id}-msg`} className="ui-ob-error ui-code__msg-text" aria-live="polite">{error}</p>
        </div>
      </div>
    </div>
  );
}

const css = /* css */ `
.ui-code { --ui-code-box: 40px; --ui-code-gap: 8px; --ui-code-ease: cubic-bezier(0.22, 1, 0.36, 1); --ui-code-danger: #dc2626; container-type: inline-size; display: grid; width: 100%; }
/* The boxes scale down to fit (phones at 320px), up to --ui-code-box */
.ui-code__slots {
  --size: min(var(--ui-code-box), calc((100cqi - 8px - (var(--n) - 1) * var(--ui-code-gap) - var(--sep-w)) / var(--n)));
  position: relative; display: flex; align-items: center; justify-content: center; gap: var(--ui-code-gap); padding: 4px 0;
}
/* Our field: the card's surface, a ring and a soft shadow */
.ui-code__box {
  position: relative; display: grid; place-items: center; flex: none; width: var(--size); height: calc(var(--size) * 1.1); overflow: hidden;
  border-radius: calc(10px * var(--squircle-factor, 1)); background: var(--card); box-shadow: 0 0 0 1px var(--line-strong), var(--shadow);
  color: var(--ink); font-size: min(16px, calc(var(--size) * 0.4)); font-weight: 500; font-variant-numeric: tabular-nums;
  transition: box-shadow 220ms ease, color 220ms ease;
}
.ui-code__sep { flex: none; width: 8px; height: 1.5px; border-radius: 1px; background: var(--muted); opacity: 0.6; }
.ui-code__char { display: block; animation: ui-code-pop 280ms var(--ui-code-ease) both; }
/* The fields' focus ring, gliding from box to box; a caret blinks in an empty one */
.ui-code__ring {
  position: absolute; top: 0; left: 0; z-index: 1; display: grid; place-items: center; border-radius: calc(10px * var(--squircle-factor, 1));
  box-shadow: 0 0 0 1px var(--ink), 0 0 0 4px var(--select); opacity: 0; pointer-events: none;
  transition: transform 260ms var(--ui-code-ease), width 260ms var(--ui-code-ease), opacity 180ms ease, box-shadow 220ms ease;
}
.ui-code__ring[data-show] { opacity: 1; }
.ui-code__caret { width: 1.5px; height: 18px; max-height: 42%; border-radius: 1px; background: var(--ink); opacity: 0; }
.ui-code__caret[data-show] { animation: ui-code-blink 1.1s ease-in-out infinite; }
/* The real input lies over the boxes, invisible – it takes taps, keys, paste and SMS autofill */
.ui-code__input {
  position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; outline: none; background: transparent;
  color: transparent; -webkit-text-fill-color: transparent; caret-color: transparent; font-size: 16px; letter-spacing: -1em; cursor: text; appearance: none;
}
.ui-code__input::selection { background: transparent; }
.ui-code__input:-webkit-autofill { -webkit-box-shadow: 0 0 0 100px transparent inset; transition: background-color 9999s; }
/* Error: the fields' red ring, red characters */
.ui-code[data-error] .ui-code__box { box-shadow: 0 0 0 1px var(--ui-code-danger), 0 0 0 4px rgba(220, 38, 38, 0.1); color: var(--ui-code-danger); }
.ui-code[data-error] .ui-code__ring { box-shadow: 0 0 0 1px var(--ui-code-danger), 0 0 0 4px rgba(220, 38, 38, 0.18); }
.ui-code[data-error] .ui-code__caret { background: var(--ui-code-danger); }
.ui-code__msg { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 300ms var(--ui-code-ease); }
.ui-code__msg[data-show] { grid-template-rows: 1fr; }
.ui-code__msg-inner { min-height: 0; overflow: hidden; }
.ui-code__msg-text { margin: 0; padding-top: 8px; text-align: center; text-wrap: balance; opacity: 0; transform: translateY(-4px); transition: opacity 200ms ease, transform 300ms var(--ui-code-ease); }
.ui-code__msg[data-show] .ui-code__msg-text { opacity: 1; transform: none; transition-delay: 60ms; }
:where(.dark, [data-theme="dark"]) .ui-code { --ui-code-danger: #ff6369; }
@keyframes ui-code-pop { from { opacity: 0; transform: translateY(4px) scale(0.7); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes ui-code-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@container (max-width: 340px) { .ui-code__slots { --ui-code-gap: 6px; } .ui-code__sep { width: 6px; } }
@media (prefers-reduced-motion: reduce) { .ui-code *, .ui-code *::before, .ui-code *::after { animation: none !important; transition: none !important; } .ui-code__caret[data-show] { opacity: 1; } }
`;
