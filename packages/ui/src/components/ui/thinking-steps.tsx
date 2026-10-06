import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Sparkles as Brain,
  Check,
  ChevronRight,
  Globe,
  Image,
  Monitor,
  Pencil,
  Search,
  Cog as Settings,
} from "@mynaui/icons-react";
import { createContext, type HTMLAttributes, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ThinkingContext = createContext(false);

export function ThinkingSteps({
  children,
  className,
  defaultOpen = true,
  onOpenChange,
  open: controlledOpen,
}: HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; open?: boolean }) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  useEffect(() => {
    if (controlledOpen === undefined) setLocalOpen(defaultOpen);
  }, [controlledOpen, defaultOpen]);
  const changeOpen = (value: boolean) => {
    if (controlledOpen === undefined) setLocalOpen(value);
    onOpenChange?.(value);
  };
  return (
    <Collapsible.Root className={cn("w-full", className)} onOpenChange={changeOpen} open={open}>
      <ThinkingContext.Provider value={open}>{children}</ThinkingContext.Provider>
    </Collapsible.Root>
  );
}

export function ThinkingStepsHeader({
  active = false,
  children = "Thinking",
  completedAt,
  startedAt,
}: {
  active?: boolean;
  children?: ReactNode;
  completedAt?: number;
  startedAt?: number;
}) {
  const open = useContext(ThinkingContext);
  const localStartedAt = useRef<number | null>(startedAt ?? (active ? Date.now() : null));
  const [elapsedMilliseconds, setElapsedMilliseconds] = useState(
    startedAt !== undefined && completedAt !== undefined ? Math.max(0, completedAt - startedAt) : 0,
  );

  useEffect(() => {
    if (startedAt !== undefined) localStartedAt.current = startedAt;
    if (active && localStartedAt.current === null) localStartedAt.current = Date.now();
    const update = () => {
      if (localStartedAt.current === null) return;
      setElapsedMilliseconds(Math.max(0, (completedAt ?? Date.now()) - localStartedAt.current));
    };
    update();
    if (!active) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active, completedAt, startedAt]);

  const elapsed = formatElapsedDuration(elapsedMilliseconds);
  const defaultLabel = active
    ? formatActivityLabel("Working", elapsed)
    : formatActivityLabel("Worked", elapsed);
  const label = children === "Thinking" ? defaultLabel : children;
  return (
    <Collapsible.Trigger className="flex items-center gap-2 py-1 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground">
      <span className={active ? "shimmer-text" : undefined}>{label}</span>
      <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
    </Collapsible.Trigger>
  );
}

export function formatElapsedDuration(milliseconds: number): string {
  if (milliseconds <= 0) return "";
  if (milliseconds < 1000) return "<1s";
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

export function formatActivityLabel(label: "Waiting" | "Working" | "Worked", elapsed: string): string {
  return elapsed ? `${label} · ${elapsed}` : label;
}

export function ThinkingStepsContent({ children }: { children: ReactNode }) {
  return <Collapsible.Content className="w-full pt-2">{children}</Collapsible.Content>;
}

export function ThinkingStep({
  children,
  description,
  icon = "brain",
  isLast = false,
  label,
  status = "complete",
}: {
  children?: ReactNode;
  description?: string;
  icon?: keyof typeof icons;
  isLast?: boolean;
  label?: ReactNode;
  status?: "active" | "complete" | "pending";
}) {
  if (status === "pending") return null;
  const Icon = icons[icon];
  return (
    <div className="relative flex gap-3 pb-4 text-sm last:pb-1">
      {!isLast && <span className="absolute bottom-0 left-[9px] top-5 w-px bg-border" />}
      <span className={cn("relative z-10 flex size-[19px] shrink-0 items-center justify-center bg-background", status === "active" ? "text-foreground" : "text-muted-foreground")}>
        <Icon className={cn("size-3.5", status === "active" && "animate-pulse")} />
      </span>
      <div className="min-w-0 flex-1">
        {label && <div className={status === "active" ? "shimmer-text" : "text-muted-foreground"}>{label}</div>}
        {description && <div className="mt-0.5 whitespace-pre-wrap font-prose text-xs text-muted-foreground">{description}</div>}
        {children && <div className={cn("w-full", label && "mt-2")}>{children}</div>}
      </div>
    </div>
  );
}

const icons = { brain: Brain, check: Check, globe: Globe, image: Image, monitor: Monitor, pencil: Pencil, search: Search, settings: Settings };

export function ThinkingStepSources({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

export function ThinkingStepSource({ children }: { children: ReactNode }) {
  return <span className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">{children}</span>;
}

export function ThinkingStepDetails({ details, summary }: { details: string[]; summary: string }) {
  return (
    <details className="border-l border-border pl-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer">{summary}</summary>
      <ul className="mt-2 space-y-1">{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
    </details>
  );
}

export function ThinkingStepImage({ caption, src }: { caption?: string; src: string }) {
  return <figure><img alt={caption ?? "Thinking step"} className="max-h-48 border border-border object-cover" src={src} />{caption && <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption>}</figure>;
}
