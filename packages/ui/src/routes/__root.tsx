import {
  createRootRoute,
  type ErrorComponentProps,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import stylesUrl from "../app.css?url";
import { ShapeProvider } from "@dojofoo/ui";
import { UIXProvider } from "@dojofoo/uix/provider";
import type { ReactNode } from "react";

const themeScript = `document.documentElement.classList.add("dark")`;

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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
        <section className="w-full border border-border bg-surface-1">
          <header className="border-b border-dashed px-6 py-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-red-400">Local UI error</p>
            <h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 max-w-2xl font-prose text-sm text-muted-foreground">
              Dojofoo kept the full local trace below so this failure can be diagnosed instead of hidden.
            </p>
          </header>
          <div className="p-6">
            <pre className="max-h-[55vh] overflow-auto border border-border bg-black p-4 font-mono text-xs leading-5 text-red-200 whitespace-pre-wrap">{trace}</pre>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="border border-border bg-foreground px-4 py-2 text-sm text-background" onClick={reset} type="button">
                Try again
              </button>
              <a className="border border-border px-4 py-2 text-sm text-foreground hover:border-foreground" href="/">
                Back to courses
              </a>
            </div>
          </div>
        </section>
    </main>
  );
}
