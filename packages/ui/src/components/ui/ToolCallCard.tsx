"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, Tool as Wrench, Check, X } from "@mynaui/icons-react";

import { cn } from "@/lib/utils";
import { CodeBlock } from "../ai-elements/code-block";
import type { BundledLanguage } from "shiki";
const ease = { out: [0.23, 1, 0.32, 1] } as const;

export type ToolCallStatus = "pending" | "running" | "done" | "error";

export type ToolCallCardProps = {
  name: string;
  label?: string;
  args?: Record<string, unknown> | string;
  result?: string;
  resultLanguage?: BundledLanguage | "text";
  error?: string;
  status?: ToolCallStatus;
  autoPlay?: boolean;
  runDuration?: number;
  durationMs?: number;
  startDelay?: number;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  showStatus?: boolean;
  onComplete?: (status: ToolCallStatus) => void;
  className?: string;
  children?: React.ReactNode;
};

const REVEAL = { duration: 0.22, ease: ease.out } as const;

function formatArgs(args: ToolCallCardProps["args"]) {
  if (args == null) return [];
  if (typeof args === "string") return [["", args]] as [string, string][];
  return Object.entries(args).map(
    ([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)] as [string, string],
  );
}

export function ToolCallCard({
  name,
  label,
  args,
  result,
  resultLanguage,
  error,
  status: controlled,
  autoPlay = true,
  runDuration = 1600,
  durationMs,
  startDelay = 0,
  icon,
  defaultOpen = false,
  showStatus = true,
  onComplete,
  className,
  children,
}: ToolCallCardProps) {
  const reduced = !!useReducedMotion();
  const regionId = React.useId();
  const [internal, setInternal] = React.useState<ToolCallStatus>(autoPlay ? "pending" : "done");
  const status = controlled ?? internal;
  const [open, setOpen] = React.useState(defaultOpen);
  const [elapsed, setElapsed] = React.useState<number | null>(null);
  const startedAt = React.useRef<number | null>(null);
  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  React.useEffect(() => {
    if (controlled || !autoPlay) return;
    const finish: ToolCallStatus = error ? "error" : "done";
    if (reduced) {
      setInternal(finish);
      return;
    }
    const t1 = setTimeout(() => setInternal("running"), startDelay);
    const t2 = setTimeout(() => setInternal(finish), startDelay + runDuration);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [controlled, autoPlay, error, reduced, startDelay, runDuration]);

  React.useEffect(() => {
    if (status === "running") {
      startedAt.current = performance.now();
      return;
    }
    if (status === "done" || status === "error") {
      if (startedAt.current != null) {
        setElapsed(performance.now() - startedAt.current);
        startedAt.current = null;
      }
      onCompleteRef.current?.(status);
    }
  }, [status]);

  const entries = formatArgs(args);
  const formattedResult = React.useMemo(() => {
    const code = result ?? "";
    if (resultLanguage) return { code, language: resultLanguage };
    try {
      return { code: JSON.stringify(JSON.parse(code), null, 2), language: "json" as const };
    } catch {
      return { code, language: "text" as const };
    }
  }, [result, resultLanguage]);
  const finished = status === "done" || status === "error";
  const signature = entries[0]?.[1]?.split("/").pop()?.slice(0, 32);
  const measured = durationMs ?? elapsed;
  const duration =
    measured == null ? null : measured >= 1000 ? `${(measured / 1000).toFixed(1)}s` : `${Math.round(measured)}ms`;

  return (
    <div data-tool-call={name} className={cn("w-full min-w-0 max-w-none self-stretch text-zinc-900 dark:text-zinc-100", className)}>
      <button
        data-tool-header=""
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={regionId}
        className={cn(
          "group flex w-[calc(100%+2*var(--chat-gutter,0px))] -mx-[var(--chat-gutter,0px)] min-w-0 items-center gap-3 rounded-none px-[var(--chat-gutter,0px)] py-2.5 text-left transition-colors duration-150 ease-out motion-reduce:transition-none",
          "hover:bg-zinc-100/80 active:bg-zinc-200/80 dark:hover:bg-white/5 dark:active:bg-white/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15 dark:focus-visible:ring-white/20",
        )}
      >
        <StatusGlyph status={status} reduced={reduced} icon={icon} showStatus={showStatus} />

        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 truncate font-mono text-[12.5px] tracking-[-0.01em]",
              status === "pending" && "text-zinc-400 dark:text-zinc-500",
              status === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100",
            )}
          >
            {name}
            {signature ? <span className="text-zinc-400 dark:text-zinc-500">({signature})</span> : null}
          </span>
          {label ? (
            status === "running" ? (
              <Shimmer animate={!reduced}>{label}</Shimmer>
            ) : (
              <span className="hidden truncate text-[12.5px] text-zinc-500 dark:text-zinc-400 sm:inline">{label}</span>
            )
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2 text-zinc-400 dark:text-zinc-500">
          <AnimatePresence initial={false}>
            {finished && duration ? (
              <motion.span
                key="duration"
                initial={reduced ? false : { opacity: 0, filter: "blur(3px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                transition={REVEAL}
                className="font-mono text-[11px] tabular-nums"
              >
                {duration}
              </motion.span>
            ) : null}
          </AnimatePresence>
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.2, ease: ease.out }}
            className="opacity-60 transition-opacity group-hover:opacity-100"
          >
            <ChevronRight className="size-3.5" strokeWidth={2.25} />
          </motion.span>
        </span>
      </button>

      <motion.div
        id={regionId}
        inert={!open}
        aria-hidden={!open}
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.28, ease: ease.out }}
        className={open ? "overflow-hidden" : "invisible overflow-hidden"}
      >
        <div className="space-y-2.5 border-t border-dashed border-border/60 pt-2 pb-3">
          {entries.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {entries.map(([k, v]) => (
                <span
                  key={k || v}
                  className="inline-flex max-w-full items-baseline gap-1.5 rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11.5px] leading-none text-zinc-700 dark:bg-white/6 dark:text-zinc-300"
                >
                  {k ? <span className="text-zinc-400 dark:text-zinc-500">{k}</span> : null}
                  <span className="truncate">{v}</span>
                </span>
              ))}
            </div>
          ) : null}

          <AnimatePresence initial={false} mode="wait">
            {status === "error" ? (
              <motion.p
                key="error"
                initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={REVEAL}
                className="font-mono text-[12px] leading-5 text-red-600 dark:text-red-400"
              >
                {error ?? "Tool call failed."}
              </motion.p>
            ) : status === "done" && result ? (
              <motion.div
                key="result"
                initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={REVEAL}
                className="min-w-0"
              >
                {open && <CodeBlock code={formattedResult.code} language={formattedResult.language}
                  className="rounded-none border-0 bg-transparent [&_pre]:p-0 [&_pre]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_pre]:text-xs [&_code]:text-xs [&_code]:leading-5" />}
              </motion.div>
            ) : null}
          </AnimatePresence>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function StatusGlyph({
  status,
  reduced,
  icon,
  showStatus,
}: {
  status: ToolCallStatus;
  reduced: boolean;
  icon?: React.ReactNode;
  showStatus: boolean;
}) {
  return (
    <span className="relative grid size-5 shrink-0 place-items-center text-zinc-500 dark:text-zinc-400 [&>svg]:size-4">
      {showStatus && <span className="sr-only">{status}</span>}
      {icon ?? <Wrench />}
      {showStatus && <span data-tool-status className="absolute -bottom-1 -right-1 grid size-3 place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          {status === "running" ? (
            <motion.span
              key="running"
              initial={reduced ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={REVEAL}
              className={cn(
                "size-2.5 rounded-full border-[1.5px] border-zinc-200 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200",
                !reduced && "animate-[spin_0.7s_linear_infinite]",
              )}
            />
          ) : status === "done" || status === "error" ? (
            <motion.span
              key={status}
              initial={reduced ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={REVEAL}
              className={cn("size-2.5", status === "error" && "text-red-500")}
            >
              {status === "done" ? <Check className="size-2.5" /> : <X className="size-2.5" />}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>}
    </span>
  );
}

function Shimmer({ children, animate }: { children: string; animate: boolean }) {
  if (!animate) {
    return <span className="truncate text-[12.5px] text-zinc-500 dark:text-zinc-400">{children}</span>;
  }
  return (
    <motion.span
      className="truncate bg-[linear-gradient(90deg,#71717a_0%,#71717a_40%,#18181b_50%,#71717a_60%,#71717a_100%)] bg-clip-text text-[12.5px] text-transparent dark:bg-[linear-gradient(90deg,#a1a1aa_0%,#a1a1aa_40%,#fafafa_50%,#a1a1aa_60%,#a1a1aa_100%)]"
      style={{ backgroundSize: "200% 100%" }}
      animate={{ backgroundPositionX: ["150%", "-50%"] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.span>
  );
}

ToolCallCard.displayName = "ToolCallCard";
