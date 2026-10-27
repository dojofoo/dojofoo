"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { cn } from "../lib/utils";

// Half a turn is a lot of travel for a physical object; under ~300ms it reads
// as a snap rather than a card turning over, so this runs longer than most
// UI. The small bounce lets it settle like something with weight.
const FLIP = { type: "spring", visualDuration: 0.55, bounce: 0.2 } as const;
// A few degrees is enough to feel the card lean in; more and the text skews.
const MAX_TILT = 6;
// Settles in about 300ms with no overshoot, so the lean feels heavy.
const FOLLOW = { stiffness: 300, damping: 30 };
// How far the card rises toward you at the halfway point of a flip.
const LIFT_SCALE = 0.03;
// Held down, the card gives a little under your finger.
const PRESS_SCALE = 0.96;
const PRESS = { duration: 0.15, ease: [0.23, 1, 0.32, 1] } as const;

export function FlipCard({
  front,
  back,
  frontLabel = "Show details",
  backLabel = "Show front",
  className,
}: {
  front: React.ReactNode;
  back: React.ReactNode;
  frontLabel?: string;
  backLabel?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const frontButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);

  const flip = useMotionValue(0);
  // Lives in the same transform as the flip. A CSS scale on a wrapper
  // around the 3D card makes Safari flatten it into an opaque square for
  // as long as the press lasts.
  const press = useMotionValue(1);
  const setPressed = (down: boolean) => {
    const to = down ? PRESS_SCALE : 1;
    if (reduceMotion) press.jump(to);
    else animate(press, to, PRESS);
  };

  // Pointer position across the card, -1 to 1 on each axis.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, FOLLOW);
  const y = useSpring(pointerY, FOLLOW);
  // The half under the pointer tips toward you.
  const tiltX = useTransform(y, (v) => -v * MAX_TILT);
  const tiltY = useTransform(x, (v) => v * MAX_TILT);

  // 0 when a face is flat to the viewer, 1 when the card is edge-on. Derived
  // from the angle itself, so an interrupted flip lifts exactly as much as
  // its current position warrants.
  const lift = useTransform(flip, (v) =>
    Math.abs(Math.sin((v * Math.PI) / 180)),
  );
  const scale = useTransform(
    () => (1 + lift.get() * LIFT_SCALE) * press.get(),
  );
  // Tilt adds to the flip in world space, so the lean still follows the
  // cursor when the back is showing.
  const turn = useTransform(() => flip.get() + tiltY.get());
  const transform = useMotionTemplate`rotateX(${tiltX}deg) rotateY(${turn}deg) scale(${scale})`;
  // Reduced motion keeps the press, just without the turn.
  const pressTransform = useMotionTemplate`scale(${press})`;

  // Raised higher, the shadow falls further away, spreads and darkens.
  const shadowY = useTransform(lift, (l) => 14 + l * 22);
  const shadowScale = useTransform(
    () => (0.92 + lift.get() * 0.08) * press.get(),
  );
  const shadowOpacity = useTransform(lift, (l) => 0.3 + l * 0.3);
  const shadowTransform = useMotionTemplate`translateY(${shadowY}px) scale(${shadowScale})`;

  useEffect(() => {
    if (reduceMotion) {
      flip.jump(0);
      return;
    }
    // Starts from the live angle and velocity, so flipping again mid-turn
    // reverses smoothly instead of restarting.
    const controls = animate(flip, flipped ? 180 : 0, FLIP);
    return () => controls.stop();
  }, [flipped, reduceMotion, flip]);

  // The face that was pressed turns inert, so focus follows to the other one.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (flipped ? backButton : frontButton).current?.focus({
      preventScroll: true,
    });
  }, [flipped]);

  const toggle = () => {
    moveFocus.current = true;
    setFlipped((f) => !f);
  };

  // The corner is a variable, so a smaller card (a sidebar's) can round less
  const face = "absolute inset-0 rounded-[var(--flip-radius,1.5rem)] backface-hidden";
  // Reduced motion swaps faces with a short cross-fade in place of the turn.
  const fade = "transition-[opacity] duration-200 ease-out";
  const hitArea =
    "absolute inset-0 z-10 cursor-pointer rounded-[inherit] outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-foreground";

  return (
    <div
      className={cn(
        "relative h-[420px] w-[min(320px,100%)] touch-manipulation select-none",
        className,
      )}
      onPointerDown={(e) => {
        if (e.button === 0 && (e.target as Element).closest("button")) {
          setPressed(true);
        }
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onKeyDown={(e) => {
        if (e.key === " " && !e.repeat) setPressed(true);
      }}
      onKeyUp={(e) => {
        if (e.key === " ") setPressed(false);
      }}
      onBlur={() => setPressed(false)}
      onPointerMove={(e) => {
        // Touch would fight the page scroll, so leaning is for mouse and pen.
        if (reduceMotion || e.pointerType === "touch") return;
        const rect = e.currentTarget.getBoundingClientRect();
        pointerX.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
        pointerY.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
      }}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
        setPressed(false);
      }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-x-6 top-10 bottom-2 rounded-[var(--flip-radius,1.5rem)] bg-black blur-2xl"
        style={{ transform: shadowTransform, opacity: shadowOpacity }}
      />
      <div className="absolute inset-0 perspective-[1200px]">
        <motion.div
          className="relative size-full transform-3d"
          style={{ transform: reduceMotion ? pressTransform : transform }}
        >
          <div
            className={cn(
              face,
              reduceMotion && fade,
              reduceMotion && flipped && "opacity-0",
            )}
            inert={flipped}
            aria-hidden={flipped}
          >
            <button
              ref={frontButton}
              type="button"
              aria-label={frontLabel}
              onClick={toggle}
              className={hitArea}
            />
            {front}
          </div>
          <div
            className={cn(
              face,
              reduceMotion ? fade : "rotate-y-180",
              reduceMotion && !flipped && "opacity-0",
            )}
            inert={!flipped}
            aria-hidden={!flipped}
          >
            <button
              ref={backButton}
              type="button"
              aria-label={backLabel}
              onClick={toggle}
              className={hitArea}
            />
            {back}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function FlipHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] font-medium">
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M13.25 8a5.25 5.25 0 0 1-9.4 3.2M2.75 8a5.25 5.25 0 0 1 9.4-3.2" />
        <path d="M12.5 2.25v2.5H10M3.5 13.75v-2.5H6" />
      </svg>
      {children}
    </span>
  );
}

const DETAILS = [
  ["Plan", "Studio, yearly"],
  ["Seats", "3 of 5 used"],
  ["Storage", "42 of 100 GB"],
  ["Renews", "12 Mar 2027"],
] as const;

function Front() {
  return (
    <div className="flex size-full flex-col justify-between rounded-[inherit] bg-foreground p-6 text-background">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold tracking-tight">ui lab</span>
        <span className="font-mono text-xs tabular-nums opacity-60">
          No. 0042
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium opacity-60">
          Studio member
        </span>
        <span className="text-[40px] leading-[1.05] font-semibold tracking-[-0.03em]">
          Yash
          <br />
          Bavadiya
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs opacity-60">Member since</span>
          <span className="text-sm font-medium tabular-nums">April 2024</span>
        </div>
        <span className="opacity-60">
          <FlipHint>Details</FlipHint>
        </span>
      </div>
    </div>
  );
}

function Back() {
  return (
    <div className="flex size-full flex-col justify-between rounded-[inherit] bg-muted p-6 text-foreground ring-1 ring-border ring-inset">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-muted-foreground">Membership</span>
        <span className="text-2xl font-semibold tracking-tight">Studio</span>
      </div>
      <dl className="flex flex-col">
        {DETAILS.map(([term, value]) => (
          <div
            key={term}
            className="flex items-baseline justify-between border-t border-border py-3 text-[15px]"
          >
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="font-mono text-xs tabular-nums">No. 0042</span>
        <FlipHint>Front</FlipHint>
      </div>
    </div>
  );
}

export default function FlipCardDemo() {
  return <FlipCard front={<Front />} back={<Back />} />;
}
