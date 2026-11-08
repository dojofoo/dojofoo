import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import { useEffect } from "react"
import { RootProvider } from "fumadocs-ui/provider/tanstack"
import { lazy } from "react"
import { DEFAULT_SOCIAL_DESCRIPTION, DEFAULT_TITLE, faviconLinks, socialMetadata } from "@/lib/social-metadata"
import { SITE_URL } from "@/lib/site"
import { ShapeProvider } from "@dojofoo/uix/lib/shape-context"
import { documentTransitionScript } from "@dojofoo/uix/lib/view-transition"
import { UIXProvider } from "@dojofoo/uix/provider"
import "../site.css"
import interLanding from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url"
import interLatin from "@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2?url"
import { UIXSiteProvider } from "@/components/uix-site"
import { RouterLink } from "@/components/router-link"

const SearchDialog = lazy(() => import("@/components/search"))

export const Route = createRootRoute({
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: DEFAULT_TITLE },
      ...socialMetadata({
        title: DEFAULT_TITLE,
        description: DEFAULT_SOCIAL_DESCRIPTION,
        url: `${SITE_URL}/`,
      }),
    ],
    links: [
      { rel: "preload", href: matches.at(-1)?.pathname === "/" ? interLanding : interLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      ...faviconLinks,
    ],
  }),
  component: RootLayout,
})

function RootLayout() {
  // The root's effect runs after every child's, so this marks the hydrated, interactive page.
  useEffect(() => { document.documentElement.dataset.hydrated = "true" }, [])
  return (
    <html lang="en" className="dark [scrollbar-gutter:stable]" data-ui-font="common" suppressHydrationWarning>
      <head>
        {/* Cross-document lifecycle events can fire before hydration and the first render. */}
        <script dangerouslySetInnerHTML={{ __html: documentTransitionScript }} />
        <HeadContent />
      </head>
      <body className="min-h-screen antialiased flex flex-col font-sans" suppressHydrationWarning>
        <UIXProvider link={RouterLink}>
          <RootProvider
            theme={{ defaultTheme: "dark" }}
            search={{ SearchDialog, preload: false }}
          >
            <ShapeProvider defaultShape="square">
              <UIXSiteProvider><Outlet /></UIXSiteProvider>
            </ShapeProvider>
          </RootProvider>
        </UIXProvider>
        <Scripts />
      </body>
    </html>
  )
}
