import type { Folder, Node } from 'fumadocs-core/page-tree';
import type { DocPage, DocGroup, DocsSection } from '@dojofoo/uix/docs/content';
import { source } from './source';

/** Project the real Fumadocs tree, preserving its metadata order and cross-section links. */
export function getUIXDocsSections(currentPath: string, markdown: string): DocsSection[] {
  const pages = new Map(source.getPages().map(page => {
    const api = page.data._openapi;
    const value: DocPage = {
      path: page.url, title: page.data.title, description: page.data.description,
      body: page.path === currentPath ? markdown : '', source: `apps/web/content/${page.path}`, onSite: true,
      ...(api ? { apiPage: page.url.split('/').at(-1) } : {}),
      ...(typeof api?.method === "string" && typeof api.route === "string" ? { route: { method: api.method, path: api.route } } : {}),
    };
    return [page.url, value];
  }));
  const roots = [
    { id: 'usage', path: '/docs' }, { id: 'authoring', path: '/authoring' },
    { id: 'developers', path: '/developers' }, { id: 'api', path: '/docs/api' },
    { id: 'courses', path: '/dojos' },
  ] as const;
  function findFolder(nodes: Node[], path: string): Folder | undefined {
    for (const node of nodes) if (node.type === 'folder') {
      if (node.$ref?.folder === path.slice(1) || node.index?.url === path) return node;
      const found = findFolder(node.children, path);
      if (found) return found;
    }
  }
  const sections = roots.flatMap(root => {
    const folder = findFolder(source.getPageTree().children, root.path);
    if (!folder) return [];
    const groups: DocGroup[] = [{ pages: [], entries: [] }];
    const owns = (path: string) => (path === root.path || path.startsWith(root.path + '/')) &&
      !(root.id === 'usage' && (path === '/docs/api' || path.startsWith('/docs/api/')));
    const add = (url: string, title: string) => {
      const page = pages.get(url);
      const group = groups.at(-1)!;
      group.entries.push({ path: url, title: page?.title ?? title, ...(page && owns(url) ? { page } : {}) });
      if (page && owns(url)) group.pages.push(page);
    };
    function walk(nodes: Node[]) {
      for (const node of nodes) {
        if (node.type === 'page') add(node.url, typeof node.name === 'string' ? node.name : node.url);
        else if (node.type === 'separator') groups.push({ title: typeof node.name === 'string' ? node.name : undefined, pages: [], entries: [] });
        else {
          const folderPath = node.$ref?.folder ? '/' + node.$ref.folder : undefined;
          const index = node.index ?? node.children.find(child => child.type === 'page' && child.url === folderPath);
          if (index?.type === 'page' && !owns(index.url)) { add(index.url, typeof node.name === 'string' ? node.name : index.url); continue; }
          groups.push({ title: typeof node.name === 'string' ? node.name : undefined, pages: [], entries: [] });
          if (node.index) add(node.index.url, typeof node.name === 'string' ? node.name : node.index.url);
          walk(node.children);
          groups.push({ pages: [], entries: [] });
        }
      }
    }
    if (folder.index) add(folder.index.url, typeof folder.name === 'string' ? folder.name : root.path);
    walk(folder.children);
    const populated = groups.filter(group => group.entries.length > 0);
    // Unlisted pages can still be opened by URL; do not silently substitute a section overview.
    const currentSource = source.getPages().find(page => page.path === currentPath);
    const current = currentSource && owns(currentSource.url) ? pages.get(currentSource.url) : undefined;
    if (current && !populated.some(group => group.pages.some(page => page.path === current.path))) populated[0]?.pages.push(current);
    return populated.length ? [{ id: root.id, ...(root.id === 'courses' ? { showInTabs: false } : {}), title: typeof folder.name === 'string' ? folder.name : root.path, groups: populated }] : [];
  });
  return sections;
}
