import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { Hono } from "hono";
import {
  completedCount,
  findCurrentKata,
  findNextKata,
  findProjectRoot,
  kataState,
  listDojos,
  loadConfig,
  readCatalog,
  readDojoMd,
  readDojoRc,
  resolveAllKatas,
  type DojoManifest,
  type DojoRc,
  type KataEntry,
  type KataProgress,
  type ResolvedKata,
} from "@dojocho/config";

type ProjectVariables = {
  project: ProjectContext;
};

type ProjectContext = {
  root: string;
  rc: DojoRc;
};

export type ProjectKataState = "done" | "current" | "available" | "locked";

export type ProjectKata = {
  name: string;
  title: string;
  description: string | null;
  difficulty: 1 | 2 | 3 | null;
  tags: string[];
  prerequisites: string[];
  state: ProjectKataState;
  cliState: ReturnType<typeof kataState>;
  paths: {
    template: string;
    workspace: string;
    test: string;
    sensei: string;
  };
};

export type ProjectState = {
  root: string;
  dojos: string[];
  activeDojo: {
    name: string;
    version: string;
    description?: string;
  } | null;
  summary: { completed: number; total: number };
  currentKata: string | null;
  nextKata: string | null;
  katas: ProjectKata[];
  dojoMarkdown: string;
};

export type KataBriefing = {
  name: string;
  path: string;
  markdown: string;
};

type CassetteIndexItem = {
  id: string;
  file: string;
  path: string;
  mtime: string;
  size: number;
  entryCount: number | null;
  parseError?: string;
};

const app = new Hono<{ Variables: ProjectVariables }>()
  .use("*", async (c, next) => {
    try {
      c.set("project", readProjectContext());
      await next();
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 404);
    }
  })
  .get("/state", (c) => {
  const { root, rc } = c.get("project");
  const config = loadConfig(root, { command: "kata" });
  const dojos = listDojos(root);

  if (!rc.currentDojo) {
    return c.json({
      root,
      config,
      rc,
      dojos,
      activeDojo: null,
      summary: { completed: 0, total: 0 },
      currentKata: null,
      nextKata: null,
      katas: [],
      dojoMarkdown: readDojoMd(root, ""),
    });
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const view = buildDojoView(root, rc, catalog);

  return c.json({
    root,
    config,
    rc,
    dojos,
    activeDojo: {
      name: catalog.name,
      version: catalog.version,
      description: catalog.description,
      runner: catalog.runner,
      author: catalog.author,
      homepage: catalog.homepage,
      repository: catalog.repository,
    },
    summary: view.summary,
    currentKata: view.currentKata?.name ?? null,
    nextKata: view.nextKata?.name ?? null,
    katas: view.katas,
    dojoMarkdown: readDojoMd(root, rc.currentDojo),
  });
  })
  .get("/katas", (c) => {
  const { root, rc } = c.get("project");
  const catalog = readActiveCatalog(root, rc);
  return c.json(buildDojoView(root, rc, catalog).katas);
  })
  .get("/katas/:name/briefing", (c) => {
  const { root, rc } = c.get("project");
  const catalog = readActiveCatalog(root, rc);
  const view = buildDojoView(root, rc, catalog);
  const kata = view.resolved.find((candidate) => candidate.name === c.req.param("name"));
  if (!kata) return c.json({ error: `Kata not found: ${c.req.param("name")}` }, 404);

  const markdown = existsSync(kata.senseiPath)
    ? extractLearnerBriefing(readFileSync(kata.senseiPath, "utf8"))
    : "";
  return c.json({ name: kata.name, path: relative(root, kata.senseiPath), markdown });
  })
  .get("/journal", (c) => {
  const { root, rc } = c.get("project");
  if (!rc.currentDojo) return c.json({ path: null, markdown: "", sections: [] });

  const path = resolve(root, ".dojos", rc.currentDojo, "JOURNAL.md");
  const markdown = existsSync(path) ? readFileSync(path, "utf8") : "";
  return c.json({
    path: relative(root, path),
    markdown,
    sections: parseJournalSections(markdown),
  });
  })
  .get("/cassettes", (c) => {
  const { root } = c.get("project");
  return c.json(listCassettes(root));
  })
  .get("/cassettes/:id", (c) => {
  const { root } = c.get("project");
  const cassette = findCassette(root, c.req.param("id"));
  if (!cassette) return c.json({ error: `Cassette not found: ${c.req.param("id")}` }, 404);

  const content = readFileSync(cassette.path, "utf8");
  return c.json({
    ...cassette,
    path: relative(root, cassette.path),
    entries: parseCassetteEntries(content),
      raw: content,
    });
  });

function readProjectContext(): ProjectContext {
  const root = process.env.DOJO_PROJECT_ROOT
    ? resolve(process.env.DOJO_PROJECT_ROOT)
    : findProjectRoot();
  return { root, rc: readDojoRc(root) };
}

function readActiveCatalog(root: string, rc: DojoRc): DojoManifest {
  if (!rc.currentDojo) throw new Error("No dojo active.");
  return readCatalog(root, rc.currentDojo);
}

function buildDojoView(root: string, rc: DojoRc, catalog: DojoManifest) {
  const progress = rc.progress?.[rc.currentDojo];
  const resolved = resolveAllKatas(root, rc, catalog);
  const currentKata =
    (rc.currentKata
      ? resolved.find((candidate) => candidate.name === rc.currentKata)
      : null) ?? findCurrentKata(resolved, rc.currentKata);
  const nextKata = findNextAvailableKata(resolved, catalog.katas, progress);

  return {
    resolved,
    currentKata,
    nextKata,
    summary: {
      completed: completedCount(resolved, progress),
      total: resolved.length,
    },
    katas: resolved.map((kata, index) =>
      toProjectKata(root, kata, catalog.katas[index], progress, rc.currentKata),
    ),
  };
}

function findNextAvailableKata(
  katas: ResolvedKata[],
  entries: KataEntry[],
  progress: KataProgress | undefined,
): ResolvedKata | null {
  const nextByCliState = findNextKata(katas, progress);
  if (!nextByCliState) return null;

  for (let i = 0; i < katas.length; i++) {
    const kata = katas[i];
    if (kataState(kata, progress) !== "not-started") continue;
    const prerequisites = entries[i]?.prerequisites ?? [];
    const locked = prerequisites.some(
      (prerequisite) => !progress?.completed.includes(prerequisite),
    );
    if (!locked) return kata;
  }

  return null;
}

function toProjectKata(
  root: string,
  kata: ResolvedKata,
  entry: KataEntry,
  progress: KataProgress | undefined,
  currentKata: string | null,
): ProjectKata {
  const cliState = kataState(kata, progress);
  const prerequisites = entry.prerequisites ?? [];
  const missingPrerequisites = prerequisites.filter(
    (prerequisite) => !progress?.completed.includes(prerequisite),
  );
  const state: ProjectKataState = progress?.completed.includes(kata.name)
    ? "done"
    : currentKata === kata.name || cliState === "ongoing"
      ? "current"
      : missingPrerequisites.length > 0
        ? "locked"
        : "available";

  return {
    name: kata.name,
    title: entry.name ?? kata.name,
    description: entry.description ?? null,
    difficulty: entry.difficulty ?? null,
    tags: entry.tags ?? [],
    prerequisites,
    state,
    cliState,
    paths: {
      template: kata.template,
      workspace: relative(root, kata.workspacePath),
      test: relative(root, kata.testPath),
      sensei: relative(root, kata.senseiPath),
    },
  };
}

function extractLearnerBriefing(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inBriefing = false;
  let inHints = false;

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h2) {
      inBriefing = h2[1].toLowerCase() === "briefing";
      inHints = false;
      continue;
    }
    if (inBriefing && h3) inHints = h3[1].toLowerCase() === "hints";
    if (inBriefing && !inHints) out.push(line);
  }

  return out.join("\n").trim();
}

function parseJournalSections(markdown: string) {
  const sections: Array<{ kata: string; markdown: string }> = [];
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const next = matches[i + 1];
    const start = match.index ?? 0;
    const end = next?.index ?? markdown.length;
    sections.push({
      kata: match[1].trim(),
      markdown: markdown.slice(start, end).trim(),
    });
  }

  return sections;
}

function listCassettes(root: string): CassetteIndexItem[] {
  const dir = resolve(root, ".dojo", "cassettes");
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.endsWith(".jsonl") || file.endsWith(".json"))
    .map((file) => {
      const path = join(dir, file);
      const stat = statSync(path);
      const item: CassetteIndexItem = {
        id: basename(file).replace(/\.(jsonl|json)$/u, ""),
        file,
        path: relative(root, path),
        mtime: stat.mtime.toISOString(),
        size: stat.size,
        entryCount: null,
      };

      try {
        const content = readFileSync(path, "utf8");
        item.entryCount = parseCassetteEntries(content).length;
      } catch (error) {
        item.parseError = errorMessage(error);
      }

      return item;
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function findCassette(root: string, id: string) {
  return listCassettes(root)
    .map((cassette) => ({ ...cassette, path: resolve(root, cassette.path) }))
    .find((cassette) => cassette.id === id || cassette.file === id);
}

function parseCassetteEntries(content: string): unknown[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  return trimmed
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { app as projectRoutes };
export type ProjectRoutes = typeof app;
