import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import { useEffect } from "react"
import { RootProvider } from "fumadocs-ui/provider/tanstack"
import SearchDialog from "@/components/search"
import { DEFAULT_SOCIAL_DESCRIPTION, DEFAULT_TITLE, faviconLinks, socialMetadata } from "@/lib/social-metadata"
import { SITE_URL } from "@/lib/site"
import { ShapeProvider } from "@dojofoo/ui"
import { documentTransitionScript } from "@dojofoo/uix/lib/view-transition"
import { UIXProvider } from "@dojofoo/uix/provider"
import appCss from "../styles.css?url"
import uixCss from "@dojofoo/uix/styles.css?url"
import uixFonts from "@dojofoo/uix/fonts.css?url"
import { UIXSiteProvider } from "@/components/uix-site"
import { RouterLink } from "@/components/router-link"

export const Route = createRootRoute({
  head: () => ({
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
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: uixCss },
      { rel: "stylesheet", href: uixFonts },
      ...faviconLinks,
    ],
  }),
  component: RootLayout,
})

function RootLayout() {
  // The root's effect runs after every child's, so this marks the hydrated, interactive page.
  useEffect(() => { document.documentElement.dataset.hydrated = "true" }, [])
  return (
    <html lang="en" className="dark" data-ui-font="common" suppressHydrationWarning>
      <head>
        {/* Cross-document lifecycle events can fire before hydration and the first render. */}
        <script dangerouslySetInnerHTML={{ __html: documentTransitionScript }} />
        <HeadContent />
      </head>
      <body className="min-h-screen antialiased flex flex-col font-sans" suppressHydrationWarning>
        <UIXProvider link={RouterLink}>
          <RootProvider
            theme={{ defaultTheme: "dark" }}
            search={{ SearchDialog }}
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
