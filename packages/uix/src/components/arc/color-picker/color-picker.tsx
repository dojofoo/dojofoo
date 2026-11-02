"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { Transition } from "motion/react";
import { Check, Pipette } from "lucide-react";
import { spring as motionSpring } from "../../../lib/springs";
import { Button } from "../../button";
import { cn } from "../../../lib/utils";


const rootClassName = "relative inline-block font-(family-name:--font) text-(length:--fs-body) tracking-normal text-(--fluid-foreground)";
const thumbClassName = "absolute size-[22px] -translate-1/2 cursor-grab rounded-full [corner-shape:round] shadow-[0_0_0_3px_#fff,0_2px_8px_#0005,inset_0_0_0_1px_#0002] transition-[scale] duration-80 data-[active]:scale-120 data-[active]:cursor-grabbing motion-reduce:transition-none";
const colorTextClassName = "px-2.5 font-inherit text-(length:--fs-caption) tabular-nums";

export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

/** Color picker with direct format switching, keyboard controls and an optional eyedropper. */
export interface ColorPickerProps {
  /** A small swatch trigger, for card corners and compact toolbars. */
  compact?: boolean;
  disabled?: boolean;
  /** Keep the floating picker outside scrolling and clipping ancestors. */
  portal?: boolean;
  /** Commit a selection when Apply, Escape, or outside-click closes the picker. */
  onValueCommit?: (hex: string) => void;
  /** Any color the picker can read: hex, rgb(), hsl(), or oklch(). */
  value?: string;
  defaultValue?: string;
  /** Receives the selected opaque color as hex. */
  onValueChange?: (hex: string) => void;
  /** Name shown on the swatch, such as "Accent". */
  label?: string;
  defaultFormat?: ColorFormat;
  className?: string;
}

export type Hsva = { h: number; s: number; v: number; a: number };
type Rgba = { r: number; g: number; b: number; a: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 0) => { const f = 10 ** digits; return Math.round(value * f) / f; };
const thumbSpring = motionSpring.fast;
const dragSpring: Transition = { duration: 0 };
const openSpring = motionSpring.fast, closeSpring = motionSpring.fast.exit;

/* Color math. sRGB channels are 0 to 1. */
function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: f(5), g: f(3), b: f(1), a };
}
function rgbToHsv({ r, g, b, a }: Rgba, hue = 0): Hsva {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = hue;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a };
}
function hslToRgb(h: number, s: number, l: number, a: number): Rgba {
  const k = (n: number) => (n + h / 30) % 12, c = s * Math.min(l, 1 - l);
  const f = (n: number) => l - c * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4), a };
}
function rgbToHsl({ r, g, b }: Rgba, hue: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: d < 1e-6 ? hue : rgbToHsv({ r, g, b, a: 1 }).h, s, l };
}
const toLinear = (c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const fromLinear = (c: number) => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;
function rgbToOklch({ r, g, b }: Rgba, hue: number) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(.4122214708 * lr + .5363325363 * lg + .0514459929 * lb);
  const m = Math.cbrt(.2119034982 * lr + .6806995451 * lg + .1073969566 * lb);
  const s = Math.cbrt(.0883024619 * lr + .2817188376 * lg + .6299787005 * lb);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  const C = Math.hypot(A, B);
  let H = Math.atan2(B, A) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: C < .0005 ? hue : H };
}
function oklchToRgb(L: number, C: number, H: number, a: number): Rgba {
  const A = C * Math.cos(H * Math.PI / 180), B = C * Math.sin(H * Math.PI / 180);
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3;
  const m = (L - .1055613458 * A - .0638541728 * B) ** 3;
  const s = (L - .0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: clamp(fromLinear(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s)),
    g: clamp(fromLinear(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s)),
    b: clamp(fromLinear(-.0041960863 * l - .7034186147 * m + 1.707614701 * s)),
    a,
  };
}
const byte = (c: number) => Math.round(clamp(c) * 255);
const hex2 = (c: number) => byte(c).toString(16).padStart(2, "0").toUpperCase();

export function toHex(hsva: Hsva) {
  const { r, g, b, a } = hsvToRgb(hsva);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < .999 ? hex2(a) : ""}`;
}
function format(hsva: Hsva, kind: ColorFormat) {
  const rgb = hsvToRgb(hsva);
  const alpha = hsva.a < .999 ? ` / ${Math.round(hsva.a * 100)}%` : "";
  if (kind === "hex") return toHex(hsva);
  if (kind === "rgb") return `rgb(${byte(rgb.r)} ${byte(rgb.g)} ${byte(rgb.b)}${alpha})`;
  if (kind === "hsl") { const { h, s, l } = rgbToHsl(rgb, hsva.h); return `hsl(${Math.round(h) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}%${alpha})`; }
  const { l, c, h } = rgbToOklch(rgb, hsva.h);
  return `oklch(${round(l * 100, 1)}% ${round(c, 3)} ${round(h, 1) % 360}${alpha})`;
}
const readAlpha = (text?: string) => text === undefined ? 1 : text.endsWith("%") ? clamp(parseFloat(text) / 100) : clamp(parseFloat(text));

/** Reads hex, rgb(), hsl(), and oklch() in modern or comma syntax. Returns null for anything else. */
export function parseColor(input: string, hue = 0): Hsva | null {
  const text = input.trim().toLowerCase();
  let match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (match) {
    let digits = match[1]!;
    if (digits.length <= 4) digits = digits.split("").map(d => d + d).join("");
    const n = (i: number) => parseInt(digits.slice(i, i + 2), 16) / 255;
    return rgbToHsv({ r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) : 1 }, hue);
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (match) return rgbToHsv({ r: clamp(+match[1]! / 255), g: clamp(+match[2]! / 255), b: clamp(+match[3]! / 255), a: readAlpha(match[4]) }, hue);
  match = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (match) {
    const h = +match[1]! % 360;
    const next = rgbToHsv(hslToRgb(h, clamp(+match[2]! / 100), clamp(+match[3]! / 100), readAlpha(match[4])), h);
    return { ...next, h };
  }
  match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(text);
  if (match) {
    const L = match[2] ? +match[1]! / 100 : +match[1]!;
    return rgbToHsv(oklchToRgb(clamp(L), +match[3]!, +match[4]!, readAlpha(match[5])), hue);
  }
  return null;
}

const formats: ColorFormat[] = ["hex", "rgb", "hsl", "oklch"];
const formatNames: Record<ColorFormat, string> = { hex: "Hex", rgb: "RGB", hsl: "HSL", oklch: "OKLCH" };

const subscribe = () => () => {};
function useHydrated() { return useSyncExternalStore(subscribe, () => true, () => false); }
function useEyeDropper() { return useSyncExternalStore(subscribe, () => "EyeDropper" in window, () => false); }
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** Springs a motion value to a new target, or jumps under reduced motion. Retargeting keeps the current velocity. */
function useFollow(target: number, reduced: boolean, dragging = false) {
  const value = useMotionValue(target);
  useEffect(() => {
    if (reduced) { value.jump(target); return; }
    const controls = animate(value, target, dragging ? dragSpring : thumbSpring);
    return () => controls.stop();
  }, [dragging, reduced, target, value]);
  return value;
}

/** Tracks a pointer drag over an element and reports its position as fractions of the element's box. */
function usePad(onMove: (x: number, y: number) => void, onActive: (active: boolean) => void) {
  const pointer = useRef<number | null>(null);
  const read = (event: ReactPointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onMove(clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height));
  };
  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || pointer.current !== null) return;
      pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      onActive(true);
      read(event);
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) { if (event.pointerId === pointer.current) read(event); },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) { if (event.pointerId !== pointer.current) return; pointer.current = null; onActive(false); },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) { if (event.pointerId !== pointer.current) return; pointer.current = null; onActive(false); },
  };
}

/** Arrow keys step by a small amount, Shift by ten, Page keys by ten, Home and End to the ends. */
function stepFor(event: ReactKeyboardEvent, axis: "x" | "y" | "both") {
  const big = event.shiftKey || event.key.startsWith("Page");
  const size = big ? 10 : 1;
  const map: Record<string, [number, number]> = {
    ArrowRight: [size, 0], ArrowLeft: [-size, 0], ArrowUp: axis === "both" ? [0, size] : [size, 0], ArrowDown: axis === "both" ? [0, -size] : [-size, 0],
    PageUp: [10, 0], PageDown: [-10, 0],
  };
  return map[event.key] ?? null;
}

interface SliderProps { label: string; value: number; valueText: string; max: number; unit: number; onChange: (value: number) => void; className?: string; style?: CSSProperties; reduced: boolean; fill: string; onActive: (active: boolean) => void; active: boolean }
function Slider({ label, value, valueText, max, unit, onChange, className, style, reduced, fill, onActive, active }: SliderProps) {
  const x = useFollow(value / max, reduced, active);
  const left = useTransform(x, v => `${v * 100}%`);
  const pad = usePad(fx => onChange(fx * max), onActive);
  return <div className={cn("relative mx-[11px] h-3.5 touch-none cursor-pointer rounded-full [corner-shape:round] before:absolute before:inset-y-0 before:-inset-x-[11px] before:rounded-full before:[corner-shape:round] before:bg-(image:--track) before:shadow-[inset_0_0_0_1px_#0001]", className)} style={style} {...pad}>
    <motion.div className={cn(thumbClassName, "top-1/2")} role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-valuetext={valueText}
      style={{ left, background: fill }} data-active={active || undefined}
      onKeyDown={event => {
        if (event.key === "Home" || event.key === "End") { event.preventDefault(); onChange(event.key === "Home" ? 0 : max); return; }
        const step = stepFor(event, "x");
        if (!step) return;
        event.preventDefault();
        onChange(clamp(value + step[0] * unit, 0, max));
      }} />
  </div>;
}

function Chip({ color, className }: { color: string; className?: string }) {
  return <span className={cn("relative block size-8 shrink-0 overflow-hidden rounded-full [corner-shape:round] bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-size-[10px_10px] dark:bg-[repeating-conic-gradient(#555_0_25%,#333_0_50%)]", className)}><span className="absolute inset-0 rounded-full [corner-shape:round] shadow-[inset_0_0_0_1px_#0002]" style={{ background: color }} /></span>;
}

export function ColorPicker({
  value, defaultValue = "#2F6BFF", onValueChange, label = "Color",
  defaultFormat = "hex", className, compact = false, disabled = false, portal = false, onValueCommit,
}: ColorPickerProps) {
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const hydrated = useHydrated();
  const reduced = !!useReducedMotion() && hydrated;
  const canPick = useEyeDropper();

  const [hsva, setHsva] = useState<Hsva>(() => parseColor(value ?? defaultValue) ?? { h: 220, s: .8, v: 1, a: 1 });
  const [synced, setSynced] = useState(value);
  if (value !== undefined && value !== synced) {
    setSynced(value);
    if (value.toUpperCase() !== toHex(hsva)) { const next = parseColor(value, hsva.h); if (next) setHsva(next); }
  }
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [kind, setKind] = useState<ColorFormat>(defaultFormat);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [active, setActive] = useState<"area" | "hue" | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const areaThumb = useRef<HTMLDivElement>(null);
  /** Whether the panel is meant to be open right now, read when a closing animation finishes. */
  const openNow = useRef(false);
  const openedColor = useRef<string>("");

  const hex = toHex(hsva);
  const rgb = hsvToRgb(hsva);
  const css = `rgb(${byte(rgb.r)} ${byte(rgb.g)} ${byte(rgb.b)} / ${round(hsva.a, 3)})`;
  const opaque = `rgb(${byte(rgb.r)} ${byte(rgb.g)} ${byte(rgb.b)})`;
  const pure = `hsl(${hsva.h} 100% 50%)`;
  const text = format(hsva, kind);

  function commit(next: Hsva) {
    const opaque = { ...next, a: 1 };
    setHsva(opaque);
    const nextHex = toHex(opaque);
    if (nextHex !== hex) onValueChange?.(nextHex);
  }

  // Shared Fluid fast entrance, with a quicker exit. Reduced motion fades only.
  const progress = useMotionValue(0), fade = useMotionValue(0);
  const panelScale = useTransform(progress, [0, 1], [.96, 1]);
  useLayoutEffect(() => {
    if (!shown) return;
    const panel = panelRef.current, trigger = triggerRef.current;
    if (!panel || !trigger) return;
    const measure = () => {
      if (portal) {
        const box = trigger.getBoundingClientRect();
        const left = Math.max(8, Math.min(box.left, window.innerWidth - panel.offsetWidth - 8));
        const top = Math.max(8, Math.min(box.top, window.innerHeight - panel.offsetHeight - 8));
        setPosition(current => current.left === left && current.top === top ? current : { left, top });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("scroll", measure, true); };
  }, [shown, portal]);

  useEffect(() => {
    if (!shown) return;
    if (reduced) {
      progress.jump(open ? 1 : progress.get());
      const controls = animate(fade, open ? 1 : 0, open ? motionSpring.fast : motionSpring.fast.exit);
      controls.then(() => { if (!openNow.current) { progress.jump(0); setShown(false); } });
      return () => controls.stop();
    }
    fade.jump(1);
    const controls = animate(progress, open ? 1 : 0, open ? openSpring : closeSpring);
    if (!open) controls.then(() => { if (!openNow.current) setShown(false); });
    return () => controls.stop();
  }, [fade, open, progress, reduced, shown]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => areaThumb.current?.focus({ preventScroll: true }));
  }, [open]);

  function show() { if (disabled) return; openedColor.current = hex; openNow.current = true; setShown(true); setOpen(true); }
  function hide(returnFocus = true) {
    const parsed = draft === null ? null : parseColor(draft, hsva.h);
    const selected = parsed ? toHex({ ...parsed, a: 1 }) : hex;
    if (openNow.current && !disabled && selected !== openedColor.current) onValueCommit?.(selected);
    openNow.current = false;
    setOpen(false); setDraft(null); setInvalid(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  const dismiss = useEffectEvent((event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (event.key !== "Escape") return;
      hide(!!rootRef.current?.contains(document.activeElement) || !!panelRef.current?.contains(document.activeElement));
      return;
    }
    if (!rootRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) hide(false);
  });
  useEffect(() => {
    if (!open) return;
    const listener = (event: Event) => dismiss(event);
    document.addEventListener("pointerdown", listener, true);
    document.addEventListener("keydown", listener);
    return () => { document.removeEventListener("pointerdown", listener, true); document.removeEventListener("keydown", listener); };
  }, [open]);

  // The saturation and brightness area.
  const areaX = useFollow(hsva.s, reduced, active === "area"), areaY = useFollow(1 - hsva.v, reduced, active === "area");
  const areaLeft = useTransform(areaX, v => `${v * 100}%`), areaTop = useTransform(areaY, v => `${v * 100}%`);
  const areaPad = usePad((x, y) => commit({ ...hsva, s: x, v: 1 - y }), on => setActive(on ? "area" : null));

  function cycleFormat() {
    const next = formats[(formats.indexOf(kind) + 1) % formats.length]!;
    setKind(next); setDraft(null); setInvalid(false);
  }

  function submitDraft() {
    if (draft === null) return true;
    const next = parseColor(draft, hsva.h);
    if (!next) {
      setInvalid(true);
      return false;
    }
    commit(next); setDraft(null); setInvalid(false);
    return true;
  }

  function pickFromScreen() {
    if (!canPick) return;
    const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper;
    new Ctor().open().then(result => { const next = parseColor(result.sRGBHex, hsva.h); if (next) commit({ ...next, a: hsva.a }); }).catch(() => {});
  }

  const style = { "--picker-color": css, "--picker-opaque": opaque, "--picker-hue": pure } as CSSProperties;

  const floating = shown && <div className="pointer-events-none absolute -top-px -left-px z-20 drop-shadow-xl data-[open]:pointer-events-auto" data-open={open || undefined}
    style={portal ? { position: "fixed", left: position.left, top: position.top, zIndex: 100 } : undefined}>
      <motion.div ref={panelRef} id={`${uid}-panel`} role="dialog" aria-label={`${label} picker`} className="w-[min(19rem,calc(100vw-32px))] rounded-lg border border-(--fluid-hairline) bg-(--surface-3) pb-3.5 text-(--fluid-foreground) will-change-[transform,opacity]" inert={!open} style={{ opacity: reduced ? fade : progress, scale: reduced ? 1 : panelScale, transformOrigin: "top left" }}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-3 pt-3">
          <div className="group relative h-[148px] touch-none cursor-crosshair rounded-md [background:linear-gradient(to_top,#000,transparent),linear-gradient(to_right,#fff,transparent),var(--picker-hue)] shadow-[inset_0_0_0_1px_#0001]" data-active={active === "area" || undefined} {...areaPad}>
            <motion.div ref={areaThumb} className={cn(thumbClassName, "bg-(--picker-opaque) group-data-[active]:scale-120 group-data-[active]:cursor-grabbing")} role="slider" tabIndex={0} aria-roledescription="2D slider"
              aria-label="Saturation and brightness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsva.s * 100)}
              aria-valuetext={`Saturation ${Math.round(hsva.s * 100)}%, brightness ${Math.round(hsva.v * 100)}%`}
              style={{ left: areaLeft, top: areaTop }}
              onKeyDown={event => {
                const step = stepFor(event, "both");
                if (!step) return;
                event.preventDefault();
                commit({ ...hsva, s: clamp(hsva.s + step[0] / 100), v: clamp(hsva.v + step[1] / 100) });
              }} />
          </div>

          <Slider label="Hue" value={hsva.h} valueText={`${Math.round(hsva.h)} degrees`} max={360} unit={1} className="[--track:linear-gradient(to_right,#f00_11px,#ff0_calc(11px_+_(100%_-_22px)*.1666),#0f0_calc(11px_+_(100%_-_22px)*.3333),#0ff_50%,#00f_calc(11px_+_(100%_-_22px)*.6666),#f0f_calc(11px_+_(100%_-_22px)*.8333),#f00_calc(100%_-_11px))]" reduced={reduced} fill={pure}
            onChange={h => commit({ ...hsva, h: clamp(h, 0, 359.9) })} active={active === "hue"} onActive={on => setActive(on ? "hue" : null)} />
          <div className="mt-0.5 flex h-8 items-stretch overflow-hidden rounded-md border border-(--fluid-hairline) bg-(--surface-2) transition-colors duration-80 data-[invalid]:border-(--danger)" data-invalid={invalid || undefined}>
            <button type="button" className="flex min-w-14 cursor-pointer items-center justify-center border-0 border-r border-(--fluid-hairline) bg-transparent px-2.5 font-inherit text-(length:--fs-caption) font-medium text-(--fluid-foreground) transition-colors duration-80 hover:bg-(--fluid-hover)" onClick={cycleFormat} aria-label={`Format: ${formatNames[kind]}. Switch format`}>
              {formatNames[kind]}
            </button>
            <span className="relative flex min-w-0 flex-1">
              <input className={cn(colorTextClassName, "w-full min-w-0 border-0 bg-transparent text-(--fluid-foreground) caret-(--fluid-foreground)")} value={draft ?? text} spellCheck={false} autoComplete="off" aria-label={`${label} in ${formatNames[kind]}`}
                aria-invalid={invalid || undefined} aria-describedby={invalid ? `${uid}-error` : undefined}
                onChange={event => { setDraft(event.target.value); setInvalid(false); }}
                onKeyDown={event => {
                  if (event.key === "Enter") { event.preventDefault(); if (submitDraft()) event.currentTarget.select(); }
                  if (event.key === "Escape" && draft !== null) { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); setDraft(null); setInvalid(false); }
                }}
                onBlur={() => { if (!submitDraft()) { setDraft(null); setInvalid(false); } }} />
            </span>
          </div>
          <p id={`${uid}-error`} className="mx-0.5 -mt-2.5 -mb-1 min-h-0 text-(length:--fs-caption) text-(--danger) empty:hidden" aria-live="polite">{invalid ? "Enter a hex, RGB, HSL, or OKLCH color" : ""}</p>

          <div className="flex items-center justify-end gap-1.5">
            {canPick && <Button variant="secondary" size="sm" className="rounded-full! [corner-shape:round]!" aria-label="Pick a color from the screen" icon={<Pipette size={15} strokeWidth={1.75} aria-hidden="true" />} onClick={pickFromScreen} />}
            <Button size="sm" icon={<Check size={15} strokeWidth={1.75} aria-hidden="true" />} onClick={() => hide()}>Apply</Button>
          </div>
        </div>
      </motion.div>
    </div>;

  return <div ref={rootRef} className={cn(rootClassName, className)} data-compact={compact || undefined} style={style}>
    <button ref={triggerRef} type="button" className={cn("flex h-11 cursor-pointer items-center gap-2.5 rounded-full border border-(--fluid-hairline) bg-(--surface-3) py-1.5 pr-4 pl-1.5 font-inherit text-inherit [corner-shape:round] transition-colors duration-80 hover:border-(--fluid-muted) disabled:cursor-default disabled:opacity-45", compact && "size-7 gap-0 p-1")} disabled={disabled} aria-label={label} title={hex} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${uid}-panel` : undefined}
      onClick={() => open ? hide() : show()}>
      <Chip color={css} className={compact ? "size-[18px]" : undefined} />
      <span className={cn("grid min-w-0 text-start leading-[1.15]", compact && "hidden")}><span className="text-(length:--fs-caption) text-(--fluid-muted)">{label}</span><span className="text-(length:--fs-body) font-medium tabular-nums">{hex}</span></span>
    </button>

    {portal && shown ? createPortal(<div className={cn("ui-as", rootClassName, "contents", className)} style={style}>{floating}</div>, document.body) : floating}
  </div>;
}

export default ColorPicker;
