"use client";

// Scroll area built on Base UI — shared rectangular scrollbar, native overflow
// fallback on touch-primary devices. Scrollbar
// machinery adapted from Lina by SameerJS6 (https://lina.sameer.sh); built on
// @base-ui/react/scroll-area, whose scrollbars stay mounted while scrollable
// and expose hover/scroll state as data attributes instead of Radix's
// show/hide presence animation.

import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "../../lib/utils";
import { useTouchPrimary } from "../../hooks/use-touch-primary";

// On touch-primary devices the Base UI machinery is skipped entirely in
// favour of native overflow scrolling (better physics, momentum,
// rubber-banding); the context lets the exported ScrollBar no-op there.
const ScrollAreaContext = createContext<boolean>(false);

type Orientation = "vertical" | "horizontal" | "both";

interface ScrollAreaProps extends ComponentPropsWithoutRef<"div"> {
  viewportClassName?: string;
  /** Which axes get scrollbars. Defaults to `"vertical"`. */
  orientation?: Orientation;
}

const ScrollArea = forwardRef<
  ComponentRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(
  (
    {
      className,
      children,
      viewportClassName,
      orientation = "vertical",
      ...props
    },
    ref
  ) => {
    const isTouch = useTouchPrimary();

    return (
      <ScrollAreaContext.Provider value={isTouch}>
        {isTouch ? (
          <div
            ref={ref}
            role="group"
            data-slot="scroll-area"
            aria-roledescription="scroll area"
            className={cn("relative overflow-hidden", className)}
            {...props}
          >
            <div
              data-slot="scroll-area-viewport"
              className={cn(
                "size-full rounded-[inherit]",
                orientation === "vertical" && "overflow-y-auto",
                orientation === "horizontal" && "overflow-x-auto",
                orientation === "both" && "overflow-auto",
                viewportClassName
              )}
              tabIndex={0}
            >
              {children}
            </div>
          </div>
        ) : (
          <ScrollAreaPrimitive.Root
            ref={ref}
            data-slot="scroll-area"
            className={cn("relative overflow-hidden", className)}
            {...props}
          >
            <ScrollAreaPrimitive.Viewport
              data-slot="scroll-area-viewport"
              className={cn("size-full rounded-[inherit]", viewportClassName)}
            >
              {/* Content gives Base UI an intrinsic size to measure
                  horizontal overflow against. */}
            <ScrollAreaPrimitive.Content
              className={orientation === "vertical" ? "min-w-full w-full" : undefined}
              style={orientation === "vertical" ? { minWidth: "100%", width: "100%" } : undefined}
            >
              {children}
            </ScrollAreaPrimitive.Content>
            </ScrollAreaPrimitive.Viewport>
            {orientation !== "horizontal" && <ScrollBar orientation="vertical" />}
            {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
            {orientation === "both" && <ScrollAreaPrimitive.Corner />}
          </ScrollAreaPrimitive.Root>
        )}
      </ScrollAreaContext.Provider>
    );
  }
);

ScrollArea.displayName = "ScrollArea";

const ScrollBar = forwardRef<
  ComponentRef<typeof ScrollAreaPrimitive.Scrollbar>,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => {
  const isTouch = useContext(ScrollAreaContext);

  if (isTouch) return null;

  return (
    <ScrollAreaPrimitive.Scrollbar
      ref={ref}
      orientation={orientation}
      data-slot="scroll-area-scrollbar"
      // Base UI keeps the scrollbar mounted while scrollable; visibility is
      // a plain opacity transition off its hover/scroll state attributes,
      // matching the cue fade — 160ms in, 120ms out (exits faster, per the
      // animation guidelines); spring tokens are framer-motion configs and
      // don't apply here.
      className={cn(
        // Keep the 10px hit target even when the visual thumb is compact.
        "group/scrollbar absolute z-20 flex touch-none select-none",
        // Show immediately on interaction, then fade after a short delay.
        "opacity-0 transition-opacity duration-120 ease-out delay-160",
        "data-[hovering]:duration-160 data-[scrolling]:duration-160",
        "data-[hovering]:opacity-100 data-[scrolling]:opacity-100",
        "data-[hovering]:delay-0 data-[scrolling]:delay-0",
        orientation === "vertical" && "top-0 right-0 h-full w-2.5",
        orientation === "horizontal" && "bottom-0 left-0 h-2.5 w-full flex-col",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className={cn(
          // Colors and width are shared with native and editor scrollbars.
          "relative transition-colors duration-150",
          orientation === "vertical" &&
            "ml-auto w-[var(--scrollbar-size)] h-[var(--scroll-area-thumb-height)]",
          orientation === "horizontal" &&
            "mt-auto h-[var(--scrollbar-size)] w-[var(--scroll-area-thumb-width)]"
        )}
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
});

ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
export type { ScrollAreaProps };
