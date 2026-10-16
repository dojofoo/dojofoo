import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { cn } from "~/lib/utils";

/* The teachable part: notes are laid out like a tiny column typesetter.
   Each open note wants to sit level with its reference; walking them top to
   bottom, a note that would collide with the one above is pushed just below
   it. A hairline runs under the rest of the reference's line to the margin,
   then bends to wherever its note ended up, so a pushed note is still
   visibly tied to its sentence. */

export type Segment = string | { note: React.ReactNode };
export type Paragraph = Segment[];

// Below this width there is no margin worth using, so notes unfold inline.
const WIDE_AT = 560;
// Margin column width, and the gutter between text and margin.
const MARGIN = 176;
const GUTTER = 32;
// Vertical breathing room between two stacked notes.
const STACK_GAP = 12;
// A pushed note glides rather than jumps, so the eye can follow it; no
// bounce, since overshooting would briefly overlap its neighbour.
const SETTLE = { type: "spring", visualDuration: 0.3, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// Hover must survive the trip from the reference across to the note.
const HOVER_GRACE = 160;

type Ref = { x: number; line: number; top: number };

export function Sidenotes({
  paragraphs,
  defaultOpen = [],
  className,
}: {
  paragraphs: Paragraph[];
  // Note numbers, from 1, that start open.
  defaultOpen?: number[];
  className?: string;
}) {
  const uid = useId();
  const reduceMotion = useReducedMotion() ?? false;
  const root = useRef<HTMLDivElement>(null);
  const refEls = useRef<(HTMLButtonElement | null)[]>([]);
  const noteEls = useRef<(HTMLElement | null)[]>([]);
  const [wide, setWide] = useState(true);
  const [pinned, setPinned] = useState<Set<number>>(() => new Set(defaultOpen.map((n) => n - 1)));
  const [hovered, setHovered] = useState<number | null>(null);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [tops, setTops] = useState<number[]>([]);
  const [edge, setEdge] = useState(0);
  // Room for notes that stack past the end of the text.
  const [minHeight, setMinHeight] = useState(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Number every note once, in reading order.
  const notes: React.ReactNode[] = [];
  const numbered = paragraphs.map((p) =>
    p.map((seg) => (typeof seg === "string" ? seg : { note: seg.note, n: notes.push(seg.note) - 1 })),
  );

  const isOpen = useCallback((i: number) => pinned.has(i) || hovered === i, [pinned, hovered]);

  // Watch the width, and re-measure references whenever text reflows.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      setWide(el.offsetWidth >= WIDE_AT);
      setEdge(el.offsetWidth - MARGIN - GUTTER);
      const box = el.getBoundingClientRect();
      setRefs(
        refEls.current.map((r) => {
          const b = r?.getBoundingClientRect();
          if (!b) return { x: 0, line: 0, top: 0 };
          // The hairline runs in the gap just under the reference's line.
          return { x: b.right - box.left, line: b.bottom - box.top + 3, top: b.top - box.top };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Stack the open notes: each at its reference, or just under the last one.
  useLayoutEffect(() => {
    if (!wide) return;
    let floor = -Infinity;
    const next = refs.map((r, i) => {
      if (!isOpen(i)) return r.top;
      const top = Math.max(r.top, floor);
      floor = top + (noteEls.current[i]?.offsetHeight ?? 0) + STACK_GAP;
      return top;
    });
    setTops(next);
    setMinHeight(Math.max(0, floor - STACK_GAP));
  }, [refs, wide, isOpen]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const hoverIn = (i: number) => {
    clearTimeout(hoverTimer.current);
    setHovered(i);
  };
  const hoverOut = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(null), HOVER_GRACE);
  };
  const toggle = (i: number) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    // Unpinning under the pointer should close it now, not linger as a hover.
    setHovered(null);
  };

  const textWidth = wide ? `calc(100% - ${MARGIN + GUTTER}px)` : "100%";

  return (
    <div
      ref={root}
      style={{ minHeight: wide ? minHeight : undefined }}
      className={cn("relative w-full text-[15px] leading-7 text-pretty text-muted-foreground", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setHovered(null);
      }}
    >
      <div style={{ width: textWidth }}>
        {numbered.map((p, pi) => {
          const inlineNotes = p.filter((s) => typeof s !== "string" && isOpen(s.n)) as { note: React.ReactNode; n: number }[];
          return (
            <Fragment key={pi}>
              <p className={cn(pi > 0 && "mt-4")}>
                {p.map((seg, si) =>
                  typeof seg === "string" ? (
                    <Fragment key={si}>{seg}</Fragment>
                  ) : (
                    <button
                      key={si}
                      ref={(el) => {
                        refEls.current[seg.n] = el;
                      }}
                      type="button"
                      aria-expanded={isOpen(seg.n)}
                      aria-controls={`${uid}-n${seg.n}`}
                      aria-label={`Note ${seg.n + 1}`}
                      onClick={() => toggle(seg.n)}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== "touch") hoverIn(seg.n);
                      }}
                      onPointerLeave={(e) => {
                        if (e.pointerType !== "touch") hoverOut();
                      }}
                      className={cn(
                        // The glyph is tiny, so the hit area is padded out to
                        // a comfortable target without moving the text.
                        "relative -top-[0.4em] mx-0.5 inline-flex h-5 min-w-5 touch-manipulation items-center justify-center rounded-full px-1 align-baseline text-[12px] leading-none font-semibold tabular-nums outline-hidden",
                        "transition-[background-color,color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-foreground active:scale-[0.96]",
                        "before:absolute before:-inset-2 before:content-['']",
                        // A quiet chip at rest, so every number reads as something to
                        // press, and solid once its note is showing.
                        isOpen(seg.n)
                          ? "bg-foreground text-background"
                          : "bg-foreground/[0.08] text-foreground hover:bg-foreground/15",
                      )}
                    >
                      {seg.n + 1}
                    </button>
                  ),
                )}
              </p>
              {/* Narrow widths: the note unfolds right under its paragraph. */}
              {!wide && (
                <AnimatePresence initial={false}>
                  {inlineNotes.map((s) => (
                    <motion.aside
                      key={s.n}
                      id={`${uid}-n${s.n}`}
                      // Height is animated on purpose: the paragraphs below
                      // have to make room, and they should slide, not jump.
                      initial={{ height: 0, opacity: 0, filter: reduceMotion ? "none" : "blur(4px)" }}
                      animate={{ height: "auto", opacity: 1, filter: "blur(0px)", transition: { duration: 0.26, ease: EASE_OUT } }}
                      exit={{ height: 0, opacity: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
                      className="overflow-hidden"
                    >
                      <NoteBody n={s.n} className="mt-3 border-l-2 border-foreground/20 pl-3.5">
                        {s.note}
                      </NoteBody>
                    </motion.aside>
                  ))}
                </AnimatePresence>
              )}
            </Fragment>
          );
        })}
      </div>

      {wide && (
        <>
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
            {notes.map((_, i) =>
              refs[i] ? (
                <Hairline
                  key={i}
                  open={isOpen(i)}
                  from={refs[i]}
                  edge={edge}
                  top={tops[i] ?? refs[i].top}
                  reduceMotion={reduceMotion}
                />
              ) : null,
            )}
          </svg>
          {notes.map((note, i) => (
            <MarginNote
              key={i}
              id={`${uid}-n${i}`}
              ref={(el) => {
                noteEls.current[i] = el;
              }}
              n={i}
              open={isOpen(i)}
              top={tops[i] ?? 0}
              reduceMotion={reduceMotion}
              onPointerEnter={() => hoverIn(i)}
              onPointerLeave={hoverOut}
            >
              {note}
            </MarginNote>
          ))}
        </>
      )}
    </div>
  );
}

function NoteBody({ n, className, children }: { n: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("text-[13px] leading-5 text-muted-foreground", className)}>
      <span className="mr-1.5 font-semibold text-foreground tabular-nums">{n + 1}</span>
      {children}
    </div>
  );
}

function MarginNote({
  id,
  ref,
  n,
  open,
  top,
  reduceMotion,
  onPointerEnter,
  onPointerLeave,
  children,
}: {
  id: string;
  ref: (el: HTMLElement | null) => void;
  n: number;
  open: boolean;
  top: number;
  reduceMotion: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  children: React.ReactNode;
}) {
  const y = useMotionValue(top);
  const wasOpen = useRef(open);

  useEffect(() => {
    // Opening places the note straight at its spot; only notes already on
    // screen glide when a neighbour pushes them.
    if (!wasOpen.current || reduceMotion) y.jump(top);
    else animate(y, top, SETTLE);
    wasOpen.current = open;
  }, [top, open, reduceMotion, y]);

  useEffect(() => () => y.stop(), [y]);

  return (
    <motion.aside
      ref={ref}
      id={id}
      inert={!open}
      style={{ y, width: MARGIN }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") onPointerEnter();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") onPointerLeave();
      }}
      className="absolute top-0 right-0"
    >
      <div
        className={cn(
          "transition-[opacity,translate,filter] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:translate-x-0",
          open
            ? "translate-x-0 opacity-100 blur-none duration-[240ms]"
            : "-translate-x-2 opacity-0 blur-[4px] duration-150",
        )}
      >
        <NoteBody n={n}>{children}</NoteBody>
      </div>
    </motion.aside>
  );
}

function Hairline({
  open,
  from,
  edge,
  top,
  reduceMotion,
}: {
  open: boolean;
  from: Ref;
  edge: number;
  top: number;
  reduceMotion: boolean;
}) {
  const noteY = useMotionValue(top);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (!wasOpen.current || reduceMotion) noteY.jump(top);
    else animate(noteY, top, SETTLE);
    wasOpen.current = open;
  }, [top, open, reduceMotion, noteY]);
  useEffect(() => () => noteY.stop(), [noteY]);

  // Two pieces. A dotted leader runs in the gap under the rest of the
  // line to the text's edge, the way a table of contents leads the eye to
  // a page number: dots, so it never reads as underlining the next words.
  // Then a solid stroke crosses the gutter to the note's first line,
  // bending if the note was pushed down.
  const connector = useConnectorPath(noteY, from, edge);
  const show = open
    ? { opacity: 1, transition: { duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT } }
    : { opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } };
  return (
    <g className="text-foreground/35">
      <motion.path
        d={`M ${from.x + 6} ${from.line} H ${edge}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeDasharray="0 4"
        initial={false}
        animate={show}
      />
      <motion.path
        d={connector}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        initial={false}
        animate={
          open
            ? { pathLength: 1, opacity: 1, transition: { duration: reduceMotion ? 0 : 0.28, ease: EASE_OUT } }
            : { pathLength: 0, opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }
        }
      />
    </g>
  );
}

function useConnectorPath(noteY: MotionValue<number>, from: Ref, edge: number) {
  return useTransform(noteY, (top) => {
    const endY = top + 10;
    const bend = edge + GUTTER * 0.45;
    return `M ${edge} ${from.line} C ${bend} ${from.line} ${bend} ${endY} ${edge + GUTTER - 6} ${endY}`;
  });
}

/* A blog post excerpt with three notes. */

const PARAGRAPHS: Paragraph[] = [
  [
    "The first printed books kept their notes in the margin, right where the reader needed them.",
    { note: "Glossed manuscripts did the same a thousand years earlier, often in a second, smaller hand crowded around the main text." },
    " Footnotes only took over when typesetting got fussy about columns, and endnotes arrived when publishers decided notes were too expensive to set on the page at all.",
  ],
  [
    "On the web we inherited the worst of both: a tiny number that jumps you to the bottom of the page and a back link you have to hunt for.",
    { note: "Wikipedia's hover previews, added in 2018, were the first mainstream fix. They cut clicks on reference links by a large margin." },
    " Margins are free on a wide screen, so notes can live beside the sentence they belong to, the way Edward Tufte sets them in his books.",
    { note: "Tufte's sidenotes need a wide text block. Below that, they fold back into the text, which is exactly what this one does." },
    " Hover a number to peek, click to keep it open.",
  ],
  [
    "None of this needs a new format. The notes are still written inline, where the author thought of them, and the page decides how to show them from the room it has.",
  ],
];

export default function SidenotesDemo() {
  return (
    <article className="w-[640px] max-w-full">
      <p className="text-[13px] text-muted-foreground">Essay · 4 min read</p>
      <h2 className="mt-1 mb-4 text-xl font-semibold text-balance text-foreground">
        Put the notes where the reader is
      </h2>
      <Sidenotes paragraphs={PARAGRAPHS} defaultOpen={[1]} />
    </article>
  );
}
