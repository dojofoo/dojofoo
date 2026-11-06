import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import stylesUrl from "../app.css?url";
import { ShapeProvider } from "@dojofoo/ui";
import { LocalErrorPage } from "@dojofoo/uix/pages/local-error";
import { UIXProvider } from "@dojofoo/uix/provider";
import { SidebarStateProvider } from "@/hooks/sidebar-state";
import { documentTransitionScript } from "@dojofoo/uix/lib/view-transition";
import type { ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { RouterLink } from "@/components/router-link";

// Apply the native preference before styles/hydration; UIX continues to own the actual theme transition.
const themeScript = `(() => {
  const root = document.documentElement;
  const key = "dojofoo.theme";
  let mode = "dark";
  try { if (localStorage.getItem(key) === "light") mode = "light"; } catch {}
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  new MutationObserver(() => {
    try { localStorage.setItem(key, root.matches('.dark, [data-theme="dark"]') ? "dark" : "light"); } catch {}
  }).observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "dojo" },
      { name: "description", content: "Dojo web UI" },
    ],
    links: [
      { rel: "stylesheet", href: stylesUrl },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootLayout,
  errorComponent: RootError,
});

function RootLayout() {
  return <RootDocument><Outlet /></RootDocument>;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html className="dark" lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: documentTransitionScript }} />
        <HeadContent />
      </head>
      <body
        suppressHydrationWarning
        className="m-0 min-h-screen bg-background font-sans text-foreground antialiased"
      >
        <UIXProvider link={RouterLink}>
          <ShapeProvider defaultShape="square">
            <SidebarStateProvider>{children}</SidebarStateProvider>
          </ShapeProvider>
        </UIXProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootError({ error, reset }: ErrorComponentProps) {
  return <RootDocument><RouteErrorPanel error={error} reset={reset} /></RootDocument>;
}

export function RouteErrorPanel({ error, reset }: ErrorComponentProps) {
  const trace = error instanceof Error
    ? error.stack ?? `${error.name}: ${error.message}`
    : String(error);
  return <LocalErrorPage trace={trace} onRetry={reset} />;
}
