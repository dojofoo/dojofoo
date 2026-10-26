"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Camera, Check, CircleAlert, ImagePlus, Minus, Plus } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./avatar-upload.module.css";

export type AvatarUploadErrorCode = "type" | "size" | "decode" | "upload";
export interface AvatarUploadContext {
  /** Report progress from 0 to 1. Until you call it, the ring spins without a value. */
  report: (progress: number) => void;
  signal: AbortSignal;
  original: File;
}
export interface AvatarUploadProps {
  name: string;
  src?: string;
  /** Receives the cropped square image. Resolve with its stored URL, or nothing to keep the local crop. */
  onUpload: (image: Blob, context: AvatarUploadContext) => Promise<string | void>;
  onRemove?: () => void;
  onError?: (error: { code: AvatarUploadErrorCode; message: string }) => void;
  accept?: string[];
  maxSize?: number;
  size?: number;
  outputSize?: number;
  label?: string;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}
export interface AvatarUploadHandle { open: () => void; selectFile: (file: File) => void; }
type Phase = "idle" | "crop" | "uploading" | "failed";
type Draft = { url: string; file: File; width: number; height: number };
type View = { zoom: number; x: number; y: number };
type Pending = { url: string; blob: Blob; original: File };
type Message = { tone: "hint" | "error" | "success"; text: ReactNode; key: string };
const MAX_ZOOM = 4, CROP = 184;
const typeNames: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WebP", "image/gif": "GIF", "image/avif": "AVIF", "image/heic": "HEIC" };
const listNames = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${Number((bytes / 1024 / 1024).toFixed(1))} MB` : `${Math.round(bytes / 1024)} KB`;
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Arc UI's supplied avatar uploader: pick/drop, crop, zoom, progress, cancel and retry. */
export const AvatarUpload = forwardRef<AvatarUploadHandle, AvatarUploadProps>(function AvatarUpload({
  name, src, onUpload, onRemove, onError, accept = ["image/png", "image/jpeg", "image/webp"], maxSize = 5 * 1024 * 1024,
  size = 88, outputSize = 512, label = "Profile photo", hint, disabled, className, style,
}, ref) {
  const reduced = !!useReducedMotion();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(src);
  const [seenSrc, setSeenSrc] = useState(src);
  if (src !== seenSrc) { setSeenSrc(src); setCurrent(src); }
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false);
  const [preview, setPreview] = useState<Pending | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [settled, setSettled] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [imageFailed, setImageFailed] = useState<string>();
  const typeList = listNames(accept.map(type => typeNames[type] ?? type.replace(/^image\//, "").toUpperCase()));
  const defaultHint = hint ?? `${typeList}, up to ${formatSize(maxSize)}`;
  const owned = useRef(new Set<string>());
  const release = useCallback((url?: string | null) => { if (url && owned.current.has(url)) { URL.revokeObjectURL(url); owned.current.delete(url); } }, []);
  useEffect(() => { const urls = owned.current; return () => urls.forEach(url => URL.revokeObjectURL(url)); }, []);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const messageTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(messageTimer.current), []);
  const currentRef = useRef(current);
  useLayoutEffect(() => { currentRef.current = current; });
  function flash(next: Message, ms: number) {
    window.clearTimeout(messageTimer.current); setMessage(next);
    messageTimer.current = window.setTimeout(() => setMessage(null), ms);
  }
  const fail = useCallback((code: AvatarUploadErrorCode, text: string) => {
    window.clearTimeout(messageTimer.current);
    setMessage({ tone: "error", text, key: `${code}:${text}:${Date.now()}` });
    onError?.({ code, message: text });
  }, [onError]);
  const selectFile = useCallback((file: File) => {
    if (disabled || phase === "uploading") return;
    if (!accept.includes(file.type)) {
      const extension = file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "";
      fail("type", `${extension ? `${extension} files aren’t supported` : "That file isn’t an image"}. Choose a ${typeList}.`); return;
    }
    if (file.size > maxSize) { fail("size", `That photo is ${formatSize(file.size)}. Choose one up to ${formatSize(maxSize)}.`); return; }
    const url = URL.createObjectURL(file); owned.current.add(url);
    const image = new Image();
    image.onload = () => {
      setDraft(previous => { release(previous?.url); return { url, file, width: image.naturalWidth, height: image.naturalHeight }; });
      setView({ zoom: 1, x: 0, y: 0 }); setMessage(null); setPhase("crop");
    };
    image.onerror = () => { release(url); fail("decode", "That image couldn’t be opened. Try another file."); };
    image.src = url;
  }, [accept, disabled, fail, maxSize, phase, release, typeList]);
  const open = useCallback(() => { if (!disabled && phase !== "uploading") inputRef.current?.click(); }, [disabled, phase]);
  useImperativeHandle(ref, () => ({ open, selectFile }), [open, selectFile]);

  // Pan offsets are in circle diameters; zoom stays anchored under the pointer.
  const ratio = draft ? { w: draft.width / Math.min(draft.width, draft.height), h: draft.height / Math.min(draft.width, draft.height) } : { w: 1, h: 1 };
  const limits = useCallback((zoom: number) => ({ x: Math.max(0, (ratio.w * zoom - 1) / 2), y: Math.max(0, (ratio.h * zoom - 1) / 2) }), [ratio.w, ratio.h]);
  const settle = useCallback((next: View): View => { const max = limits(next.zoom); return { zoom: next.zoom, x: clamp(next.x, -max.x, max.x), y: clamp(next.y, -max.y, max.y) }; }, [limits]);
  const stretch = useCallback((next: View): View => {
    const max = limits(next.zoom);
    const band = (value: number, limit: number) => { const over = Math.abs(value) - limit; return over <= 0 ? value : Math.sign(value) * (limit + (.25 * over) / (over + .25)); };
    return { zoom: next.zoom, x: band(next.x, max.x), y: band(next.y, max.y) };
  }, [limits]);
  const zoomAround = useCallback((base: View, zoom: number, anchor = { x: 0, y: 0 }) => {
    const next = clamp(zoom, 1, MAX_ZOOM), scale = next / base.zoom;
    return settle({ zoom: next, x: anchor.x - (anchor.x - base.x) * scale, y: anchor.y - (anchor.y - base.y) * scale });
  }, [settle]);
  const viewRef = useRef(view);
  useLayoutEffect(() => { viewRef.current = view; });
  const springBack = useRef<{ stop: () => void } | null>(null);
  function springToBounds() {
    const from = viewRef.current, to = settle(from);
    if (from.x === to.x && from.y === to.y) return;
    if (reduced) { setView(to); return; }
    springBack.current = animate(0, 1, { ...motionTokens.spring.smooth, onUpdate: t => setView({ zoom: to.zoom, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }) });
  }
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; center: { x: number; y: number }; distance: number } | null>(null);
  const toCircle = (x: number, y: number) => {
    const box = circleRef.current!.getBoundingClientRect();
    return { x: (x - box.left - box.width / 2) / box.width, y: (y - box.top - box.height / 2) / box.height };
  };
  function snapshot() {
    const points = Array.from(pointers.current.values());
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
    const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    gesture.current = { view: viewRef.current, center, distance };
  }
  function onStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "crop" || event.button !== 0) return;
    springBack.current?.stop(); event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); snapshot(); setInteracting(true);
  }
  function onStagePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current || !circleRef.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointers.current.values());
    const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
    const diameter = circleRef.current.getBoundingClientRect().width, start = gesture.current;
    let next: View = { zoom: start.view.zoom, x: start.view.x + (center.x - start.center.x) / diameter, y: start.view.y + (center.y - start.center.y) / diameter };
    if (points.length > 1 && start.distance > 0) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      next = zoomAround(next, start.view.zoom * distance / start.distance, toCircle(center.x, center.y));
    }
    setView(stretch(next));
  }
  function onStagePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size) { snapshot(); return; }
    gesture.current = null; setInteracting(false); springToBounds();
  }
  const wheelEnd = useRef<number | undefined>(undefined);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || phase !== "crop") return;
    function onWheel(event: WheelEvent) {
      event.preventDefault(); springBack.current?.stop();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0022));
      setView(base => zoomAround(settle(base), base.zoom * factor, toCircle(event.clientX, event.clientY)));
      setInteracting(true); window.clearTimeout(wheelEnd.current);
      wheelEnd.current = window.setTimeout(() => setInteracting(false), 260);
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => { stage.removeEventListener("wheel", onWheel); window.clearTimeout(wheelEnd.current); };
  }, [phase, settle, zoomAround]);
  function onStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? .1 : .02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { event.preventDefault(); const [dx, dy] = moves[event.key]; setView(base => settle({ ...base, x: base.x + dx, y: base.y + dy })); }
    else if (event.key === "+" || event.key === "=") { event.preventDefault(); setView(base => zoomAround(base, base.zoom + .2)); }
    else if (event.key === "-" || event.key === "_") { event.preventDefault(); setView(base => zoomAround(base, base.zoom - .2)); }
    else if (event.key === "0") { event.preventDefault(); setView({ zoom: 1, x: 0, y: 0 }); }
    else if (event.key === "Enter") { event.preventDefault(); void save(); }
    else if (event.key === "Escape") { event.preventDefault(); cancelCrop(); }
  }
  useEffect(() => { if (phase === "crop") circleRef.current?.focus({ preventScroll: true }); }, [phase]);
  function cancelCrop() {
    release(draft?.url); setDraft(null); setPhase("idle");
    requestAnimationFrame(() => primaryRef.current?.focus({ preventScroll: true }));
  }
  async function crop(): Promise<Blob | null> {
    if (!draft) return null;
    const image = new Image(); image.src = draft.url;
    await image.decode().catch(() => undefined);
    const base = Math.min(draft.width, draft.height), { zoom, x, y } = settle(viewRef.current), side = base / zoom;
    const sx = draft.width / 2 - x * side - side / 2, sy = draft.height / 2 - y * side - side / 2;
    const canvas = document.createElement("canvas"); canvas.width = outputSize; canvas.height = outputSize;
    const context = canvas.getContext("2d"); if (!context) return null;
    context.imageSmoothingQuality = "high";
    const type = draft.file.type === "image/png" ? "image/png" : "image/jpeg";
    if (type === "image/jpeg") { context.fillStyle = "#fff"; context.fillRect(0, 0, outputSize, outputSize); }
    context.drawImage(image, sx, sy, side, side, 0, 0, outputSize, outputSize);
    return new Promise(resolve => canvas.toBlob(resolve, type, .92));
  }
  async function upload(next: Pending) {
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;
    setPhase("uploading"); setProgress(null); setMessage(null);
    try {
      const stored = await onUpload(next.blob, { report: value => { if (!controller.signal.aborted) setProgress(clamp(value, 0, 1)); }, signal: controller.signal, original: next.original });
      if (controller.signal.aborted) return;
      setProgress(1); await new Promise(resolve => window.setTimeout(resolve, reduced ? 0 : 280));
      if (controller.signal.aborted) return;
      const url = typeof stored === "string" && stored ? stored : next.url;
      if (url !== next.url) release(next.url);
      if (currentRef.current !== url) release(currentRef.current);
      setCurrent(url); setPreview(null); setPhase("idle"); setSettled(count => count + 1);
      flash({ tone: "success", text: "Photo updated", key: `done:${Date.now()}` }, 2600);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase("failed"); fail("upload", error instanceof Error && error.message ? error.message : "Upload failed. Your previous photo is unchanged.");
    }
  }
  async function save() {
    if (!draft || phase !== "crop") return;
    const blob = await crop(); if (!blob) { fail("decode", "That image couldn’t be cropped. Try another file."); return; }
    const url = URL.createObjectURL(blob); owned.current.add(url);
    const next = { url, blob, original: draft.file }; setPreview(next); release(draft.url); setDraft(null); void upload(next);
  }
  function cancelUpload() {
    abortRef.current?.abort(); release(preview?.url); setPreview(null); setPhase("idle");
    flash({ tone: "hint", text: "Upload canceled", key: `cancel:${Date.now()}` }, 2200);
    requestAnimationFrame(() => primaryRef.current?.focus({ preventScroll: true }));
  }
  function remove() {
    release(current); setCurrent(undefined); onRemove?.();
    flash({ tone: "hint", text: "Photo removed", key: `removed:${Date.now()}` }, 2200);
    requestAnimationFrame(() => primaryRef.current?.focus({ preventScroll: true }));
  }
  const depth = useRef(0);
  const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const dropProps = disabled || phase === "uploading" ? {} : {
    onDragEnter: (event: DragEvent) => { if (!carriesFiles(event)) return; event.preventDefault(); depth.current += 1; setDragging(true); },
    onDragOver: (event: DragEvent) => { if (!carriesFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
    onDrop: (event: DragEvent) => { event.preventDefault(); depth.current = 0; setDragging(false); const file = event.dataTransfer.files[0]; if (file) selectFile(file); },
  };
  const cropping = phase === "crop" && !!draft, busy = phase === "uploading" || phase === "failed", diameter = cropping ? CROP : size;
  const imageStyle = (layer: "ghost" | "sharp"): CSSProperties => ({
    width: `${ratio.w * 100}%`, height: `${ratio.h * 100}%`,
    transform: `translate(-50%, -50%) translate(${(view.x / ratio.w) * 100}%, ${(view.y / ratio.h) * 100}%) scale(${view.zoom})`,
    opacity: layer === "ghost" ? (interacting ? .42 : .24) : 1,
  });
  const photo = busy ? preview?.url : current, showPhoto = photo && imageFailed !== photo;
  const layoutTransition = reduced ? { duration: 0 } : motionTokens.spring.smooth;
  const pct = progress === null ? null : Math.round(progress * 100);
  const statusMessage: Message = phase === "uploading"
    ? { tone: "hint", text: <>Uploading{pct === null ? "" : <> <span className={styles.number}>{pct}%</span></>}</>, key: "uploading" }
    : message ?? { tone: "hint", text: defaultHint, key: "hint" };

  return <div className={[styles.root, className].filter(Boolean).join(" ")} style={style} role="group" aria-labelledby={titleId} data-phase={phase} data-dragging={dragging ? "" : undefined} {...dropProps}>
    <input ref={inputRef} className={styles.file} type="file" accept={accept.join(",")} tabIndex={-1} aria-hidden="true" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) selectFile(file); }} />
    <AutoHeight reduced={reduced}>
      <div className={styles.layout} data-mode={cropping ? "crop" : "idle"}>
        <div ref={stageRef} className={styles.stage} onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp}>
          <motion.div className={styles.stageBackdrop} layout initial={false} animate={{ opacity: cropping ? 1 : 0 }} style={{ borderRadius: 26 }} transition={{ layout: layoutTransition, opacity: { duration: reduced ? 0 : motionTokens.duration.standard, ease: [...motionTokens.ease.standard] } }} aria-hidden="true" />
          <motion.div ref={circleRef} layout transition={{ layout: layoutTransition }} className={styles.circle} style={{ width: diameter, height: diameter }} data-busy={busy ? "" : undefined}
            tabIndex={cropping ? 0 : -1} role={cropping ? "group" : undefined} aria-roledescription={cropping ? "crop area" : undefined}
            aria-label={cropping ? `Crop area, zoom ${Math.round(view.zoom * 100)}%. Drag or use the arrow keys to move the photo, plus and minus to zoom, Enter to save, Escape to cancel.` : undefined} onKeyDown={cropping ? onStageKeyDown : undefined}>
            {cropping ? <img className={styles.ghost} src={draft.url} alt="" draggable={false} style={imageStyle("ghost")} /> : null}
            <motion.div className={styles.clip} initial={false} animate={{ scale: busy ? .9 : 1 }} transition={reduced ? { duration: 0 } : busy ? motionTokens.spring.smooth : motionTokens.spring.snappy}>
              <AnimatePresence initial={false}>
                {cropping ? <motion.img key={`draft:${draft.url}`} className={styles.cropImage} src={draft.url} alt="" draggable={false} style={imageStyle("sharp")} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : motionTokens.duration.standard }} />
                  : showPhoto ? <motion.img key={`photo:${photo}`} className={styles.photo} src={photo} alt="" draggable={false} onError={() => setImageFailed(photo)} initial={reduced ? { opacity: 0 } : { opacity: 0, filter: `blur(${motionTokens.blur.soft}px)` }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }} />
                    : <motion.span key="initials" className={styles.initials} style={{ fontSize: Math.round(size * .3) }} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : motionTokens.duration.standard }}>{initialsOf(name)}</motion.span>}
              </AnimatePresence>
            </motion.div>
            {!cropping && !busy ? <button type="button" className={styles.hit} onClick={open} disabled={disabled} aria-label={current ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}><span className={styles.hitIcon} aria-hidden="true">{dragging ? <ImagePlus size={20} strokeWidth={1.75} /> : <Camera size={20} strokeWidth={1.75} />}</span></button> : null}
            {busy ? <ProgressRing progress={progress} failed={phase === "failed"} reduced={reduced} /> : null}
            <SettleRing count={settled} reduced={reduced} />
          </motion.div>
        </div>
        <motion.div layout="position" transition={{ layout: layoutTransition }} className={styles.side}>
          <motion.div key={cropping ? "crop" : "idle"} className={styles.sideContent} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: motionTokens.duration.standard, ease: [...motionTokens.ease.standard] }}>
            <p id={titleId} className={styles.title}>{cropping ? "Adjust photo" : label}</p>
            {cropping ? <>
              <p className={styles.hint}>Drag to reposition. Scroll or pinch to zoom.</p>
              <div className={styles.zoom}>
                <button type="button" className={styles.zoomButton} aria-label="Zoom out" disabled={view.zoom <= 1} onClick={() => setView(base => zoomAround(base, base.zoom - .25))}><Minus size={16} strokeWidth={1.75} aria-hidden="true" /></button>
                <input className={styles.range} type="range" min={1} max={MAX_ZOOM} step={.01} value={view.zoom} aria-label="Zoom" aria-valuetext={`${Math.round(view.zoom * 100)}%`} style={{ "--fill": `${((view.zoom - 1) / (MAX_ZOOM - 1)) * 100}%` } as CSSProperties}
                  onPointerDown={() => setInteracting(true)} onPointerUp={() => setInteracting(false)} onBlur={() => setInteracting(false)} onChange={event => { const next = Number(event.target.value); setView(base => zoomAround(base, next)); }} />
                <button type="button" className={styles.zoomButton} aria-label="Zoom in" disabled={view.zoom >= MAX_ZOOM} onClick={() => setView(base => zoomAround(base, base.zoom + .25))}><Plus size={16} strokeWidth={1.75} aria-hidden="true" /></button>
              </div>
              <div className={styles.actions}><button type="button" className={styles.solid} onClick={() => void save()}>Save photo</button><button type="button" className={styles.ghostButton} onClick={cancelCrop}>Cancel</button></div>
            </> : <>
              <MessageLine message={statusMessage} reduced={reduced} />
              <div className={styles.actions}>
                {phase === "uploading" ? <button type="button" className={styles.outline} onClick={cancelUpload}>Cancel upload</button>
                  : phase === "failed" ? <><button type="button" className={styles.solid} onClick={() => { if (preview) void upload(preview); }}>Try again</button><button type="button" className={styles.ghostButton} onClick={cancelUpload}>Discard</button></>
                    : <>
                      <button ref={primaryRef} type="button" className={styles.outline} onClick={open} disabled={disabled}><span className={styles.stack}><span aria-hidden="true" className={styles.sizer}>Upload photo</span><span aria-hidden="true" className={styles.sizer}>Replace photo</span><span>{current ? "Replace photo" : "Upload photo"}</span></span></button>
                      <AnimatePresence initial={false} mode="popLayout">{current && onRemove ? <motion.button key="remove" type="button" className={styles.ghostButton} onClick={remove} disabled={disabled} initial={{ opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)` }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)` }} transition={{ duration: reduced ? 0 : motionTokens.duration.fast }}>Remove</motion.button> : null}</AnimatePresence>
                    </>}
              </div>
            </>}
          </motion.div>
        </motion.div>
      </div>
    </AutoHeight>
    <span className={styles.srOnly} aria-live="polite">{phase === "uploading" && pct !== null && pct >= 25 ? `Uploading ${Math.floor(pct / 25) * 25}%` : ""}</span>
  </div>;
});

function AutoHeight({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  useEffect(() => {
    const node = inner.current; if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  return <motion.div className={styles.autoHeight} initial={false} animate={{ height }} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}><div ref={inner}>{children}</div></motion.div>;
}
function MessageLine({ message, reduced }: { message: Message; reduced: boolean }) {
  return <div className={styles.message} aria-live="polite"><AnimatePresence initial={false} mode="popLayout">
    <motion.p key={message.key} className={styles.messageText} data-tone={message.tone} initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: `blur(${motionTokens.blur.subtle}px)` }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: 3, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.instant } }} transition={{ duration: reduced ? 0 : motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}>
      {message.tone === "error" ? <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" /> : message.tone === "success" ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : null}<span>{message.text}</span>
    </motion.p>
  </AnimatePresence></div>;
}
function ProgressRing({ progress, failed, reduced }: { progress: number | null; failed: boolean; reduced: boolean }) {
  return <motion.svg className={styles.ring} data-state={failed ? "failed" : progress === null ? "waiting" : "progress"} viewBox="0 0 100 100" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : motionTokens.duration.fast }}>
    <circle className={styles.ringTrack} cx="50" cy="50" r="48" pathLength={1} /><motion.circle className={styles.ringValue} cx="50" cy="50" r="48" initial={{ pathLength: 0 }} animate={{ pathLength: progress === null ? .22 : Math.max(.02, progress) }} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth} />
  </motion.svg>;
}
function SettleRing({ count, reduced }: { count: number; reduced: boolean }) {
  if (!count || reduced) return null;
  return <motion.svg key={count} className={styles.ring} data-state="settle" viewBox="0 0 100 100" aria-hidden="true" initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.12 }} transition={{ duration: motionTokens.duration.considered, ease: [...motionTokens.ease.enter] }}><circle className={styles.ringValue} cx="50" cy="50" r="48" /></motion.svg>;
}
