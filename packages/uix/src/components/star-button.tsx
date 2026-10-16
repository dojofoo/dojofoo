import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";
import { usePreviewPlay } from "~/lib/preview-play";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const STAR =
  "M12 3.2l2.63 5.33 5.88.86-4.26 4.15 1 5.86L12 16.63l-5.25 2.77 1-5.86-4.25-4.15 5.88-.86Z";
// One full turn that lands hard and eases in: longer than a UI transition
// because it is a rare, once-per-repo moment that never blocks input.
const SPIN = { duration: 0.6, ease: EASE_OUT } as const;
// A kick on the same spring as the lab's like button: up to ~1.2, one dip.
const POP = { type: "spring", stiffness: 500, damping: 20 } as const;
const POP_VELOCITY = 8;
const SPARKS = 8;
// GitHub's own star yellow (Primer --button-star-iconColor). A raw colour on
// purpose: it is the brand meaning of "starred", so it is data here.
const STAR_YELLOW = "light-dark(#eac54f, #e3b341)";
const SPARK = { duration: 0.42, ease: EASE_OUT } as const;

// Fixed, so server and client agree; offset half a step so no spark lines
// up with a star point and gets hidden behind it.
const SPARK_ANGLES = Array.from(
  { length: SPARKS },
  (_, i) => (i * 360) / SPARKS + 360 / SPARKS / 2,
);

// Locale independent, so the server and the browser print the same thing.
function group(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function StarButton({
  starred,
  count,
  onStarredChange,
  className,
}: {
  starred: boolean;
  count: number;
  onStarredChange: (starred: boolean) => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const glyph = useRef<HTMLSpanElement>(null);
  const spin = useRef<AnimationPlaybackControls>(undefined);
  const pop = useRef<AnimationPlaybackControls>(undefined);
  const [burst, setBurst] = useState(0);
  const [note, setNote] = useState("");
  const rulerA = useRef<HTMLSpanElement>(null);
  const rulerB = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<[number, number] | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (!rulerA.current || !rulerB.current) return;
      setWidths([rulerA.current.offsetWidth, rulerB.current.offsetWidth]);
    };
    measure();
    // Web fonts can land after the first measure and change both widths.
    let live = true;
    document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () => () => {
      spin.current?.stop();
      pop.current?.stop();
    },
    [],
  );

  // The celebration follows the prop rather than the click, so a parent
  // that stars on your behalf (or refuses to) still gets it right.
  const [prevStarred, setPrevStarred] = useState(starred);
  if (prevStarred !== starred) {
    setPrevStarred(starred);
    if (starred && !reduceMotion) setBurst((b) => b + 1);
  }
  const lastStarred = useRef(starred);
  useEffect(() => {
    const was = lastStarred.current;
    lastStarred.current = starred;
    // Unstarring stays quiet: a spin already running finishes on its own,
    // and the fill just drains.
    if (!starred || was || reduceMotion || !glyph.current) return;
    spin.current?.stop();
    spin.current = animate(glyph.current, { rotate: [0, 360] }, SPIN);
    pop.current?.stop();
    pop.current = animate(
      glyph.current,
      { scale: 1 },
      { ...POP, velocity: POP_VELOCITY },
    );
  }, [starred, reduceMotion]);

  const toggle = () => {
    const next = !starred;
    onStarredChange(next);
    setNote(next ? "Starred" : "Unstarred");
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-pressed={starred}
        aria-label={`Star, ${group(count)} stars`}
        onClick={toggle}
        className={cn(
          "group inline-flex h-8 touch-manipulation items-stretch overflow-visible rounded-lg bg-muted text-[13px] font-medium text-foreground shadow-raised outline-hidden select-none",
          "transition-[scale,background-color] duration-150 ease-out hover:bg-background active:scale-[0.96] motion-reduce:transition-[background-color]",
          "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground",
          className,
        )}
      >
        {/* 2px less on the icon side: the star's own bearings fill it. */}
        <span className="flex items-center gap-1.5 pr-3 pl-2.5">
          <span className="relative grid size-4 place-items-center">
            <span aria-hidden className="pointer-events-none absolute inset-0">
              {burst > 0 && !reduceMotion && <Sparks key={burst} />}
            </span>
            <span ref={glyph} aria-hidden className="relative block size-4">
              <svg
                viewBox="0 0 24 24"
                className={cn(
                  "size-4 transition-[fill-opacity,color] ease-out",
                  starred
                    ? "[fill-opacity:1] delay-75 duration-200"
                    : "text-muted-foreground [fill-opacity:0] duration-150 group-hover:text-foreground",
                )}
                style={starred ? { color: STAR_YELLOW } : undefined}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinejoin="round"
              >
                <path d={STAR} />
              </svg>
            </span>
          </span>
          {/* Glides to the word's own width, so "Star" never sits beside a
              gap reserved for "Starred". Width (not scale) so the letters
              never stretch; the button's left edge stays put. */}
          <span
            aria-hidden
            className="relative h-5 overflow-hidden leading-5 transition-[width] duration-[250ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
            style={
              widths ? { width: starred ? widths[1] : widths[0] } : undefined
            }
          >
            {/* Sizes the cell in server HTML, before anything is measured. */}
            <span className="invisible block whitespace-nowrap">
              {starred ? "Starred" : "Star"}
            </span>
            <Label visible={!starred}>Star</Label>
            <Label visible={starred}>Starred</Label>
            <span
              ref={rulerA}
              className="invisible absolute left-0 whitespace-nowrap"
            >
              Star
            </span>
            <span
              ref={rulerB}
              className="invisible absolute left-0 whitespace-nowrap"
            >
              Starred
            </span>
          </span>
        </span>
        <span aria-hidden className="my-1.5 w-px bg-border" />
        <span className="flex items-center px-2.5">
          <Count
            text={group(count)}
            direction={starred ? 1 : -1}
            reduceMotion={reduceMotion}
          />
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {note}
      </span>
    </span>
  );
}

function Sparks() {
  return SPARK_ANGLES.map((angle) => (
    // The wrapper holds the angle; the line only ever travels along its own
    // axis, so the transform stays a simple translate plus scale.
    <span
      key={angle}
      className="absolute inset-0"
      style={{ rotate: `${angle}deg` }}
    >
      <motion.span
        className="absolute top-1/2 left-1/2 -ml-[0.75px] h-[5px] w-[1.5px] origin-bottom rounded-full"
        style={{ backgroundColor: STAR_YELLOW }}
        // Leaves from just outside the star's points and shrinks as it goes,
        // so it reads as a spark flying off rather than a line sliding.
        initial={{ y: -12, scaleY: 1, opacity: 1 }}
        animate={{ y: -17, scaleY: 0.2, opacity: [1, 1, 0] }}
        transition={{
          ...SPARK,
          // Waits for the spin to get going, so the star seems to throw them.
          delay: 0.05,
          opacity: { ...SPARK, delay: 0.05, times: [0, 0.4, 1] },
        }}
      />
    </span>
  ));
}

function Label({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "absolute top-0 left-0 whitespace-nowrap transition-[opacity,filter] ease-[cubic-bezier(0.23,1,0.32,1)]",
        visible
          ? "opacity-100 blur-[0px] duration-200"
          : "opacity-0 blur-[3px] duration-100 motion-reduce:blur-[0px]",
      )}
    >
      {children}
    </span>
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
    transition: { duration: 0.26, ease: EASE_OUT },
  },
  // Exits go sooner and softer than entries.
  exit: ({ direction, reduceMotion }: Roll) => ({
    y: reduceMotion ? "0%" : `${direction * -100}%`,
    opacity: 0,
    transition: { duration: 0.18, ease: EASE_OUT },
  }),
};

function Count({
  text,
  direction,
  reduceMotion,
}: {
  text: string;
  direction: number;
  reduceMotion: boolean | null;
}) {
  const chars = text.split("");
  const custom = { direction, reduceMotion };
  return (
    <span aria-hidden className="flex tabular-nums">
      {chars.map((char, i) => (
        // Keyed by place from the right: only the digits that change roll,
        // so 1,299 to 1,300 rolls three and leaves the thousands alone.
        <span key={chars.length - i} className="inline-grid overflow-hidden">
          <AnimatePresence initial={false} custom={custom}>
            <motion.span
              key={char}
              custom={custom}
              variants={ROLL}
              initial="enter"
              animate="center"
              exit="exit"
              className="col-start-1 row-start-1"
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

// The index card's hover show: someone stars the repo, admires it for a
// moment, then changes their mind. Waits in ms.
const SHOW_STAR = 350;
const SHOW_UNSTAR = 2600;
const SHOW_REST = 1500;

export default function StarButtonDemo() {
  const [starred, setStarred] = useState(false);
  const play = usePreviewPlay();

  useEffect(() => {
    if (play !== true) return;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = (wait: number) => {
      timer = setTimeout(() => {
        setStarred(true);
        timer = setTimeout(() => {
          setStarred(false);
          cycle(SHOW_REST);
        }, SHOW_UNSTAR);
      }, wait);
    };
    cycle(SHOW_STAR);
    return () => {
      clearTimeout(timer);
      setStarred(false);
    };
  }, [play]);

  return (
    // On its own page the button is left aligned in a box sized for its
    // starred width, so it grows rightward and never slides out from under
    // the cursor. Nobody clicks the index card's copy, so there it stays
    // centred and grows evenly both ways.
    <div
      className={cn("flex w-[148px]", play !== null && "justify-center")}
    >
      <StarButton
        starred={starred}
        count={starred ? 1300 : 1299}
        onStarredChange={setStarred}
      />
    </div>
  );
}
