import { Presence } from "@radix-ui/react-presence";
import { useMediaQuery } from "fumadocs-core/utils/use-media-query";
import { createContext, use, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/*
 * Epicat's phone sidebar (packages/docs/src/components/docs/layout/sidebar/base.tsx and notebook/sidebar.tsx): a plain
 * aside sliding in on CSS keyframes from Fumadocs' preset, over an overlay, mounted only while it's open. Its parts as
 * epicat has them, less the desktop sidebar, the page tree and the translations; the site closes it on a link instead
 * of on a path change.
 */

interface SidebarContext {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mode: Mode;
}

type Mode = "drawer" | "full";

const SidebarContext = createContext<SidebarContext | null>(null);

export function SidebarProvider({ children, query = "(width < 768px)" }: { children?: ReactNode; /** UIX: where it's a drawer */ query?: string }) {
  const [open, setOpen] = useState(false);
  const mode: Mode = useMediaQuery(query) ? "drawer" : "full";

  return (
    <SidebarContext
      value={useMemo(
        () => ({
          open,
          setOpen,
          mode,
        }),
        [open, mode],
      )}
    >
      {children}
    </SidebarContext>
  );
}

export function useSidebar(): SidebarContext {
  const ctx = use(SidebarContext);
  if (!ctx)
    throw new Error("Missing SidebarContext, make sure you have wrapped the component in <SidebarProvider />.");

  return ctx;
}

export function SidebarDrawerOverlay(props: ComponentProps<"div">) {
  const { open, setOpen, mode } = useSidebar();

  if (mode !== "drawer") return;
  return (
    <Presence present={open}>
      <div
        aria-label="Close Navigation"
        data-state={open ? "open" : "closed"}
        role="button"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setOpen(false);
        }}
        {...props}
      />
    </Presence>
  );
}

export function SidebarDrawerContent({ className, children, ...props }: ComponentProps<"aside">) {
  const { open, mode } = useSidebar();
  const state = open ? "open" : "closed";

  if (mode !== "drawer") return;
  return (
    <Presence present={open}>
      {({ present }) => (
        <aside
          id="nd-sidebar-mobile"
          data-state={state}
          className={cn(!present && "invisible", className)}
          {...props}
        >
          {children}
        </aside>
      )}
    </Presence>
  );
}

export function SidebarDrawer({
  children,
  className,
  ...props
}: ComponentProps<typeof SidebarDrawerContent>) {
  return (
    <>
      <SidebarDrawerOverlay className="data-[state=open]:animate-fd-fade-in data-[state=closed]:animate-fd-fade-out fixed inset-0 z-40 backdrop-blur-xs" />
      <SidebarDrawerContent
        className={cn(
          "bg-fd-background data-[state=open]:animate-fd-sidebar-in data-[state=closed]:animate-fd-sidebar-out fixed inset-y-0 end-0 z-40 flex w-[85%] max-w-[380px] flex-col border-s text-[0.9375rem] shadow-lg",
          className,
        )}
        {...props}
      >
        {children}
      </SidebarDrawerContent>
    </>
  );
}

export function SidebarTrigger({ children, ...props }: ComponentProps<"button">) {
  const { setOpen } = useSidebar();

  return (
    <button
      aria-label="Open Sidebar"
      onClick={() => setOpen((prev) => !prev)}
      {...props}
    >
      {children}
    </button>
  );
}
