"use client";

import { type ComponentProps, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";
import { TextMorph } from "../../arc/text-morph/text-morph";
import { activityLabels, reasoningLabels, reasoningCycleMs, type ActivityKind } from "@/lib/chat-activity-labels";

export type ThinkingIndicatorProps = Omit<ComponentProps<"div">, "children" | "label" | "elapsed"> & {
  label: string;
  elapsed?: string;
  active?: boolean;
  activity?: ActivityKind;
};

export function ThinkingIndicator({
  label,
  elapsed,
  active = true,
  activity,
  className,
  ...props
}: ThinkingIndicatorProps) {
  const reducedMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!active || activity !== "thinking" || reducedMotion) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % reasoningLabels.length), reasoningCycleMs);
    return () => clearInterval(timer);
  }, [active, activity, reducedMotion]);
  const variant = activity === "thinking" ? reasoningLabels[frame] : activityLabels[activity ?? "thinking"];
  const text = active && activity ? variant.label : label;
  return (
    <div
      data-slot="thinking-indicator"
      data-activity={activity}
      data-activity-label={text}
      role="status"
      className={cn(
        "text-foreground/55 flex items-center gap-3 text-sm",
        className,
      )}

      {...props}
    >
      <span className="grid size-5 shrink-0 place-items-center" aria-hidden>
      <span
        aria-hidden
        data-thinking-dot={active ? "active" : "complete"}
        className={cn("size-1.5 shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none", active ? `animate-pulse motion-reduce:animate-none ${variant.color}` : "bg-muted-foreground/50")}
      />
      </span>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="inline-flex shrink-0 overflow-visible leading-none"><TextMorph>{text}</TextMorph></span>
      {elapsed !== undefined && (
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>
          {elapsed}
        </span>
      )}
    </div>
  );
}
