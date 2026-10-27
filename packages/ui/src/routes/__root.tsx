import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import stylesUrl from "../app.css?url";
import { ShapeProvider } from "@dojofoo/ui";
import { Button } from "@dojofoo/uix/components/button";
import { UIXProvider } from "@dojofoo/uix/provider";
import { documentTransitionScript } from "@dojofoo/uix/lib/view-transition";
import type { ReactNode } from "react";

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

export const Route = createRootRoute({
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
        <UIXProvider>
          <ShapeProvider defaultShape="square">
            {children}
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
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--surface-1)] px-6 py-12 text-[var(--fluid-foreground)]" style={{ fontFamily: "var(--ui-font, 'Inter Variable', sans-serif)" }}>
        <section className="w-full min-w-0 max-w-2xl bg-[var(--surface-2)] p-6" style={{ borderRadius: "var(--box-radius)", boxShadow: "var(--shadow-3)" }}>
          <header className="mb-5">
            <p className="text-xs text-destructive">Local UI error</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--fluid-muted)]">
              Dojofoo kept the full local trace below so this failure can be diagnosed instead of hidden.
            </p>
          </header>
          <div>
            <pre className="scroll-fade max-h-[55vh] overflow-auto bg-[var(--surface-1)] p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words" style={{ borderRadius: "var(--box-radius)" }}>{trace}</pre>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button onClick={reset} type="button">
                Try again
              </Button>
              <a className="text-sm text-[var(--fluid-muted)] underline underline-offset-4 hover:text-[var(--fluid-foreground)]" href="/">
                Back to courses
              </a>
            </div>
          </div>
        </section>
    </main>
  );
}
