import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import { RootProvider } from "fumadocs-ui/provider/tanstack"
import SearchDialog from "@/components/search"
import { DEFAULT_SOCIAL_DESCRIPTION, socialMetadata } from "@/lib/social-metadata"
import { ShapeProvider } from "@dojofoo/ui"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "dojofoo" },
      ...socialMetadata({
        title: "dojofoo",
        description: DEFAULT_SOCIAL_DESCRIPTION,
        url: "https://dojo.foo",
      }),
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
