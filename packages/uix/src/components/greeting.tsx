import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";
import { usePreviewPlay } from "~/lib/preview-play";

// Minute-resolution local time. The server snapshot is null: it can't know
// the reader's hour, so it renders a neutral "Hello" and no glyph.
function subscribeMinute(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      onChange();
      schedule();
    }, 60_000 - (Date.now() % 60_000) + 20);
  };
  schedule();
  return () => clearTimeout(timer);
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
const serverSnapshot = () => null;

type Period = "morning" | "afternoon" | "evening" | "night";

function periodOf(hour: number): Period {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

// Days since a known new moon, folded into one 29.53 day cycle:
// 0 is new, 0.5 is full. Accurate to within a day, plenty for a glyph.
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC = 29.530588853 * 86_400_000;
const moonPhase = (at: number) => (((at - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;

const round = (n: number) => Math.round(n * 100) / 100;

function Sun({ hour }: { hour: number }) {
  // Height of the sun as 0..1 over a 6:00 to 18:00 day: rays are stubs at
  // dawn and dusk and longest at noon.
  const height = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const inner = 7.5;
  const outer = inner + 1.2 + height * 2.6;
  return (
    <>
      <circle cx="12" cy="12" r="4.25" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={round(12 + Math.cos(a) * inner)}
            y1={round(12 + Math.sin(a) * inner)}
            x2={round(12 + Math.cos(a) * outer)}
            y2={round(12 + Math.sin(a) * outer)}
          />
        );
      })}
    </>
  );
}

function Moon({ phase }: { phase: number }) {
  const r = 7;
  // The terminator is a half ellipse whose width follows the phase.
  const rx = round(Math.abs(Math.cos(phase * Math.PI * 2)) * r);
  const waxing = phase < 0.5;
  const crescent = phase < 0.25 || phase > 0.75;
  // Outer limb on the lit side (right while waxing, northern sky), then back
  // up the terminator, bulging toward the lit side only for a crescent.
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = waxing === crescent ? 0 : 1;
  const d = `M12 ${12 - r}A${r} ${r} 0 0 ${outerSweep} 12 ${12 + r}A${rx} ${r} 0 0 ${innerSweep} 12 ${12 - r}Z`;
  return (
    <>
      <circle cx="12" cy="12" r={r} opacity={0.3} />
      <path d={d} fill="currentColor" stroke="none" />
    </>
  );
}

export function Greeting({ name, className }: { name: string; className?: string }) {
  const minute = useSyncExternalStore(subscribeMinute, minuteSnapshot, serverSnapshot);
  const reduceMotion = useReducedMotion();

  let word = "Hello";
  let glyph: React.ReactNode = null;
  let glyphKey = "none";
  if (minute !== null) {
    const now = new Date(minute * 60_000);
    const hour = now.getHours() + now.getMinutes() / 60;
    const period = periodOf(now.getHours());
    word = `Good ${period}`;
    const sunUp = hour >= 6 && hour < 19;
    glyphKey = sunUp ? "sun" : "moon";
    glyph = sunUp ? <Sun hour={hour} /> : <Moon phase={moonPhase(minute * 60_000)} />;
  }

  return (
    <p className={cn("relative flex items-center gap-2.5 text-lg font-medium text-foreground", className)}>
      {/* The slot is reserved from the first render, so the glyph arriving
          never nudges the text. */}
      <span aria-hidden className="relative size-5 shrink-0">
        <AnimatePresence>
          {glyph && (
            <motion.svg
              key={glyphKey}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              className="absolute inset-0 size-5 overflow-visible text-foreground"
              // Rises along an arc: x travels evenly while y eases out, so
              // the body lifts fast and levels off like a sunrise. 700ms is
              // long for UI but it plays once, on arrival, and never blocks.
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -10, y: 10, rotate: -30 }
              }
              animate={{
                opacity: 1,
                x: 0,
                y: 0,
                rotate: 0,
                transition: {
                  opacity: { duration: 0.3, ease: "easeOut" },
                  x: { duration: 0.7, ease: [0.4, 0, 0.6, 1] },
                  y: { duration: 0.7, ease: [0.23, 1, 0.32, 1] },
                  rotate: { duration: 0.7, ease: [0.23, 1, 0.32, 1] },
                },
              }}
              // Sets on the far side of the arc, quicker than it rose.
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0.2 } }
                  : { opacity: 0, x: 8, y: 8, transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }
              }
            >
              {glyph}
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
      <span className="relative inline-flex whitespace-nowrap">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={word}
            className="inline-block"
            initial={{ opacity: 0, filter: "blur(4px)", y: reduceMotion ? 0 : 6 }}
            animate={{
              opacity: 1,
              filter: "blur(0px)",
              y: 0,
              transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] },
            }}
            // Softer than the entrance: a short lift and fade.
            exit={{
              opacity: 0,
              filter: "blur(4px)",
              y: reduceMotion ? 0 : -4,
              transition: { duration: 0.18, ease: "easeOut" },
            }}
          >
            {word}
          </motion.span>
        </AnimatePresence>
        {/* Slides over as the word changes width instead of jumping. */}
        <motion.span layout="position" transition={{ type: "spring", duration: 0.35, bounce: 0 }}>
          , {name}
        </motion.span>
      </span>
    </p>
  );
}

export default function GreetingDemo() {
  const [run, setRun] = useState(0);
  const play = usePreviewPlay();

  // Index preview: presses Replay, so the sun or moon rises along its arc
  // again, and again after a calm pause while the card stays hovered.
  useEffect(() => {
    if (!play) return;
    const replay = () => setRun((r) => r + 1);
    const first = setTimeout(replay, 150);
    // The rise takes 700ms; the rest is a pause to look at it.
    const again = setInterval(replay, 3200);
    return () => {
      clearTimeout(first);
      clearInterval(again);
    };
  }, [play]);

  return (
    <div className="flex flex-col items-start gap-5">
      <Greeting key={run} name="Ada" />
      <button
        type="button"
        onClick={() => setRun((r) => r + 1)}
        className="-ml-3 h-8 rounded-full px-3 text-sm text-muted-foreground outline-hidden transition-[scale,color,background-color] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]"
      >
        Replay
      </button>
    </div>
  );
}
