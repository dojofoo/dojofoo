/** Application-supplied documentation metadata; raw MDX loading belongs to story/application adapters. */
export type DocsSectionId = "usage" | "authoring" | "developers" | "api" | "help" | "courses";

export type DocPage = {
  /** Its path on the site, e.g. "/docs/quickstart" */
  path: string;
  title: string;
  description?: string;
  body: string;
  /** Its file in the repository */
  source: string;
  /** It's on the website (its Markdown is served at /llms.mdx/docs…); the Help pages aren't yet */
  onSite: boolean;
  apiPage?: string;
  /** An API page's operation, as its sidebar entry shows it: "GET" and "/health", its path under /api/v1 */
  route?: { method: string; path: string };
};

/** A page of the section, or a link to one elsewhere ("[API](/docs/api)" in a meta.json) */
export type DocEntry = { title: string; path: string; page?: DocPage };
export type DocGroup = { title?: string; pages: DocPage[]; entries: DocEntry[] };
export type DocsSection = { id: DocsSectionId; title: string; groups: DocGroup[]; /** False for a retained section reached only by existing deep links. */ showInTabs?: boolean };

export function createDocsContent(sections: DocsSection[]) {
  const allPages = sections.flatMap(section => section.groups.flatMap(group => group.pages.map(page => ({ page, section }))));
  if (!allPages.length) throw new Error("Documentation requires at least one page.");
  return {
    sections,
    allPages,
    findPage(path: string) {
      return allPages.find(entry => entry.page.path === path)
        ?? allPages.find(entry => path.startsWith(entry.page.path) && entry.page.path !== "/docs")
        ?? allPages[0];
    },
  };
}
export type DocsContent = ReturnType<typeof createDocsContent>;

/** "## Heading" lines outside code fences: the page's table of contents */
export function headingsOf(body: string) {
  let fence = false;
  return body.split("\n").flatMap((line) => {
    if (/^(`{3,}|~{3,})/.test(line.trim())) fence = !fence;
    const heading = !fence && /^(#{2,3})\s+(.+)$/.exec(line);
    return heading ? [{ depth: heading[1].length, text: heading[2].replace(/`/g, ""), id: slug(heading[2]) }] : [];
  });
}

/** A heading's anchor, as the website makes it (github-slugger): punctuation dropped, each space a hyphen */
export const slug = (text: string) => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
