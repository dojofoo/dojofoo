import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import stylesUrl from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "dojo" },
      { name: "description", content: "Dojo web UI" },
    ],
    links: [{ rel: "stylesheet", href: stylesUrl }],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        suppressHydrationWarning
        className="m-0 min-h-screen bg-white font-mono text-neutral-900"
      >
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
