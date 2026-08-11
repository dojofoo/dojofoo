import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from '@/components/layout/notebook'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from '@/components/layout/notebook/page'
import browserCollections from 'collections/browser'
import { Suspense } from 'react'
import { SITE_URL, getPageImage } from '@/lib/site'
import { useMDXComponents } from '@/components/mdx'
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
    const { title, description, ogImage, ogUrl } = loaderData
    return {
      meta: [
        { title: `${title} — dojocho` },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: ogUrl },
        { property: 'og:type', content: 'article' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:type', content: 'image/webp' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: title },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImage },
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

    return {
      slugs: page.slugs,
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      ogImage: getPageImage(page.slugs).url,
      ogUrl: SITE_URL + page.url,
      pageTree: await source.serializePageTree(source.getPageTree()),
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    {
      markdownUrl,
      path,
    }: {
      markdownUrl: string
      path: string
    },
  ) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    )
  },
})

const sidebarTabs = [
  { title: 'Docs', url: '/docs' },
]

function Page() {
  const { pageTree, slugs, path } = useFumadocsLoader(Route.useLoaderData())
  const markdownUrl = `/llms.mdx/docs/${[...slugs, 'index.mdx'].join('/')}`
  const { nav, ...base } = baseOptions()

  return (
    <DocsLayout
      {...base}
      tabMode="navbar"
      nav={{ ...nav, mode: 'top' }}
      sidebar={{ tabs: sidebarTabs }}
      tree={pageTree}
    >
      <Link to={markdownUrl} hidden />
      <Suspense>{clientLoader.useContent(path, { markdownUrl, path })}</Suspense>
    </DocsLayout>
  )
}
