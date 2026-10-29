import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Callout } from 'fumadocs-ui/components/callout';
import type { MDXComponents } from 'mdx/types';
import { isValidElement, type ComponentProps, type ReactNode } from 'react';
import { InstallCommand } from './install-command';
import { APIPage, APIPage as OpenAPIPage } from '@dojofoo/uix/components/api-reference';
import { CodeWindowBlock } from '@dojofoo/uix/components/code-window';

/** The text of highlighted code: its spans' text, in order */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** A code block as the editor shows it (CodeWindowBlock): Shiki's lines from the build until the editor's own are in */
function Pre({ children, title }: ComponentProps<'pre'>) {
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : undefined;
  const lang = /language-(\S+)/.exec(code?.props.className ?? '')?.[1] ?? 'text';
  return <CodeWindowBlock code={textOf(code?.props.children ?? children)} lang={lang} title={title} fallback={code?.props.children} />;
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return Object.assign({
    ...defaultMdxComponents,
    pre: Pre,
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
