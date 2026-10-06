"use client";

import type { ComponentProps } from "react";
import { Check as CheckIcon, Spinner as Loader2Icon, X as XIcon } from "@mynaui/icons-react";
import { cn } from "../../lib/utils";
import { mono, paper } from "./surfaces";
import { take } from "./range";

export function TerminalBlock({
  command,
  lines,
  visibleCount,
  done,
  failed = false,
  variant = "paper",
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "command" | "lines" | "visibleCount" | "done" | "failed" | "variant"
> & {
  command: string;
  lines: readonly string[];
  visibleCount: number;
  done: boolean;
  failed?: boolean;
  variant?: "paper" | "ink";
}) {
  const ink = variant === "ink";

  return (
    <div
      data-slot="terminal-block"
      className={cn(
        ink ? "bg-foreground dark:bg-popover" : paper,
        "w-full max-w-md overflow-hidden font-mono text-xs",
        className,
      )}

      {...props}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <span
          className={cn(
            ink
              ? "text-background/90 dark:text-foreground/90"
              : "text-foreground/90",
          )}
        >
          {command}
        </span>
        {done ? (
          <div className="flex items-center gap-1">
            {failed
              ? <XIcon className="size-3 text-red-500" />
              : <CheckIcon className="size-3 text-emerald-500" />}
            <span
              className={cn(
                mono,
                ink
                  ? "text-background/40 dark:text-foreground/40"
                  : "text-foreground/40",
              )}
            >
              exit {failed ? 1 : 0}
            </span>
          </div>
        ) : (
          <Loader2Icon
            className={cn(
              "size-3 animate-spin motion-reduce:animate-none",
              ink
                ? "text-background/35 dark:text-foreground/35"
                : "text-foreground/35",
            )}
          />
        )}
      </div>
      <div
        className={cn(
          "flex flex-col gap-1 px-4 pt-1 pb-3.5",
          ink
            ? "text-background/55 dark:text-foreground/50"
            : "text-foreground/50",
        )}
      >
        {take(lines, visibleCount).map((line, i) => {
          const isLast = i === lines.length - 1;
          return (
            <div
              key={`${i}-${line}`}
              className={cn(
                "fade-in animate-in fill-mode-both duration-300",
                isLast &&
                  (ink
                    ? "text-background/90 dark:text-foreground/90"
                    : "text-foreground/90"),
              )}
            >
              {line}
            </div>
          );
        })}
        {!done && (
          <span
            aria-hidden
            className="inline-block h-3 w-1.5 animate-pulse bg-blue-500/70 motion-reduce:animate-none dark:bg-blue-400/70"
          />
        )}
      </div>
    </div>
  );
}
