"use client";

import { forwardRef, useLayoutEffect, useRef, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from "react";
import { cn } from "../../lib/utils";
import { ScrollArea } from "./scroll-area";

export const ChatContainer = forwardRef<HTMLElement, ComponentPropsWithoutRef<"aside">>(
  ({ className, ...props }, ref) => (
    <aside
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-dashed bg-surface-2", className)}
      ref={ref}
      {...props}
    />
  ),
);
ChatContainer.displayName = "ChatContainer";

export function ChatContainerHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("flex min-h-14 flex-wrap items-start justify-start gap-x-3 gap-y-2 border-b border-dashed px-4 py-2", className)} {...props} />;
}

export function ChatContainerContent({
  children,
  className,
  viewportRef,
}: {
  children: ReactNode;
  className?: string;
  viewportRef?: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (viewportRef) viewportRef.current = rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;
    return () => {
      if (viewportRef) viewportRef.current = null;
    };
  }, [viewportRef]);

  return (
    <ScrollArea className="scrollbar-compact min-h-0 min-w-0 flex-1 [--chat-gutter:1rem]" ref={rootRef} viewportClassName="scroll-fade min-w-0 px-[var(--chat-gutter)] py-4">
      <div className={cn("flex min-h-full min-w-0 max-w-full flex-col gap-4", className)}>
        {children}
      </div>
    </ScrollArea>
  );
}

export function ChatContainerFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="chat-composer" className={cn("border-t border-dashed [&_[data-slot=input-message]]:border-0 [&_[data-slot=input-message]]:shadow-none!", className)} {...props} />;
}
