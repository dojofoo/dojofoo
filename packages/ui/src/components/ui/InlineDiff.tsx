"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, X } from "@mynaui/icons-react";

import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion-tokens";

export type DiffLine = { type: "equal" | "remove" | "add"; text: string; oldNo?: number; newNo?: number };
export type DiffDecision = "pending" | "accepted" | "rejected";

export type InlineDiffProps = {
  before: string;
  after: string;
  fileName?: string;
  context?: number;
  autoPlay?: boolean;
  speed?: number;
  startDelay?: number;
  decision?: DiffDecision;
  showActions?: boolean;
  onComplete?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  className?: string;
};

const REVEAL = { duration: 0.22, ease: ease.out } as const;
const MAX_LCS = 250_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const out: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  const push = (type: DiffLine["type"], text: string) => {
    if (type === "equal") out.push({ type, text, oldNo: oldNo++, newNo: newNo++ });
    else if (type === "remove") out.push({ type, text, oldNo: oldNo++ });
    else out.push({ type, text, newNo: newNo++ });
  };
  if (a.length * b.length > MAX_LCS) {
    a.forEach((t) => push("remove", t));
    b.forEach((t) => push("add", t));
    return out;
  }
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("remove", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < n) push("remove", a[i++]);
  while (j < m) push("add", b[j++]);
  return out;
}

type Row =
  | { kind: "line"; line: DiffLine; index: number }
  | { kind: "fold"; lines: DiffLine[]; key: string }
  | { kind: "adds"; lines: DiffLine[]; group: number; key: string };

function foldContext(lines: DiffLine[], context: number): Row[] {
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "equal") for (let k = i - context; k <= i + context; k++) keep.add(k);
  });
  const rows: Row[] = [];
  let groups = 0;
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "add") {
      const start = i;
      while (i < lines.length && lines[i].type === "add") i++;
      rows.push({ kind: "adds", lines: lines.slice(start, i), group: groups++, key: `adds-${start}` });
      continue;
    }
    if (keep.has(i) || lines[i].type !== "equal") {
      rows.push({ kind: "line", line: lines[i], index: i });
      i++;
      continue;
    }
    const start = i;
    while (i < lines.length && !keep.has(i) && lines[i].type === "equal") i++;
    const hidden = lines.slice(start, i);
    if (hidden.length <= 1) hidden.forEach((l, k) => rows.push({ kind: "line", line: l, index: start + k }));
    else rows.push({ kind: "fold", lines: hidden, key: `fold-${start}` });
  }
  return rows;
}

export function InlineDiff({
  before,
  after,
  fileName,
  context = 2,
  autoPlay = true,
  speed = 140,
  startDelay = 0,
  decision: controlledDecision,
  showActions = true,
  onComplete,
  onAccept,
  onReject,
  className,
}: InlineDiffProps) {
  const reduced = !!useReducedMotion();
  const lines = React.useMemo(() => diffLines(before, after), [before, after]);
  const rows = React.useMemo(() => foldContext(lines, context), [lines, context]);
  const removed = lines.filter((l) => l.type === "remove");
  const added = lines.filter((l) => l.type === "add");
  const removedIdx = React.useMemo(
    () => lines.map((l, i) => (l.type === "remove" ? i : -1)).filter((i) => i >= 0),
    [lines],
  );
  const addGroups = React.useMemo(() => rows.filter((r) => r.kind === "adds") as Extract<Row, { kind: "adds" }>[], [rows]);
  const groupDuration = React.useCallback(
    (n: number) => Math.min(1400, Math.max(550, n * speed * 1.2)),
    [speed],
  );

  const total = removedIdx.length + addGroups.length;
  const [revealed, setRevealed] = React.useState(autoPlay && !reduced ? 0 : total);
  const [expanded, setExpanded] = React.useState<Record<string, true>>({});
  const [internalDecision, setInternalDecision] = React.useState<DiffDecision>("pending");
  const decision = controlledDecision ?? internalDecision;
  const streaming = revealed < total;

  React.useEffect(() => {
    if (!autoPlay || reduced) {
      setRevealed(total);
      return;
    }
    setRevealed(0);
    let n = 0;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      n++;
      setRevealed(n);
      if (n >= total) return;
      const next =
        n < removedIdx.length
          ? 50
          : n === removedIdx.length
            ? 360
            : groupDuration(addGroups[n - removedIdx.length - 1].lines.length) + 160;
      id = setTimeout(tick, next);
    };
    id = setTimeout(tick, startDelay + 200);
    return () => clearTimeout(id);
  }, [autoPlay, reduced, total, startDelay, removedIdx.length, addGroups, groupDuration]);

  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  });
  const [wasStreaming, setWasStreaming] = React.useState(streaming);
  React.useEffect(() => {
    if (wasStreaming && !streaming) onCompleteRef.current?.();
    if (wasStreaming !== streaming) setWasStreaming(streaming);
  }, [streaming, wasStreaming]);

  const struckSet = new Set(removedIdx.slice(0, revealed));
  const groupsShown = Math.max(0, revealed - removedIdx.length);

  const decide = (d: DiffDecision) => {
    if (!controlledDecision) setInternalDecision(d);
    (d === "accepted" ? onAccept : onReject)?.();
  };

  return (
    <div
      className={cn(
        "relative w-full max-w-xl overflow-hidden rounded-none border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-3 border-b border-zinc-100 px-3 dark:border-zinc-900">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-600 dark:text-zinc-300">
          {fileName ?? "diff"}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{added.length}</span>
          <span className="text-red-500 dark:text-red-400">−{removed.length}</span>
        </span>
        <AnimatePresence initial={false} mode="wait">
          {showActions && !streaming && decision === "pending" ? (
            <motion.span
              key="actions"
              initial={reduced ? false : { opacity: 0, x: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={REVEAL}
              className="flex items-center gap-1"
            >
              <ActionButton onClick={() => decide("rejected")} label="Reject">
                <X className="size-3.5" strokeWidth={2.25} />
              </ActionButton>
              <ActionButton onClick={() => decide("accepted")} label="Accept" primary>
                <Check className="size-3.5" strokeWidth={2.5} />
              </ActionButton>
            </motion.span>
          ) : decision !== "pending" ? (
            <motion.span
              key={decision}
              initial={reduced ? false : { opacity: 0, filter: "blur(3px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={REVEAL}
              className={cn(
                "text-[11px] font-medium",
                decision === "accepted" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500",
              )}
            >
              {decision === "accepted" ? "Accepted" : "Rejected"}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="overflow-x-auto py-1.5 font-mono text-[12px] leading-[22px]">
        {rows.map((row) => {
          if (row.kind === "fold") {
            const open = expanded[row.key];
            return (
              <div key={row.key} className={cn(open && "contents")}>
                {!open ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [row.key]: true }))}
                    className="flex h-[22px] w-full items-center gap-3 bg-zinc-50/80 px-3 text-left text-[11px] text-zinc-400 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-500 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
                  >
                    <span className="w-[4.5rem] shrink-0 text-center tracking-widest">···</span>
                    <span>{row.lines.length} unchanged lines</span>
                  </button>
                ) : (
                  row.lines.map((l) => <Line key={`f-${l.oldNo}`} line={l} state="shown" decision={decision} />)
                )}
              </div>
            );
          }
          if (row.kind === "adds") {
            return (
              <AddGroup
                key={row.key}
                lines={row.lines}
                shown={row.group < groupsShown}
                duration={groupDuration(row.lines.length)}
                decision={decision}
                reduced={reduced}
              />
            );
          }
          const line = row.line;
          const state: LineState =
            line.type === "remove" ? (struckSet.has(row.index) ? "struck" : "shown") : "shown";
          return <Line key={`${line.type}-${line.oldNo ?? ""}-${line.newNo ?? ""}`} line={line} state={state} decision={decision} />;
        })}
      </div>
    </div>
  );
}

type LineState = "hidden" | "shown" | "struck";

const DEVELOP_EASE = [0.25, 1, 0.5, 1] as const;

function AddGroup({
  lines,
  shown,
  duration,
  decision,
  reduced,
}: {
  lines: DiffLine[];
  shown: boolean;
  duration: number;
  decision: DiffDecision;
  reduced: boolean;
}) {
  const dropped = decision === "rejected";
  const open = shown && !dropped;
  const sec = duration / 1000;
  return (
    <div
      className="overflow-hidden motion-reduce:transition-none"
      style={{
        height: open ? lines.length * 22 : 0,
        transition: `height ${Math.min(420, duration * 0.6)}ms ${ROW_EASE}`,
      }}
    >
      <motion.div
        initial={false}
        animate={
          open
            ? { opacity: 1, filter: "blur(0px)", y: 0, "--reveal": "160%" }
            : { opacity: 0, filter: "blur(8px)", y: 6, "--reveal": "-60%" }
        }
        transition={
          reduced
            ? { duration: 0 }
            : open
              ? { duration: sec, ease: DEVELOP_EASE, filter: { duration: sec * 0.85, ease: DEVELOP_EASE }, "--reveal": { duration: sec, ease: "linear" } }
              : { duration: 0.2, ease: ease.out }
        }
        style={{
          maskImage: "linear-gradient(to bottom, black calc(var(--reveal) - 60%), transparent var(--reveal))",
          WebkitMaskImage: "linear-gradient(to bottom, black calc(var(--reveal) - 60%), transparent var(--reveal))",
        }}
      >
        {lines.map((l) => (
          <Line key={`a-${l.newNo}`} line={l} state="shown" decision={decision} />
        ))}
      </motion.div>
    </div>
  );
}

const ROW_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

function Line({ line, state, decision }: { line: DiffLine; state: LineState; decision: DiffDecision }) {
  const settled = decision !== "pending";
  const dropped = (decision === "accepted" && line.type === "remove") || (decision === "rejected" && line.type === "add");
  const collapsed = state === "hidden" || dropped;
  const struck = line.type === "remove" && state === "struck" && !settled;
  const tinted = !settled && (struck || (line.type === "add" && state === "shown"));

  return (
    <div
      className={cn(
        "flex min-w-max items-stretch overflow-hidden whitespace-pre motion-reduce:transition-none",
        line.type === "add" && tinted && "bg-emerald-500/8 dark:bg-emerald-400/10",
        line.type === "remove" && tinted && "bg-red-500/8 dark:bg-red-400/10",
      )}
      style={{
        height: collapsed ? 0 : 22,
        opacity: collapsed ? 0 : 1,
        transform: collapsed ? "translateY(4px)" : "translateY(0)",
        transition: `height 240ms ${ROW_EASE}, opacity 200ms ${ROW_EASE}, transform 240ms ${ROW_EASE}, background-color 320ms ease`,
      }}
    >
      <span className="sticky left-0 flex w-[4.5rem] shrink-0 select-none bg-inherit text-[11px] tabular-nums text-zinc-300 dark:text-zinc-600">
        <span className="w-8 pr-1.5 text-right">{line.oldNo ?? ""}</span>
        <span className="w-8 pr-1.5 text-right">{line.newNo ?? ""}</span>
        <span
          className={cn(
            "w-3 text-center transition-opacity duration-300",
            line.type === "add" && "text-emerald-600 dark:text-emerald-400",
            line.type === "remove" && "text-red-500 dark:text-red-400",
            !tinted && "opacity-0",
          )}
        >
          {line.type === "add" ? "+" : line.type === "remove" ? "−" : ""}
        </span>
      </span>
      <span
        className={cn(
          "pr-4 text-zinc-800 transition-[color,text-decoration-color] duration-300 dark:text-zinc-200",
          "line-through decoration-transparent",
          struck && "text-zinc-500 decoration-red-500/40 dark:text-zinc-400",
        )}
      >
        {line.text || " "}
      </span>
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-none transition-[background-color,transform,color] duration-150 ease-out active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15 dark:focus-visible:ring-white/20",
        primary
          ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

InlineDiff.displayName = "InlineDiff";
