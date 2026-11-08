import { createFileRoute, Link, notFound, useLocation } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions'
import { DocsSite } from '@dojofoo/uix/docs/layout'
import { createDocsContent } from '@dojofoo/uix/docs/content'
import { Suspense, useMemo } from 'react'
import { SITE_URL } from '@/lib/site'
import { canonicalLink, DEFAULT_SOCIAL_DESCRIPTION, pageImage, socialMetadata } from '@/lib/social-metadata'
import { breadcrumbs, jsonLd, techArticle } from '@/lib/structured-data'
import { DocsPageContent } from '@/components/docs-page-content'
import docsFont from '../docs-font.css?url'
import apiCss from '../api-reference.css?url'

export const Route = createFileRoute('/$')({
  // A docs page's social card beside it, at its address + /og.webp; every other request is the page
  server: {
    handlers: {
      GET: async ({ request, next }) => {
        const { pathname } = new URL(request.url)
        if (!pathname.endsWith('/og.webp')) return next()
        return (await import('@/lib/og-pages')).docsCard(pathname.slice(0, -'/og.webp'.length) || '/')
      },
    },
  },
  component: Page,
  staleTime: Infinity,
  preloadStaleTime: Infinity,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? []
    const data = await loader({ data: slugs })
    const { preloadDocsContent } = await import('@/components/docs-page-content')
    await preloadDocsContent(data.path)
    return data
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { title, ogUrl } = loaderData
    const description = loaderData.description ?? DEFAULT_SOCIAL_DESCRIPTION
    return {
      meta: [
        // A command's page is named by the command, as it's typed: "dojofoo install"
        { title: loaderData.pageUrl.startsWith('/docs/commands/') ? `dojofoo ${title}` : title },
        ...socialMetadata({ title, description, url: ogUrl, type: 'article', image: pageImage(loaderData.pageUrl) }),
      ],
      links: [canonicalLink(loaderData.pageUrl), { rel: 'stylesheet', href: docsFont }, { rel: 'preconnect', href: 'https://cdnjs.cloudflare.com', crossOrigin: 'anonymous' }, ...(loaderData.apiPreloaded ? [{ rel: 'stylesheet', href: apiCss }] : [])],
      scripts: [jsonLd(
        techArticle({ headline: title, description: loaderData.description, path: loaderData.pageUrl }),
        breadcrumbs(loaderData.trail),
      )],
    }
  },
})

const loader = createServerFn({ method: 'GET' })
  .middleware([staticFunctionMiddleware])
  .validator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    // Lazy import severs the static client→server dep edge so that
    // .source/server.ts (which uses node:path) never lands in the browser bundle.
    const { source } = await import('@/lib/source')
    const page = source.getPage(slugs)
    if (!page) throw notFound()
    const { renderToStaticMarkup } = await import('react-dom/server')
    const api = page.data._openapi ? await (await import('@/lib/openapi.server')).openapi.preloadOpenAPIPage(page) : undefined

    return {
      slugs: page.slugs,
      path: page.path,
      pageUrl: page.url,
      headings: page.data.toc.map(heading => ({ id: heading.url.slice(1), depth: heading.depth, html: renderToStaticMarkup(heading.title) })),
      title: page.data.title,
      // The docs above it that have a page of their own, then it: its breadcrumbs
      trail: [...page.slugs.map((_, index) => source.getPage(page.slugs.slice(0, index))).filter(parent => parent !== undefined).map(parent => [parent.data.title, parent.url] as const), [page.data.title, page.url] as const],
      description: page.data.description,
      ogUrl: SITE_URL + page.url,
      sections: (await import('@/lib/uix-docs.server')).getUIXDocsSections(page.path, await page.data.getText('processed')),
      apiPreloaded: api?.preloaded,
    }
  })

function Page() {
  const { slugs, path, pageUrl, sections, headings, apiPreloaded } = Route.useLoaderData()
  const location = useLocation()
  const docPath = pageUrl + (location.pathname.replace(/\/$/, '') === pageUrl && location.hash ? `#${location.hash}` : '')
  const content = useMemo(() => createDocsContent(sections), [sections])
  const toc = useMemo(() => headings.map(heading => ({ id: heading.id, depth: heading.depth, text: <span dangerouslySetInnerHTML={{ __html: heading.html }} /> })), [headings])
  const markdownUrl = `/llms.mdx/docs/${[...slugs, 'index.mdx'].join('/')}`
  return <>
    <Link to={markdownUrl} hidden />
    <DocsSite path={docPath} content={content} toc={toc}
      renderPage={() => <Suspense><DocsPageContent path={path} apiPreloaded={apiPreloaded} /></Suspense>} />
  </>
}
