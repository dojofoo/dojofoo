import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import "@fontsource/iosevka/400.css";
import stylesUrl from "../styles.css?url";
import { ShapeProvider } from "@dojocho/ui";

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
      { rel: "icon", href: "/dojocho-black.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <html className="dark" lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        suppressHydrationWarning
        className="m-0 min-h-screen bg-background font-sans text-foreground antialiased"
      >
        <ShapeProvider defaultShape="square">
          <Outlet />
        </ShapeProvider>
        <Scripts />
      </body>
    </html>
  );
}
