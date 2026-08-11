import type {
  Course,
  CourseRegistrar,
  CourseRegistrationSource,
} from "./app";

interface CourseSnapshotStore {
  upsert(course: Course): Promise<void>;
}

interface GitHubCourseRegistrarOptions {
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  store: CourseSnapshotStore;
}

interface GitHubRepository {
  private?: boolean;
  default_branch?: string;
  pushed_at?: string;
}

interface GitHubTree {
  sha?: string;
  tree?: Array<{ path?: string; type?: string; size?: number }>;
}

interface ExternalManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  language?: string;
  framework?: string;
  tags?: string[];
  test: string;
  katas: Array<{ template: string; name?: string; tags?: string[] }>;
}

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const maximumFileBytes = 256 * 1024;
const maximumSnapshotBytes = 2 * 1024 * 1024;
const maximumSnapshotFiles = 250;

function parseExternalManifest(contents: string): ExternalManifest {
  const value = JSON.parse(contents) as Partial<ExternalManifest>;
  if (
    !value
    || typeof value !== "object"
    || typeof value.name !== "string"
    || typeof value.version !== "string"
    || typeof value.description !== "string"
    || typeof value.test !== "string"
    || (value.author !== undefined && typeof value.author !== "string")
    || (value.language !== undefined && typeof value.language !== "string")
    || (value.framework !== undefined && typeof value.framework !== "string")
    || (value.tags !== undefined
      && (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")))
    || !Array.isArray(value.katas)
    || value.katas.length === 0
    || value.katas.some((kata) =>
      !kata
      || typeof kata !== "object"
      || typeof kata.template !== "string"
      || (kata.name !== undefined && typeof kata.name !== "string")
      || (kata.tags !== undefined
        && (!Array.isArray(kata.tags) || kata.tags.some((tag) => typeof tag !== "string"))))
  ) {
    throw new Error("Invalid dojo.json");
  }
  const facets = new Set([value.language, value.framework]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLocaleLowerCase()));
  if (value.tags?.some((tag) => facets.has(tag.toLocaleLowerCase()))) {
    throw new Error("Invalid dojo.json");
  }
  return value as ExternalManifest;
}

function snapshotPath(path: string) {
  if (["dojo.json", "DOJO.md", "README.md", "package.json"].includes(path)) return true;
  return /^katas\/[^/]+\/(?:KATA|SENSEI)\.md$/u.test(path)
    || /^katas\/[^/]+\/[^/]+\.(?:ts|tsx|js|jsx|json|py|java)$/u.test(path);
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
    const [owner, repositoryName] = source.repository.split("/") as [string, string];

    try {
      const repositoryResponse = await this.#fetch(
        `https://api.github.com/repos/${source.repository}`,
        { headers: { accept: "application/vnd.github+json", "user-agent": "dojofoo-registry" } },
      );
      if (!repositoryResponse.ok) return null;
      const repository = await repositoryResponse.json() as GitHubRepository;
      if (repository.private || !repository.default_branch) return null;

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
      if (!paths.some((entry) => entry.path === "dojo.json")) return null;

      const files = await Promise.all(paths.map(async ({ path }) => {
        const response = await this.#fetch(
          `https://raw.githubusercontent.com/${source.repository}/${encodeURIComponent(branch)}/${path}`,
        );
        if (!response.ok) throw new Error(`Unable to fetch ${path}`);
        return { path, contents: await response.text() };
      }));
      const manifestText = files.find((file) => file.path === "dojo.json")?.contents;
      if (!manifestText) return null;
      const manifest = parseExternalManifest(manifestText);
      const katas = manifest.katas.map((kata) => kataName(kata.template, kata.name));
      const course: Course = {
        id: source.repository,
        slug: repositoryName,
        name: displayName(manifest.name, files),
        source: owner,
        description: manifest.description,
        version: manifest.version,
        publishedAt: repository.pushed_at ?? new Date().toISOString(),
        repository: source.repository,
        repositoryUrl: `https://github.com/${source.repository}`,
        installs: 0,
        sourceType: "github",
        installUrl: source.repository,
        url: `https://dojo.foo/courses/${source.repository}`,
        author: manifest.author ?? owner,
        language: manifest.language ?? "Other",
        framework: manifest.framework ?? null,
        tags: [...new Set(manifest.tags ?? [])],
        kataCount: katas.length,
        katas,
        hash: tree.sha ?? source.integrity ?? null,
        files,
      };
      await this.#store.upsert(course);
      return course;
    } catch {
      return null;
    }
  }
}
