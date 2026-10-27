/*
 * The docs' pages: the website's own content (apps/web/content, its MDX read as text – one source for both) and the
 * Help & Support pages, which only exist here so far (src/docs/help). Each section follows its meta.json: its pages in
 * order, "---Group---" entries starting a group. MDX's two components in prose become Markdown: <InstallCommand /> its
 * command, <Callout> a quote.
 */

import { parse as parseYaml } from "yaml";
import { createDocsContent, type DocPage, type DocGroup, type DocsSection } from "../../docs/content";

const site = import.meta.glob<string>("../../../../../apps/web/content/{docs,authoring,developers}/**/*.mdx", { query: "?raw", import: "default", eager: true });
const metas = import.meta.glob<{ title?: string; pages: string[] }>("../../../../../apps/web/content/{docs,authoring,developers}/**/meta.json", { import: "default", eager: true });
const help = import.meta.glob<string>("../../docs/help/*.md", { query: "?raw", import: "default", eager: true });

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
  const key = `../../../../../apps/web/content/${folder}/${name}.mdx`;
  const raw = site[key];
  if (raw === undefined) return undefined;
  return parse(raw, `/${folder}${name === "index" ? "" : `/${name}`}`, `apps/web/content/${folder}/${name}.mdx`, true);
};

/** A section's pages from its meta.json, but for the entries in `except` (a folder that is a section of its own) */
function fromMeta(folder: string, except: string[] = []): DocGroup[] {
  const groups: DocGroup[] = [{ pages: [], entries: [] }];
  for (const entry of metas[`../../../../../apps/web/content/${folder}/meta.json`]?.pages ?? []) {
    if (except.includes(entry)) continue;
    const group = /^---(.+)---$/.exec(entry);
    if (group) { groups.push({ title: group[1], pages: [], entries: [] }); continue; }
    const link = /^\[(.+)\]\((.+)\)$/.exec(entry);
    if (link) { groups.at(-1)!.entries.push({ title: link[1], path: link[2] }); continue; }
    const nested = metas[`../../../../../apps/web/content/${folder}/${entry}/meta.json`];
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

const helpPage = (name: string) => parse(help[`../../docs/help/${name}.md`] ?? "", `/help${name === "index" ? "" : `/${name}`}`, `packages/uix/src/docs/help/${name}.md`, false);

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

export const docsContent = createDocsContent(docsSections);
export const { allPages, findPage } = docsContent;
