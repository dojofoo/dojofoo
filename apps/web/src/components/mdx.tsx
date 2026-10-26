import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import type { MDXComponents } from 'mdx/types';
import { InstallCommand } from './install-command';
import { APIPage, OpenAPIPage } from '@dojofoo/ui/api-reference';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return Object.assign({
    ...defaultMdxComponents,
    Callout,
    InstallCommand,
    APIPage,
    OpenAPIPage,
  } satisfies MDXComponents, components);
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
