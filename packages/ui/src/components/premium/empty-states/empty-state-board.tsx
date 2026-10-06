"use client";

import { ArrowUpRight, MousePointer as MousePointer2, Plus } from "@mynaui/icons-react";
import { motion } from "motion/react";
import { Button } from "../../motion/button/base";
import { SPRING_LAYOUT, SPRING_PANEL } from "../../../lib/ease";
import { useHoverCapable } from "../../../lib/hooks/use-hover-capable";
import { cn } from "../../../lib/utils";
import { useEmptyStateStage } from "./use-empty-state-stage";

/* ─────────────────────────────────────────────────────────
 * BOARD EMPTY STATE STORYBOARD
 *
 *    0ms   heading and create action are available
 *   80ms   blank columns rise into view
 *  240ms   starter card enters the board
 *  420ms   cursor arrives beside the card
 * ───────────────────────────────────────────────────────── */
const TIMING = {
  columns: 80,
  card: 240,
  cursor: 420,
} as const;

const STAGES = Object.values(TIMING);

export type EmptyStateBoardProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  columns?: readonly [string, string, string];
  cursorLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyStateBoard({
  eyebrow = "Projects / empty",
  title = "Start with one thing.",
  description = "Create the first project. The rest of the board can wait.",
  columns = ["Queue", "Doing", "Done"],
  cursorLabel = "drag to begin",
  actionLabel = "New project",
  onAction,
  className,
}: EmptyStateBoardProps) {
  const { stage, reduce } = useEmptyStateStage(STAGES);
  const canHover = useHoverCapable();

  return (
    <section
      className={cn(
        "mx-auto flex min-h-[420px] w-full max-w-[600px] flex-col justify-between overflow-hidden bg-background px-5 py-7 text-foreground sm:px-7",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
            {eyebrow}
          </span>
          <h2 className="mt-2 max-w-md text-balance font-semibold text-2xl tracking-[-0.04em]">
            {title}
          </h2>
        </div>
        <ArrowUpRight className="mt-1 size-5 text-muted-foreground" />
      </div>

      <motion.div
        aria-hidden="true"
        className="relative my-6 grid min-h-[185px] grid-cols-3 gap-2"
        initial={{ opacity: 0, y: 14 }}
        animate={{
          opacity: stage >= 1 ? 1 : 0,
          y: stage >= 1 ? 0 : 14,
        }}
        transition={reduce ? { duration: 0 } : SPRING_PANEL}
        whileHover={reduce || !canHover ? undefined : "placed"}
      >
        {columns.map((label) => (
          <div key={label} className="relative border border-border p-2">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2 font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em] sm:text-[10px]">
              <span>{label}</span>
              <span>00</span>
            </div>
          </div>
        ))}

        <motion.div
          className="absolute left-[7%] top-[31%] w-[27%] border border-foreground bg-background p-3"
          initial={{ opacity: 0, x: -24, rotate: -3 }}
          animate={{
            opacity: stage >= 2 ? 1 : 0,
            x: stage >= 2 ? 0 : -24,
            rotate: stage >= 2 ? 0 : -3,
          }}
          variants={{
            placed: { x: "122%", rotate: 1 },
          }}
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="size-2 rounded-full bg-primary" />
            <span className="font-mono text-[8px] text-muted-foreground">
              001
            </span>
          </div>
          <div className="h-1.5 w-4/5 bg-foreground" />
          <div className="mt-2 h-1.5 w-1/2 bg-muted-foreground/30" />
        </motion.div>

        <motion.div
          className="absolute left-[31%] top-[64%] flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground"
          initial={{ opacity: 0, x: -12, y: 12 }}
          animate={{
            opacity: stage >= 3 ? 1 : 0,
            x: stage >= 3 ? 0 : -12,
            y: stage >= 3 ? 0 : 12,
          }}
          variants={{
            placed: { x: "115%", y: -20 },
          }}
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
        >
          <MousePointer2 className="size-4 fill-background" />
          {cursorLabel}
        </motion.div>
      </motion.div>

      <div className="flex items-end justify-between gap-5 border-t border-border pt-5">
        <p className="max-w-[250px] text-pretty text-muted-foreground text-xs leading-5 sm:text-sm">
          {description}
        </p>
        <Button onClick={onAction} size="sm" className="shrink-0">
          <Plus aria-hidden="true" className="size-3.5" />
          {actionLabel}
        </Button>
      </div>
    </section>
  );
}
