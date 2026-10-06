"use client";

import * as React from "react";
import { animate, motion, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { Shield, Check, X } from "@mynaui/icons-react";

import { cn } from "@/lib/utils";
import { duration, ease, spring } from "@/lib/motion-tokens";

export type ApprovalDecision = "allow" | "always" | "deny";
export type ApprovalRisk = "low" | "medium" | "high";

export type ApprovalCardProps = {
  title: string;
  description?: string;
  command?: string;
  risk?: ApprovalRisk;
  icon?: React.ReactNode;
  autoApproveIn?: number;
  allowAlways?: boolean;
  allowLabel?: string;
  alwaysLabel?: string;
  denyLabel?: string;
  decision?: ApprovalDecision | null;
  collapseOnDecide?: boolean;
  children?: React.ReactNode;
  onDecide?: (decision: ApprovalDecision) => void;
  className?: string;
};

const REVEAL = { duration: duration.enter, ease: ease.out } as const;
const ENTER = { ...spring.popover, filter: { duration: 0.24, ease: ease.out } } as const;
const SHAKE = { duration: 0.36, times: [0, 0.2, 0.45, 0.7, 1], ease: "easeOut" as const };

const RISK: Record<ApprovalRisk, { label: string; badge: string; ring: string }> = {
  low: {
    label: "Low risk",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-white/6 dark:text-zinc-400",
    ring: "border-zinc-200/80 dark:border-zinc-800",
  },
  medium: {
    label: "Needs review",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
    ring: "border-amber-200/70 dark:border-amber-400/20",
  },
  high: {
    label: "Destructive",
    badge: "bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300",
    ring: "border-red-200/70 dark:border-red-400/20",
  },
};

const RECEIPT: Record<ApprovalDecision, string> = {
  allow: "Allowed once",
  always: "Always allowed",
  deny: "Denied",
};

export function ApprovalCard({
  title,
  description,
  command,
  risk = "medium",
  icon,
  autoApproveIn = 0,
  allowAlways = true,
  allowLabel = "Allow",
  alwaysLabel = "Always allow",
  denyLabel = "Deny",
  decision: controlled,
  collapseOnDecide = true,
  children,
  onDecide,
  className,
}: ApprovalCardProps) {
  const reduced = !!useReducedMotion();
  const [internal, setInternal] = React.useState<ApprovalDecision | null>(null);
  const decision = controlled === undefined ? internal : controlled;
  const [shaking, setShaking] = React.useState(false);
  const progress = useMotionValue(1);
  const countdown = React.useRef<ReturnType<typeof animate> | null>(null);
  const onDecideRef = React.useRef(onDecide);
  React.useEffect(() => {
    onDecideRef.current = onDecide;
  });

  const decide = React.useCallback(
    (next: ApprovalDecision) => {
      countdown.current?.stop();
      if (next === "deny" && !reduced) setShaking(true);
      setInternal(next);
      onDecideRef.current?.(next);
    },
    [reduced],
  );

  React.useEffect(() => {
    if (!autoApproveIn || decision) return;
    progress.set(1);
    countdown.current = animate(progress, 0, {
      duration: autoApproveIn,
      ease: "linear",
      onComplete: () => decide("allow"),
    });
    return () => countdown.current?.stop();
  }, [autoApproveIn, decision, progress, decide]);

  const pause = () => countdown.current?.pause();
  const resume = () => {
    if (!decision) countdown.current?.play();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (decision) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      decide("allow");
    } else if (e.key === "Escape") {
      e.preventDefault();
      decide("deny");
    }
  };

  const tone = RISK[risk];
  const settled = decision !== null && collapseOnDecide;

  const collapse = reduced ? { duration: 0 } : { duration: 0.32, ease: ease.out };

  return (
    <motion.div
      role="group"
      aria-label={title}
      onKeyDown={onKeyDown}
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      initial={reduced ? false : { opacity: 0, y: 6, scale: 0.98, filter: "blur(6px)" }}
      animate={
        shaking
          ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", x: [0, -5, 4, -2, 0] }
          : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", x: 0 }
      }
      transition={shaking ? { x: SHAKE } : ENTER}
      onAnimationComplete={() => setShaking(false)}
      className={cn(
        "w-full max-w-xl overflow-hidden rounded-none border bg-white text-zinc-900 shadow-[0_20px_70px_-58px_rgba(15,23,42,0.32)] transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-100 dark:shadow-none",
        settled ? "border-zinc-200/80 dark:border-zinc-800" : tone.ring,
        className,
      )}
    >
      <motion.div
        initial={false}
        animate={{ height: settled ? 0 : "auto", opacity: settled ? 0 : 1, filter: settled ? "blur(6px)" : "blur(0px)" }}
        transition={collapse}
        style={{ willChange: "filter" }}
        className="overflow-hidden"
        aria-hidden={settled}
        inert={settled}
      >
        <div className="p-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-none bg-zinc-100 text-zinc-600 dark:bg-white/6 dark:text-zinc-300 [&>svg]:size-4">
              {icon ?? <Shield strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h3>
                <span
                  className={cn(
                    "rounded-none px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em]",
                    tone.badge,
                  )}
                >
                  {tone.label}
                </span>
              </div>
              {description ? (
                <p className="mt-0.5 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">{description}</p>
              ) : null}
            </div>
          </div>

          {command ? (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-none bg-zinc-100 px-3 py-2 font-mono text-[12px] leading-5 text-zinc-800 dark:bg-white/6 dark:text-zinc-200">
              {command}
            </pre>
          ) : null}

          {children ? <div className="mt-3">{children}</div> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ActionButton
              primary
              reduced={reduced}
              disabled={decision !== null}
              onClick={() => decide("allow")}
              hint="↵"
              ring={autoApproveIn > 0 ? <CountdownRing progress={progress} /> : null}
            >
              {allowLabel}
            </ActionButton>
            {allowAlways ? (
              <ActionButton reduced={reduced} disabled={decision !== null} onClick={() => decide("always")}>
                {alwaysLabel}
              </ActionButton>
            ) : null}
            <ActionButton reduced={reduced} disabled={decision !== null} onClick={() => decide("deny")} hint="esc" danger>
              {denyLabel}
            </ActionButton>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ height: decision ? "auto" : 0 }}
        transition={collapse}
        className="overflow-hidden"
      >
        {decision ? <Receipt decision={decision} title={title} command={command} reduced={reduced} inline={!collapseOnDecide} /> : null}
      </motion.div>
    </motion.div>
  );
}

function ActionButton({
  children,
  onClick,
  primary,
  danger,
  hint,
  ring,
  reduced,
  disabled,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  hint?: string;
  ring?: React.ReactNode;
  reduced: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      whileTap={reduced || disabled ? undefined : { scale: 0.96 }}
      transition={spring.press}
      className={cn(
        "group relative inline-flex h-8 items-center gap-2 rounded-none px-3 text-[13px] font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15 dark:focus-visible:ring-white/20",
        primary
          ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          : danger
            ? "text-zinc-600 hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-400/10 dark:hover:text-red-300"
            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200/70 dark:bg-white/6 dark:text-zinc-300 dark:hover:bg-white/10",
      )}
    >
      {ring}
      <span>{children}</span>
      {hint ? (
        <kbd
          className={cn(
            "hidden rounded-none px-1 font-sans text-[10px] leading-4 sm:inline",
            primary ? "bg-white/15 text-white/70 dark:bg-zinc-900/10 dark:text-zinc-900/60" : "bg-zinc-900/6 text-zinc-500 dark:bg-white/8 dark:text-zinc-500",
          )}
        >
          {hint}
        </kbd>
      ) : null}
    </motion.button>
  );
}

function CountdownRing({ progress }: { progress: MotionValue<number> }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-25" />
      <motion.circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ pathLength: progress }}
      />
    </svg>
  );
}

function Receipt({
  decision,
  title,
  command,
  reduced,
  inline,
}: {
  decision: ApprovalDecision;
  title: string;
  command?: string;
  reduced: boolean;
  inline?: boolean;
}) {
  const denied = decision === "deny";
  const detail = command?.split("\n")[0]?.slice(0, 48);
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ ...REVEAL, duration: 0.3, delay: reduced ? 0 : 0.08 }}
      className={cn(
        "flex items-center gap-2.5 text-[12.5px]",
        inline ? "border-t border-zinc-200/80 px-3.5 py-2 dark:border-zinc-800" : "px-3.5 py-2.5",
      )}
    >
      <span className={cn("size-4 shrink-0", denied && "text-red-500")}>
        {denied ? <X className="size-4" /> : <Check className="size-4" />}
      </span>
      <span className={cn("shrink-0 font-medium", denied ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100")}>
        {RECEIPT[decision]}
      </span>
      <span className="truncate text-zinc-500 dark:text-zinc-400">
        {detail ? <span className="font-mono text-[12px]">{detail}</span> : title}
      </span>
    </motion.div>
  );
}

ApprovalCard.displayName = "ApprovalCard";
