"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "@mynaui/icons-react";
import { ThinkingIndicator } from "./thinking-indicator";

import { cn } from "@/lib/utils";
import { activityLabels, type ActivityKind } from "@/lib/chat-activity-labels";
const ease = { out: [0.23, 1, 0.32, 1] as const };

export type ReasoningTraceProps = {
  steps?: string[];
  autoPlay?: boolean;
  streaming?: boolean;
  durationMs?: number;
  stepDelay?: number;
  onComplete?: () => void;
  className?: string;
  activity?: ActivityKind;
  usedTools?: boolean;
  children?: React.ReactNode;
};

const DEFAULT_STEPS = [
  "Breaking the request into parts: parse the input, find the constraint, then check edge cases.",
  "The naive approach is O(n squared). I can do better by sorting first and using two pointers.",
  "Edge case: an empty list should return early instead of throwing.",
  "Confirming the result holds for negative numbers and duplicates.",
];

export function ReasoningTrace({
  steps = DEFAULT_STEPS,
  autoPlay = true,
  streaming,
  durationMs,
  stepDelay = 850,
  onComplete,
  className,
  activity = "thinking",
  usedTools = false,
  children,
}: ReasoningTraceProps) {
  const prefersReducedMotion = useReducedMotion();
  const regionId = React.useId();
  const [shown, setShown] = React.useState(autoPlay ? 0 : steps.length);
  const [open, setOpen] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState<number>();
  const startTime = React.useRef<number | undefined>(undefined);

  const thinking = streaming ?? (autoPlay && shown < steps.length);
  const hasContent = Boolean(children) || steps.some(step => step.trim().length > 0);

  React.useEffect(() => {
    if (prefersReducedMotion) setShown(steps.length);
  }, [prefersReducedMotion, steps.length]);

  React.useEffect(() => {
    if (!autoPlay || !thinking || prefersReducedMotion) return;
    const id = setInterval(() => setShown((n) => Math.min(n + 1, steps.length)), stepDelay);
    return () => clearInterval(id);
  }, [autoPlay, thinking, stepDelay, steps.length, prefersReducedMotion]);

  const onCompleteRef = React.useRef(onComplete);
  const completedRef = React.useRef(false);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  React.useEffect(() => {
    if (thinking) {
      startedRef.current = true;
      completedRef.current = false;
      return;
    }
    if (!startedRef.current || completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  }, [thinking]);

  React.useEffect(() => {
    if (!thinking) {
      if (startTime.current !== undefined) {
        setElapsedMs(performance.now() - startTime.current);
        startTime.current = undefined;
      }
      return;
    }
    const start = performance.now();
    startTime.current = start;
    setElapsedMs(0);
    const id = setInterval(() => setElapsedMs(performance.now() - start), 1000);
    return () => clearInterval(id);
  }, [thinking]);

  const measuredMs = durationMs ?? elapsedMs;
  const verb = usedTools ? "Worked" : "Thought";
  const completedLabel = measuredMs === undefined ? verb
    : measuredMs < 1000 ? `${verb} for <1s`
    : `${verb} for ${Math.round(measuredMs / 1000)}s`;

  return (
    <div className={cn("w-full min-w-0", className)}>
      <button
        type="button"
        disabled={!hasContent}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex h-7 items-center gap-2 text-left text-zinc-500 dark:text-zinc-400 transition-colors enabled:hover:text-zinc-900 dark:enabled:hover:text-zinc-100"
      >
        <ThinkingIndicator role={undefined} activity={activity} active={thinking} label={thinking ? activityLabels[activity].label : completedLabel} />
        <motion.span aria-hidden className={hasContent ? undefined : "invisible"} animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2, ease: ease.out }}>
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <motion.div
        id={regionId}
        inert={!open}
        aria-hidden={!open}
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.32, ease: ease.out }}
        className={open ? "overflow-visible" : "invisible overflow-hidden"}
      >
        <div
          role="region"
          aria-label={usedTools ? "Activity details" : "Reasoning details"}
          tabIndex={open && !children ? 0 : -1}
          className={cn(
            "-mx-[var(--chat-gutter,0px)] w-[calc(100%+2*var(--chat-gutter,0px))] px-[var(--chat-gutter,0px)] border-t border-dashed border-border/60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring focus-visible:-outline-offset-1",
            children ? "overflow-visible" : "scrollbar-compact max-h-[min(12rem,40vh)] overflow-y-auto overflow-x-hidden overscroll-contain",
          )}
        >
        {children ?? <ol className="list-none space-y-1 pb-1 ps-0 pe-2 pt-1.5">
          <AnimatePresence initial={false}>
            {(autoPlay ? steps.slice(0, shown) : steps).map((step, i) => (
              <motion.li
                key={i}
                initial={prefersReducedMotion ? false : { opacity: 0, transform: "translateX(-8px)" }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                transition={{ duration: 0.3, ease: ease.out }}
                className="flex gap-2.5 text-[13px] leading-6 text-zinc-500 dark:text-zinc-400"
              >
                <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{step}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>}
        </div>
      </motion.div>
    </div>
  );
}


ReasoningTrace.displayName = "ReasoningTrace";
