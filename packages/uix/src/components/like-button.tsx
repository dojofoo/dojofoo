import { useEffect, useRef, useState } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// The squash: quick, so the heart visibly gives under the press.
const SQUASH = { duration: 0.1, ease: EASE_OUT } as const;
// Launched from the 0.8 squash with this kick, the spring overshoots to
// about 1.2 at ~75ms, dips once to ~0.95 and settles.
const POP = { type: "spring", stiffness: 500, damping: 20 } as const;
const POP_VELOCITY = 11;
// Unliking only ever dips, so this is heavily damped: down to ~0.94, back.
const DIP = { type: "spring", stiffness: 500, damping: 30 } as const;
const DIP_VELOCITY = -3;
const SETTLE = { type: "spring", duration: 0.3, bounce: 0 } as const;
const PARTICLES = 7;
// Longer than a UI transition on purpose: it's a rare celebration that
// never blocks input, and particles that vanish in 200ms read as a glitch.
const BURST = { duration: 0.45, ease: EASE_OUT } as const;
// Lets the heart start swelling before the particles leave it.
const BURST_DELAY = 0.04;

type Particle = { angle: number; distance: number; size: number };
type Burst = { id: number; particles: Particle[] };

function rollBurst(id: number): Burst {
  const offset = Math.random() * 360;
  return {
    id,
    particles: Array.from({ length: PARTICLES }, (_, i) => ({
      // Evenly spread, then jittered so no two bursts look stamped.
      angle: offset + (i * 360) / PARTICLES + (Math.random() - 0.5) * 20,
      distance: 18 + Math.random() * 6,
      size: Math.random() < 0.5 ? 4 : 3,
    })),
  };
}

export function LikeButton({
  liked,
  count,
  onLikedChange,
  className,
}: {
  liked: boolean;
  count: number;
  onLikedChange: (liked: boolean) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const heart = useRef<HTMLSpanElement>(null);
  const scale = useRef<AnimationPlaybackControls>(undefined);
  const pressed = useRef(false);
  const nextBurst = useRef(0);
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(() => () => scale.current?.stop(), []);

  const scaleHeart = (
    to: number | number[],
    transition: Parameters<typeof animate>[2],
  ) => {
    if (reduceMotion || !heart.current) return;
    scale.current = animate(heart.current, { scale: to }, transition);
  };

  const release = () => {
    if (!pressed.current) return;
    pressed.current = false;
    scaleHeart(1, SETTLE);
  };

  const toggle = () => {
    const next = !liked;
    const fromPointer = pressed.current;
    pressed.current = false;
    onLikedChange(next);
    if (reduceMotion) return;
    if (next) {
      // Keyboard presses skip the squash, so start from it here instead;
      // the same pop plays either way.
      scaleHeart(fromPointer ? 1 : [0.8, 1], {
        ...POP,
        velocity: POP_VELOCITY,
      });
      const burst = rollBurst(nextBurst.current++);
      setBursts((all) => [...all, burst]);
    } else if (fromPointer) {
      scaleHeart(1, SETTLE);
    } else {
      scaleHeart(1, { ...DIP, velocity: DIP_VELOCITY });
    }
  };

  const noun = count === 1 ? "like" : "likes";

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={`Like, ${count} ${noun}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pressed.current = true;
        // Liking squashes hard to wind up the pop; unliking barely gives.
        scaleHeart(liked ? 0.9 : 0.8, SQUASH);
      }}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={toggle}
      className={cn(
        "group flex h-9 touch-manipulation items-center gap-1.5 rounded-full bg-muted pr-3.5 pl-3 text-sm font-medium text-foreground shadow-raised outline-hidden transition-[scale] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground active:scale-[0.96] motion-reduce:transition-none",
        className,
      )}
    >
      <span className="relative flex size-5 items-center justify-center">
        {/* Behind the heart, so particles appear to leave from inside it. */}
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {bursts.map((burst) => (
            <BurstView
              key={burst.id}
              burst={burst}
              onDone={() =>
                setBursts((all) => all.filter((b) => b.id !== burst.id))
              }
            />
          ))}
        </span>
        <span ref={heart} className="relative block">
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "block size-5 fill-current transition-[color,fill-opacity] ease-out",
              liked
                ? "text-destructive [fill-opacity:1] duration-150"
                : "text-muted-foreground [fill-opacity:0] duration-100 group-hover:text-foreground",
            )}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
        </span>
      </span>
      <Count
        value={count}
        // Liking raises the count, so digits roll up; unliking rolls down.
        direction={liked ? 1 : -1}
        reduceMotion={reduceMotion}
      />
    </button>
  );
}

function BurstView({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  return (
    <>
      {/* Starts inside the heart rather than from nothing. */}
      <motion.span
        className="absolute inset-0 rounded-full border-[1.5px] border-destructive"
        initial={{ scale: 0.6, opacity: 0.6 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      />
      {burst.particles.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full bg-destructive"
            style={{
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
            }}
            // Leaves from the heart's edge, not its center.
            initial={{ x: cos * 6, y: sin * 6, scale: 1, opacity: 1 }}
            animate={{
              x: cos * p.distance,
              y: sin * p.distance,
              scale: 0.4,
              // Holds full strength for the first half of the flight.
              opacity: [1, 1, 0],
            }}
            transition={{
              ...BURST,
              delay: BURST_DELAY,
              opacity: { ...BURST, delay: BURST_DELAY, times: [0, 0.5, 1] },
            }}
            onAnimationComplete={i === 0 ? onDone : undefined}
          />
        );
      })}
    </>
  );
}

type Roll = { direction: number; reduceMotion: boolean | null };

const ROLL = {
  enter: ({ direction, reduceMotion }: Roll) => ({
    y: reduceMotion ? "0%" : `${direction * 100}%`,
    opacity: 0,
  }),
  center: {
    y: "0%",
    opacity: 1,
    transition: { duration: 0.25, ease: EASE_OUT },
  },
  exit: ({ direction, reduceMotion }: Roll) => ({
    y: reduceMotion ? "0%" : `${direction * -100}%`,
    opacity: 0,
    transition: { duration: 0.2, ease: EASE_OUT },
  }),
};

function Count({
  value,
  direction,
  reduceMotion,
}: {
  value: number;
  direction: number;
  reduceMotion: boolean | null;
}) {
  const digits = String(value).split("");
  const custom = { direction, reduceMotion };
  return (
    <span aria-hidden className="flex tabular-nums">
      {digits.map((digit, i) => (
        // Keyed by place value from the right, so only digits that change
        // roll, and ones stay ones when the count gains a digit.
        <span
          key={digits.length - i}
          className="inline-grid overflow-hidden"
        >
          <AnimatePresence initial={false} custom={custom}>
            <motion.span
              key={digit}
              custom={custom}
              variants={ROLL}
              initial="enter"
              animate="center"
              exit="exit"
              className="col-start-1 row-start-1"
            >
              {digit}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

export default function LikeButtonDemo() {
  const [liked, setLiked] = useState(false);
  return (
    <LikeButton
      liked={liked}
      count={liked ? 129 : 128}
      onLikedChange={setLiked}
    />
  );
}
