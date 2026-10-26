import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from '@/components/layout/notebook'
import { SiteFooter } from '@/components/layout/site-footer'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from '@/components/layout/notebook/page'
import browserCollections from 'collections/browser'
import { Suspense } from 'react'
import { SITE_URL } from '@/lib/site'
import { DEFAULT_SOCIAL_DESCRIPTION, socialMetadata } from '@/lib/social-metadata'
import { useMDXComponents } from '@/components/mdx'
import { OpenAPIPage, type APIPageProps } from '@dojofoo/ui/api-reference'
import { baseOptions } from '@/lib/layout.shared'
import { useFumadocsLoader } from 'fumadocs-core/source/client'

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
        { title: `${title} — dojofoo` },
        ...socialMetadata({ title, description, url: ogUrl, type: 'article' }),
      ],
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
    const api = page.data._openapi ? await (await import('@/lib/openapi.server')).openapi.preloadOpenAPIPage(page) : undefined

    return {
      slugs: page.slugs,
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      ogUrl: SITE_URL + page.url,
      pageTree: await source.serializePageTree(source.getPageTree()),
      apiPreloaded: api?.preloaded,
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    {
      markdownUrl,
      path,
      apiPreloaded,
    }: {
      markdownUrl: string
      path: string
      apiPreloaded?: APIPageProps['preloaded']
    },
  ) {
    return (
      <DocsPage toc={toc} full={frontmatter.full} className={frontmatter._openapi ? 'dojo-api-page' : undefined} tableOfContent={frontmatter._openapi ? { enabled: false } : undefined}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={useMDXComponents({ OpenAPIPage: props => <OpenAPIPage {...props} preloaded={apiPreloaded} /> })} />
        </DocsBody>
      </DocsPage>
    )
  },
})

const sidebarTabs = [
  { title: 'Usage', url: '/docs' },
  { title: 'Authoring', url: '/authoring' },
  { title: 'Developers', url: '/developers' },
]

function Page() {
  const { pageTree, slugs, path, apiPreloaded } = useFumadocsLoader(Route.useLoaderData())
  const markdownUrl = `/llms.mdx/docs/${[...slugs, 'index.mdx'].join('/')}`
  const { nav, ...base } = baseOptions()

  return (
    <>
      <DocsLayout
        {...base}
        tabMode="navbar"
        nav={{ ...nav, mode: 'top' }}
        sidebar={{ tabs: sidebarTabs }}
        tree={pageTree}
      >
        <Link to={markdownUrl} hidden />
        <Suspense>{clientLoader.useContent(path, { markdownUrl, path, apiPreloaded })}</Suspense>
      </DocsLayout>
      <div className="marketplace-lined-frame mx-auto w-full max-w-(--fd-layout-width) px-4 sm:px-5">
        <div className="marketplace-lined-surface">
          <SiteFooter />
        </div>
      </div>
    </>
  )
}
