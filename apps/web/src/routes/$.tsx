import { createFileRoute, Link, notFound, useLocation } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsSite } from '@dojofoo/uix/docs/layout'
import { createDocsContent } from '@dojofoo/uix/docs/content'
import browserCollections from 'collections/browser'
import { Suspense, useMemo } from 'react'
import { SITE_URL } from '@/lib/site'
import { canonicalLink, DEFAULT_SOCIAL_DESCRIPTION, socialMetadata } from '@/lib/social-metadata'
import { useMDXComponents } from '@/components/mdx'
import { APIPage as OpenAPIPage, type APIPageProps } from '@dojofoo/uix/components/api-reference'

export const Route = createFileRoute('/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? []
    const data = await loader({ data: slugs })
    await clientLoader.preload(data.path)
    return data
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { title, ogUrl } = loaderData
    const description = loaderData.description ?? DEFAULT_SOCIAL_DESCRIPTION
    return {
      meta: [
        { title: `${title} · Dojo.foo` },
        ...socialMetadata({ title, description, url: ogUrl, type: 'article' }),
      ],
      links: [canonicalLink(loaderData.pageUrl)],
    }
  },
})

const loader = createServerFn({ method: 'GET' })
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
      description: page.data.description,
      ogUrl: SITE_URL + page.url,
      sections: (await import('@/lib/uix-docs.server')).getUIXDocsSections(page.path, await page.data.getText('processed')),
      apiPreloaded: api?.preloaded,
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { frontmatter, default: MDX },
    { apiPreloaded }: { apiPreloaded?: APIPageProps['preloaded'] },
  ) {
    const components = useMDXComponents({ OpenAPIPage: (props: Omit<APIPageProps, 'preloaded'>) => {
      if (!apiPreloaded) throw new Error('Missing server-preloaded OpenAPI document.');
      return <OpenAPIPage {...props} preloaded={apiPreloaded} />;
    } })
    return frontmatter._openapi ? <MDX components={components} />
      : <div className="ui-docs__prose prose max-w-none"><div className="ui-result-markdown"><MDX components={components} /></div></div>
  },
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
      renderPage={() => <Suspense>{clientLoader.useContent(path, { apiPreloaded })}</Suspense>} />
  </>
}
