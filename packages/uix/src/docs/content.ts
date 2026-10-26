/*
 * The docs' pages: the website's own content (apps/web/content, its MDX read as text – one source for both) and the
 * Help & Support pages, which only exist here so far (src/docs/help). Each section follows its meta.json: its pages in
 * order, "---Group---" entries starting a group. MDX's two components in prose become Markdown: <InstallCommand /> its
 * command, <Callout> a quote.
 */

import { parse as parseYaml } from "yaml";

export type DocsSectionId = "usage" | "authoring" | "developers" | "api" | "help";

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
export type DocsSection = { id: DocsSectionId; title: string; groups: DocGroup[] };

const site = import.meta.glob<string>("../../../../apps/web/content/{docs,authoring,developers}/**/*.mdx", { query: "?raw", import: "default", eager: true });
const metas = import.meta.glob<{ title?: string; pages: string[] }>("../../../../apps/web/content/{docs,authoring,developers}/**/meta.json", { import: "default", eager: true });
const help = import.meta.glob<string>("./help/*.md", { query: "?raw", import: "default", eager: true });

function parse(raw: string, path: string, source: string, onSite: boolean): DocPage {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  const front = parseYaml(match?.[1] ?? "") ?? {};
  const api = front._openapi;
  return { path, title: front.title ?? path, description: front.description, apiPage: api ? path.split("/").at(-1) : undefined, route: api?.route ? { method: api.method, path: api.route } : undefined, body: toMarkdown(raw.slice(match?.[0].length ?? 0)), source, onSite };
}

/** MDX's components outside code fences, as Markdown */
function toMarkdown(mdx: string) {
  let fence = "";
  const out: string[] = [];
  let callout: string[] | null = null;
  for (const line of mdx.split("\n")) {
    const open = /^(`{3,}|~{3,})/.exec(line.trim());
    if (open && (!fence || line.trim().startsWith(fence))) fence = fence ? "" : open[1];
    if (fence || open) { out.push(line); continue; }
    if (line.trim() === "<InstallCommand />") { out.push("```sh", "npx dojofoo install", "```"); continue; }
    if (/^<Callout\b/.test(line.trim())) { callout = []; continue; }
    if (callout && line.trim() === "</Callout>") { out.push(...callout.map((text) => `> ${text.trim()}`)); callout = null; continue; }
    if (callout) { callout.push(line); continue; }
    out.push(line);
  }
  return out.join("\n");
}

const sitePage = (folder: string, name: string) => {
  const key = `../../../../apps/web/content/${folder}/${name}.mdx`;
  const raw = site[key];
  if (raw === undefined) return undefined;
  return parse(raw, `/${folder}${name === "index" ? "" : `/${name}`}`, `apps/web/content/${folder}/${name}.mdx`, true);
};

/** A section's pages from its meta.json, but for the entries in `except` (a folder that is a section of its own) */
function fromMeta(folder: string, except: string[] = []): DocGroup[] {
  const groups: DocGroup[] = [{ pages: [], entries: [] }];
  for (const entry of metas[`../../../../apps/web/content/${folder}/meta.json`]?.pages ?? []) {
    if (except.includes(entry)) continue;
    const group = /^---(.+)---$/.exec(entry);
    if (group) { groups.push({ title: group[1], pages: [], entries: [] }); continue; }
    const link = /^\[(.+)\]\((.+)\)$/.exec(entry);
    if (link) { groups.at(-1)!.entries.push({ title: link[1], path: link[2] }); continue; }
    const nested = metas[`../../../../apps/web/content/${folder}/${entry}/meta.json`];
    if (nested) {
      groups.push(...fromMeta(`${folder}/${entry}`).map(group => ({ ...group, title: group.title ?? nested.title })));
      groups.push({ pages: [], entries: [] });
      continue;
    }
    const page = sitePage(folder, entry);
    if (page) { groups.at(-1)!.pages.push(page); groups.at(-1)!.entries.push({ title: page.title, path: page.path, page }); }
  }
  return groups.filter((group) => group.entries.length > 0);
}

const helpPage = (name: string) => parse(help[`./help/${name}.md`] ?? "", `/help${name === "index" ? "" : `/${name}`}`, `packages/uix/src/docs/help/${name}.md`, false);

const helpPages = ["index", "troubleshooting", "faq"].map(helpPage);

/** The site's tabs, in its order (apps/web/src/routes/$.tsx), then the API – its pages stay at /docs/api, out of Usage's
   tree – and Help & Support */
export const docsSections: DocsSection[] = [
  { id: "usage", title: "Usage", groups: fromMeta("docs", ["api"]) },
  { id: "authoring", title: "Authoring", groups: fromMeta("authoring") },
  { id: "developers", title: "Developers", groups: fromMeta("developers") },
  { id: "api", title: "API", groups: fromMeta("docs/api") },
  { id: "help", title: "Help & Support", groups: [{ pages: helpPages, entries: helpPages.map((page) => ({ title: page.title, path: page.path, page })) }] },
];

export const allPages = docsSections.flatMap((section) => section.groups.flatMap((group) => group.pages.map((page) => ({ page, section }))));

/** The page at a site path, or its section's first page */
export function findPage(path: string) {
  return allPages.find((entry) => entry.page.path === path) ?? allPages.find((entry) => path.startsWith(entry.page.path) && entry.page.path !== "/docs") ?? allPages[0];
}

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
