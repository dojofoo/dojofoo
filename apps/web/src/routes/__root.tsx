import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import { RootProvider } from "fumadocs-ui/provider/tanstack"
import SearchDialog from "@/components/search"
import { ShapeProvider } from "@dojocho/ui"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "dojofoo" },
      { name: "description", content: "Installable coding dojos that turn your AI agent into a sensei." },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://dojo.foo" },
      { property: "og:title", content: "dojofoo" },
      { property: "og:description", content: "Installable coding dojos that turn your AI agent into a sensei." },
      { property: "og:image", content: "https://dojo.foo/og/landing.webp" },
      // Twitter
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@tomhacks" },
      { name: "twitter:title", content: "dojofoo" },
      { name: "twitter:description", content: "Installable coding dojos that turn your AI agent into a sensei." },
      { name: "twitter:image", content: "https://dojo.foo/og/landing.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  component: RootLayout,
})

function RootLayout() {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen antialiased flex flex-col" suppressHydrationWarning>
        <RootProvider
          theme={{ defaultTheme: "dark" }}
          search={{ SearchDialog }}
        >
          <ShapeProvider defaultShape="square">
            <Outlet />
          </ShapeProvider>
        </RootProvider>
        <Scripts />
      </body>
    </html>
  )
}
