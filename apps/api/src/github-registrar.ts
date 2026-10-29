import type {
  Course,
  CourseRegistrar,
  CourseRegistrationSource,
  CourseStatus,
} from "./app";
import { parse as parseYaml } from "yaml";

interface CourseSnapshotStore {
  remove(id: string): Promise<void>;
  /** Resolves to the course's status, when the store keeps one */
  upsert(course: Course): Promise<CourseStatus | void>;
}

interface GitHubCourseRegistrarOptions {
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  store: CourseSnapshotStore;
}

interface GitHubRepository {
  private?: boolean;
  full_name?: string;
  default_branch?: string;
  pushed_at?: string;
}

interface GitHubTree {
  sha?: string;
  tree?: Array<{ path?: string; type?: string; size?: number }>;
}

interface ExternalManifest {
  private?: boolean;
  /** The older spelling: `false` for `private: true` */
  marketplace?: boolean;
  mode?: "katas" | "interactive";
  name: string;
  version: string;
  description: string;
  author?: string;
  language?: string;
  framework?: string;
  tags?: string[];
  test?: string;
  katas?: Array<{ template: string; name?: string; tags?: string[] }>;
  lessons?: string;
}

const manifestNames = ["dojo.yaml", "dojo.yml", "dojo.json"] as const;

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const maximumFileBytes = 256 * 1024;
const maximumSnapshotBytes = 2 * 1024 * 1024;
const maximumSnapshotFiles = 250;

function parseExternalManifest(contents: string, path: string): ExternalManifest {
  const value = (path.endsWith(".json") ? JSON.parse(contents) : parseYaml(contents)) as Partial<ExternalManifest>;
  const mode = value.mode ?? "katas";
  if (
    !value
    || typeof value !== "object"
    || typeof value.name !== "string"
    || typeof value.version !== "string"
    || typeof value.description !== "string"
    || (mode !== "katas" && mode !== "interactive")
    || (value.author !== undefined && typeof value.author !== "string")
    || (value.language !== undefined && typeof value.language !== "string")
    || (value.framework !== undefined && typeof value.framework !== "string")
    || (value.private !== undefined && typeof value.private !== "boolean")
    || (value.marketplace !== undefined && typeof value.marketplace !== "boolean")
    || (value.tags !== undefined
      && (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")))
    || (mode === "katas" && typeof value.test !== "string")
    || (mode === "interactive" && typeof value.lessons !== "string")
    || (mode === "katas" && (!Array.isArray(value.katas) || value.katas.length === 0))
    || (value.katas?.some((kata) =>
      !kata
      || typeof kata !== "object"
      || typeof kata.template !== "string"
      || (kata.name !== undefined && typeof kata.name !== "string")
      || (kata.tags !== undefined
        && (!Array.isArray(kata.tags) || kata.tags.some((tag) => typeof tag !== "string")))) ?? false)
  ) {
    throw new Error("Invalid dojo manifest");
  }
  const facets = new Set([value.language, value.framework]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLocaleLowerCase()));
  if (value.tags?.some((tag) => facets.has(tag.toLocaleLowerCase()))) {
    throw new Error("Invalid dojo manifest");
  }
  return value as ExternalManifest;
}

function snapshotPath(path: string) {
  if ([...manifestNames, "DOJO.md", "README.md", "package.json", "mise.toml", ".mise.toml", "prepare.sh"].includes(path)) return true;
  // What installing runs, for the security checks: prepare.sh above, mise's file tasks here
  if (/^(?:mise-tasks|\.mise\/tasks|\.config\/mise\/tasks)\/.+$/u.test(path)) return true;
  return /^katas\/[^/]+\/(?:KATA|SENSEI)\.md$/u.test(path)
    || /^katas\/[^/]+\/[^/]+\.(?:ts|tsx|js|jsx|json|py|java)$/u.test(path)
    || /^(?:lessons|content|assets|components)\/.+\.(?:mdx|md|json|yaml|yml|svg|png|jpe?g|webp|pdf|mp4|webm|html|css|js)$/u.test(path);
}

function kataName(template: string, explicit?: string) {
  if (explicit) return explicit;
  return template.match(/^katas\/([^/]+)\//u)?.[1] ?? template;
}

function displayName(packageName: string, files: Course["files"]) {
  const introduction = files?.find((file) => file.path === "DOJO.md")?.contents;
  const heading = introduction?.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  if (heading) return heading;
  return packageName
    .split("/").at(-1)!
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export class GitHubCourseRegistrar implements CourseRegistrar {
  readonly #fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly #store: CourseSnapshotStore;

  constructor(options: GitHubCourseRegistrarOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#store = options.store;
  }

  async register(source: CourseRegistrationSource): Promise<Course | null> {
    if (!repositoryPattern.test(source.repository)) return null;
    try {
      const repositoryResponse = await this.#fetch(
        `https://api.github.com/repos/${source.repository}`,
        { headers: { accept: "application/vnd.github+json", "user-agent": "dojofoo-registry" } },
      );
      if (!repositoryResponse.ok) return null;
      const repository = await repositoryResponse.json() as GitHubRepository;
      if (repository.private || !repository.default_branch || !repository.full_name) return null;

      const canonicalRepository = repository.full_name;
      if (!repositoryPattern.test(canonicalRepository)) return null;
      const [canonicalOwner, canonicalRepositoryName] = canonicalRepository.split("/") as [string, string];

      const branch = repository.default_branch;
      const treeResponse = await this.#fetch(
        `https://api.github.com/repos/${source.repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        { headers: { accept: "application/vnd.github+json", "user-agent": "dojofoo-registry" } },
      );
      if (!treeResponse.ok) return null;
      const tree = await treeResponse.json() as GitHubTree;
      let bytes = 0;
      const paths = (tree.tree ?? [])
        .filter((entry): entry is { path: string; type: "blob"; size: number } =>
          entry.type === "blob"
          && typeof entry.path === "string"
          && typeof entry.size === "number"
          && entry.size <= maximumFileBytes
          && snapshotPath(entry.path))
        .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
        .filter((entry) => {
          if (bytes + entry.size > maximumSnapshotBytes) return false;
          bytes += entry.size;
          return true;
        })
        .slice(0, maximumSnapshotFiles);
      const manifestPaths = manifestNames.filter((name) => paths.some((entry) => entry.path === name));
      if (manifestPaths.length !== 1) return null;

      const files = await Promise.all(paths.map(async ({ path }) => {
        const response = await this.#fetch(
          `https://raw.githubusercontent.com/${source.repository}/${encodeURIComponent(branch)}/${path}`,
        );
        if (!response.ok) throw new Error(`Unable to fetch ${path}`);
        return { path, contents: await response.text() };
      }));
      const manifestPath = manifestPaths[0];
      const manifestText = files.find((file) => file.path === manifestPath)?.contents;
      if (!manifestText) return null;
      const manifest = parseExternalManifest(manifestText, manifestPath);
      if (manifest.private === true || manifest.marketplace === false) {
        await Promise.all([
          this.#store.remove(canonicalRepository),
          ...(canonicalRepository === source.repository ? [] : [this.#store.remove(source.repository)]),
        ]);
        return null;
      }
      const katas = (manifest.katas ?? []).map((kata) => kataName(kata.template, kata.name));
      const course: Course = {
        id: canonicalRepository,
        slug: canonicalRepositoryName,
        name: displayName(manifest.name, files),
        source: canonicalOwner,
        description: manifest.description,
        version: manifest.version,
        publishedAt: repository.pushed_at ?? new Date().toISOString(),
        repository: canonicalRepository,
        repositoryUrl: `https://github.com/${canonicalRepository}`,
        installs: 0,
        sourceType: "github",
        installUrl: canonicalRepository,
        url: `https://dojo.foo/courses/${canonicalRepository}`,
        author: manifest.author ?? canonicalOwner,
        language: manifest.language ?? "Other",
        framework: manifest.framework ?? null,
        tags: [...new Set(manifest.tags ?? [])],
        kataCount: katas.length,
        katas,
        hash: tree.sha ?? source.integrity ?? null,
        files,
        mode: manifest.mode ?? "katas",
      };
      if (canonicalRepository !== source.repository) await this.#store.remove(source.repository);
      const status = await this.#store.upsert(course);
      return status ? { ...course, status } : course;
    } catch {
      return null;
    }
  }
}
