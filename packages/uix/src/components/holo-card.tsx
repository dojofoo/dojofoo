"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * A collectible style card with a holographic foil. It leans toward the pointer, the foil and a fine glitter shift colour
 * with the angle, and a soft glare follows the light. Click or press Enter to flip it over; each flip spins toward the side
 * you pressed. On phones it can follow the tilt of the device once the visitor allows motion access.
 * Use it for a membership card, a badge, a profile, or a reward people are meant to show off.
 *
 * In uix its styles sit in the stylesheet below (the CSS module's classes, as `ui-holo__*`); the corner radius is
 * `--holo-radius` on the root.
 */
export interface HoloCardProps {
  /** The face of the card. Fill the whole card; it is clipped to the rounded shape. */
  front: ReactNode;
  /** The back of the card. Leave it out to make the card tilt only. */
  back?: ReactNode;
  /** Controlled flipped state. */
  flipped?: boolean;
  /** Initial flipped state when uncontrolled. */
  defaultFlipped?: boolean;
  onFlippedChange?: (flipped: boolean) => void;
  /** Largest lean in degrees. Defaults to 14. */
  maxTilt?: number;
  /** Strength of the foil, glitter, and glare from 0 to 1. Defaults to 1. */
  intensity?: number;
  /** Follows device tilt on touch screens. iOS asks for permission on the first tap. Defaults to true. */
  gyroscope?: boolean;
  /** Accessible name of the card. Defaults to the text on the visible face. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

const styles = { root: "ui-holo", shadow: "ui-holo__shadow", card: "ui-holo__card", inner: "ui-holo__inner", face: "ui-holo__face", content: "ui-holo__content", foil: "ui-holo__foil", glitter: "ui-holo__glitter", glare: "ui-holo__glare" };

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const TILT = { stiffness: 160, damping: 22, mass: .7 };
const LIGHT = { stiffness: 120, damping: 20 };
const FLIP = { type: "spring" as const, visualDuration: .6, bounce: .1 };

const subscribe = () => () => {};
function useReducedFlag() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return !!useReducedMotion() && hydrated;
}

export function HoloCard({ front, back, flipped: flippedProp, defaultFlipped = false, onFlippedChange, maxTilt = 14, intensity = 1, gyroscope = true, label, className, style }: HoloCardProps) {
  const reduced = useReducedFlag();
  const [localFlipped, setLocalFlipped] = useState(defaultFlipped);
  const flipped = flippedProp ?? localFlipped;
  const rootRef = useRef<HTMLDivElement>(null);
  const gyroState = useRef<"off" | "asked" | "on">("off");
  const stopGyro = useRef<(() => void) | null>(null);
  const baseline = useRef<{ beta: number; gamma: number } | null>(null);

  // Pointer position over the card from 0 to 1, and how present the pointer is. Everything else is derived from these.
  const pointerX = useMotionValue(.5), pointerY = useMotionValue(.5), presence = useMotionValue(0);
  const x = useSpring(pointerX, LIGHT), y = useSpring(pointerY, LIGHT), active = useSpring(presence, LIGHT);
  const rotateX = useSpring(useTransform([pointerY, presence], ([py, p]: number[]) => (.5 - py) * 2 * maxTilt * p), TILT);
  const rotateY = useSpring(useTransform([pointerX, presence], ([px, p]: number[]) => (px - .5) * 2 * maxTilt * p), TILT);
  const lift = useTransform(active, [0, 1], [1, 1.035]);

  // Each flip adds half a turn in the direction of the press, so repeated flips keep spinning the way the hand asked.
  const turn = useMotionValue(flipped ? 180 : 0);
  const turns = useRef(flipped ? 1 : 0);
  const spinDirection = useRef(1);
  useEffect(() => {
    const isBack = Math.abs(Math.round(turns.current)) % 2 === 1;
    if (isBack === flipped) return;
    turns.current += spinDirection.current;
    if (reduced) { turn.jump(turns.current * 180); return; }
    const controls = animate(turn, turns.current * 180, FLIP);
    return () => controls.stop();
  }, [flipped, reduced, turn]);
  // The foil also reacts to the spin itself, so a flip throws a sweep of colour across the card.
  const sweep = useTransform(turn, value => Math.abs(Math.sin(value / 180 * Math.PI)));

  const hue = useTransform(() => (x.get() - .5) * 120 + (y.get() - .5) * 60 + sweep.get() * 90);
  const foilX = useTransform(() => `${x.get() * 100 + sweep.get() * 60}%`);
  const foilY = useTransform(() => `${y.get() * 100}%`);
  const glitterX = useTransform(x, value => `${(.5 - value) * 36}px`);
  const glitterY = useTransform(y, value => `${(.5 - value) * 36}px`);
  const lightX = useTransform(x, value => `${value * 100}%`);
  const lightY = useTransform(y, value => `${value * 100}%`);
  const shine = useTransform(() => Math.min(1, (.35 + active.get() * .65 + sweep.get() * .5)) * intensity);
  const shadowX = useTransform(rotateY, value => `${-value * .9}px`);
  const shadowY = useTransform(rotateX, value => `${18 + value * .9}px`);
  const shadow = useMotionTemplate`${shadowX} ${shadowY} 42px -14px oklch(0% 0 0 / calc(.28 + ${active} * .12))`;

  const hueDeg = useMotionTemplate`${hue}deg`;
  const vars = {
    "--holo-x": lightX, "--holo-y": lightY, "--holo-foil-x": foilX, "--holo-foil-y": foilY,
    "--holo-glitter-x": glitterX, "--holo-glitter-y": glitterY, "--holo-hue": hueDeg, "--holo-shine": shine,
  } as unknown as CSSProperties;

  const setFlipped = (next: boolean) => {
    if (flippedProp === undefined) setLocalFlipped(next);
    onFlippedChange?.(next);
  };

  // Device tilt drives the same pointer values, measured from how the phone was held when tilt started.
  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta == null || event.gamma == null) return;
    baseline.current ??= { beta: event.beta, gamma: event.gamma };
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    pointerX.set(clamp(.5 + (event.gamma - baseline.current.gamma) / 50));
    pointerY.set(clamp(.5 + (event.beta - baseline.current.beta) / 50));
    presence.set(1);
  };
  const handlerRef = useRef(onOrientation);
  useEffect(() => { handlerRef.current = onOrientation; });

  const startGyro = () => {
    const listener = (event: DeviceOrientationEvent) => handlerRef.current(event);
    gyroState.current = "on";
    window.addEventListener("deviceorientation", listener);
    stopGyro.current = () => window.removeEventListener("deviceorientation", listener);
  };
  useEffect(() => () => stopGyro.current?.(), []);

  useEffect(() => {
    if (!gyroscope || reduced || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    const permission = (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission;
    if (typeof permission === "function") return; // iOS: wait for a tap.
    const listener = (event: DeviceOrientationEvent) => handlerRef.current(event);
    gyroState.current = "on";
    window.addEventListener("deviceorientation", listener);
    return () => { window.removeEventListener("deviceorientation", listener); gyroState.current = "off"; };
  }, [gyroscope, reduced]);

  const askGyro = () => {
    if (!gyroscope || reduced || gyroState.current !== "off" || typeof window === "undefined") return;
    const permission = (window.DeviceOrientationEvent as unknown as OrientationPermission | undefined)?.requestPermission;
    if (typeof permission !== "function") return;
    gyroState.current = "asked";
    (window.DeviceOrientationEvent as unknown as Required<OrientationPermission>).requestPermission().then(result => { if (result === "granted") startGyro(); }).catch(() => {});
  };

  const track = (event: ReactPointerEvent) => {
    if (reduced || event.pointerType !== "mouse" && gyroState.current === "on") return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointerX.set(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
    pointerY.set(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)));
    presence.set(1);
  };
  const leave = (event: ReactPointerEvent) => {
    if (event.pointerType !== "mouse" && gyroState.current === "on") return;
    pointerX.set(.5); pointerY.set(.5); presence.set(0);
  };

  const flip = (direction: number) => {
    askGyro();
    if (!back) return;
    spinDirection.current = direction;
    setFlipped(!flipped);
  };
  const onClick = (event: ReactMouseEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    const side = rect && event.detail > 0 ? (event.clientX < rect.left + rect.width / 2 ? -1 : 1) : 1;
    flip(side);
  };
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    flip(1);
  };

  const interactive = !!back;
  const faceStyle = reduced ? undefined : { rotateY: turn };

  return <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(" ")} style={style}
    onPointerMove={track} onPointerEnter={track} onPointerLeave={leave} onPointerCancel={leave}>
    <style href="ui-holo-card" precedence="default">{css}</style>
    <motion.div className={styles.shadow} aria-hidden="true" style={reduced ? undefined : { boxShadow: shadow, rotateX, rotateY, scale: lift, transformPerspective: 900 }} />
    <motion.div className={styles.card} style={reduced ? vars : { ...vars, rotateX, rotateY, scale: lift, transformPerspective: 900 }}
      role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-pressed={interactive ? flipped : undefined}
      aria-roledescription={interactive ? "flip card" : undefined} aria-label={label}
      onClick={interactive ? onClick : askGyro} onKeyDown={interactive ? onKeyDown : undefined} data-reduced={reduced || undefined} data-flipped={flipped || undefined}>
      <motion.div className={styles.inner} style={faceStyle}>
        <div className={styles.face} data-side="front" aria-hidden={flipped || undefined}>
          <div className={styles.content}>{front}</div>
          <span className={styles.foil} aria-hidden="true" />
          <span className={styles.glitter} aria-hidden="true" />
          <span className={styles.glare} aria-hidden="true" />
        </div>
        {back && <div className={styles.face} data-side="back" aria-hidden={!flipped || undefined}>
          <div className={styles.content}>{back}</div>
          <span className={styles.foil} aria-hidden="true" />
          <span className={styles.glare} aria-hidden="true" />
        </div>}
      </motion.div>
    </motion.div>
  </div>;
}

/* The foil is a band of hues slid by the pointer and turned by the angle, dodged into the face; the glitter is two fine
   dot grids drifting against the lean; the glare is soft light where the pointer is. All three sit over the face and
   let clicks through, and their strength rides on --holo-shine (at rest about a third, full under the pointer). */
const css = /* css */ `
.ui-holo { --holo-radius: 16px; position: relative; isolation: isolate; border-radius: var(--holo-radius); }
.ui-holo__shadow { position: absolute; z-index: -1; inset: 6px; border-radius: inherit; pointer-events: none; }
.ui-holo__card { position: relative; border-radius: inherit; transform-style: preserve-3d; outline: none; }
.ui-holo__card[role="button"] { cursor: pointer; }
.ui-holo__card:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
.ui-holo__inner { position: relative; border-radius: inherit; transform-style: preserve-3d; }
.ui-holo__face { position: relative; overflow: hidden; border-radius: inherit; backface-visibility: hidden; -webkit-backface-visibility: hidden; transform: translateZ(0); }
.ui-holo__face[data-side="back"] { position: absolute; inset: 0; transform: rotateY(180deg) translateZ(0); }
.ui-holo__content { position: relative; height: 100%; }
.ui-holo__foil, .ui-holo__glitter, .ui-holo__glare { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
.ui-holo__foil {
  background: repeating-linear-gradient(115deg, oklch(0.82 0.14 20), oklch(0.88 0.14 95) 7%, oklch(0.86 0.13 165) 14%, oklch(0.8 0.13 250) 21%, oklch(0.8 0.15 320) 28%, oklch(0.82 0.14 380) 35%);
  background-size: 320% 320%;
  background-position: var(--holo-foil-x, 50%) var(--holo-foil-y, 50%);
  filter: hue-rotate(var(--holo-hue, 0deg)) saturate(1.15);
  mix-blend-mode: color-dodge;
  opacity: calc(var(--holo-shine, 0.35) * 0.3);
}
.ui-holo__glitter {
  inset: -24px;
  background-image: radial-gradient(circle, rgb(255 255 255 / 0.9) 0 0.6px, transparent 1px), radial-gradient(circle, rgb(255 255 255 / 0.6) 0 0.5px, transparent 1px);
  background-position: 0 0, 4px 6px;
  background-size: 9px 9px, 13px 13px;
  translate: var(--holo-glitter-x, 0) var(--holo-glitter-y, 0);
  mix-blend-mode: overlay;
  opacity: calc(var(--holo-shine, 0.35) * 0.45);
}
.ui-holo__glare { background: radial-gradient(circle at var(--holo-x, 50%) var(--holo-y, 50%), rgb(255 255 255 / 0.45), transparent 60%); mix-blend-mode: soft-light; opacity: var(--holo-shine, 0.35); }
.ui-holo__card[data-reduced] .ui-holo__glitter { translate: none; }
`;
