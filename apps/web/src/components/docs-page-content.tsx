import browserCollections from 'collections/browser';
import { useMDXComponents } from './mdx';
import { lazy } from 'react';
import type { APIPageProps } from '@dojofoo/uix/components/api-reference';

const OpenAPIPage = lazy(() => import('@dojofoo/uix/components/api-reference').then(module => ({ default: module.APIPage })));

// The documentation loader and renderer share this cache, without importing the
// MDX/OpenAPI renderer into every route's critical bundle.
const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { frontmatter, default: MDX },
    { apiPreloaded }: { apiPreloaded?: APIPageProps['preloaded'] },
  ) {
    const components = useMDXComponents({ OpenAPIPage: (props: Omit<APIPageProps, 'preloaded'>) => {
      if (!apiPreloaded) throw new Error('Missing server-preloaded OpenAPI document.');
      return <OpenAPIPage {...props} preloaded={apiPreloaded} />;
    } });
    return frontmatter._openapi ? <MDX components={components} />
      : <div className="ui-docs__prose prose max-w-none"><div className="ui-result-markdown"><MDX components={components} /></div></div>;
  },
});

export const preloadDocsContent = (path: string) => clientLoader.preload(path);

export function DocsPageContent({ path, apiPreloaded }: { path: string; apiPreloaded?: APIPageProps['preloaded'] }) {
  return clientLoader.useContent(path, { apiPreloaded });
}
