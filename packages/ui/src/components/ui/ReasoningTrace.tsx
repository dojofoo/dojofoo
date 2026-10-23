"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Brain, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion-tokens";

export type ReasoningTraceProps = {
  steps?: string[];
  autoPlay?: boolean;
  stepDelay?: number;
  onComplete?: () => void;
  className?: string;
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
  stepDelay = 850,
  onComplete,
  className,
}: ReasoningTraceProps) {
  const prefersReducedMotion = useReducedMotion();
  const regionId = React.useId();
  const [shown, setShown] = React.useState(autoPlay ? 0 : steps.length);
  const [open, setOpen] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);

  const thinking = shown < steps.length;

  React.useEffect(() => {
    if (prefersReducedMotion) setShown(steps.length);
  }, [prefersReducedMotion, steps.length]);

  React.useEffect(() => {
    if (!thinking || prefersReducedMotion) return;
    const id = setInterval(() => setShown((n) => Math.min(n + 1, steps.length)), stepDelay);
    return () => clearInterval(id);
  }, [thinking, stepDelay, steps.length, prefersReducedMotion]);

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
    if (!thinking) return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [thinking]);

  return (
    <div className={cn("w-full max-w-xl", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex items-center gap-2 py-1 text-left text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        <Brain className="size-4 shrink-0" />
        {thinking ? (
          <ShimmerText animate={!prefersReducedMotion}>Thinking</ShimmerText>
        ) : (
          <span className="text-[13px] font-medium">Thought for {Math.max(seconds, 1)}s</span>
        )}
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2, ease: ease.out }}>
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <motion.div
        id={regionId}
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.32, ease: ease.out }}
        className="overflow-hidden"
      >
        <ol className="space-y-1 pb-1 pl-6 pt-1.5">
          <AnimatePresence initial={false}>
            {steps.slice(0, shown).map((step, i) => (
              <motion.li
                key={`${i}:${step}`}
                initial={prefersReducedMotion ? false : { opacity: 0, transform: "translateX(-8px)" }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                transition={{ duration: 0.3, ease: ease.out }}
                className="flex gap-2.5 text-[13px] leading-6 text-zinc-500 dark:text-zinc-400"
              >
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <span>{step}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </motion.div>
    </div>
  );
}

function ShimmerText({ children, animate = true }: { children: string; animate?: boolean }) {
  if (!animate) {
    return <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{children}</span>;
  }
  return (
    <motion.span
      className="bg-clip-text text-[13px] font-medium text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%, var(--muted-foreground) 100%)",
        backgroundSize: "200% 100%",
      }}
      animate={{ backgroundPositionX: ["150%", "-50%"] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.span>
  );
}

ReasoningTrace.displayName = "ReasoningTrace";
