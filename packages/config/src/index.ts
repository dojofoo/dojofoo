import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { createJiti } from "jiti";
import { parse as parseYaml } from "yaml";

export const CLI = "npx dojofoo";
export const DOJOS_DIR = ".dojos";
export const MANIFEST_NAMES = ["dojo.yaml", "dojo.yml", "dojo.json"] as const;

// --- User-facing config types ---

export interface DojoUserConfig {
  basePath?: string;
  katasPath?: string;
  runner?: RunnerConfig;
  registries?: Record<string, string>;
}

export interface ConfigEnv {
  command: "kata" | "test" | "add";
}

// Pure type helper — zero logic (like vite's defineConfig)
export function defineConfig(config: DojoUserConfig): DojoUserConfig;
export function defineConfig(fn: (env: ConfigEnv) => DojoUserConfig): (env: ConfigEnv) => DojoUserConfig;
export function defineConfig(configOrFn: DojoUserConfig | ((env: ConfigEnv) => DojoUserConfig)) {
  return configOrFn;
}

// --- Resolved config types ---

export interface RunnerConfig {
  adapter?: "vitest" | "exit-code";
  coverage?: boolean;
}

export interface ResolvedRunnerConfig {
  adapter: "vitest" | "exit-code";
  coverage: boolean;
}

export interface ResolvedConfig {
  basePath: string;
  katasPath: string;
  runner: ResolvedRunnerConfig;
  registries: Record<string, string>;
}

export function resolveConfig(userConfig: DojoUserConfig, root: string): ResolvedConfig {
  const basePath = userConfig.basePath ?? root;
  const katasPath = userConfig.katasPath
    ? resolve(basePath, userConfig.katasPath)
    : resolve(basePath, "katas");
  const runner: ResolvedRunnerConfig = {
    adapter: userConfig.runner?.adapter ?? "vitest",
    coverage: userConfig.runner?.coverage ?? false,
  };
  const registries = {
    dojofoo: "https://dojofoo.vercel.app/r/{name}.json",
    ...userConfig.registries,
  };
  return { basePath, katasPath, runner, registries };
}

// --- DojoRc ---

export interface KataProgress {
  completed: string[];
  lastActive: string | null;
  introduced?: boolean;
  kataIntros?: string[];
}

export interface DojoRc {
  currentDojo: string;
  currentKata: string | null;
  editor: string | null;
  progress?: Record<string, KataProgress>;
}

export function validateDojoRc(data: unknown): DojoRc {
  const obj = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  let progress: Record<string, KataProgress> | undefined;
  if (typeof obj.progress === "object" && obj.progress !== null) {
    progress = {};
    for (const [key, val] of Object.entries(obj.progress as Record<string, unknown>)) {
      if (typeof val === "object" && val !== null && Array.isArray((val as Record<string, unknown>).completed)) {
        const v = val as Record<string, unknown>;
        progress[key] = {
          completed: (v.completed as unknown[]).filter((s): s is string => typeof s === "string"),
          lastActive: typeof v.lastActive === "string" ? v.lastActive : null,
          introduced: typeof v.introduced === "boolean" ? v.introduced : undefined,
          kataIntros: Array.isArray(v.kataIntros)
            ? (v.kataIntros as unknown[]).filter((s): s is string => typeof s === "string")
            : undefined,
        };
      }
    }
  }
  return {
    currentDojo: typeof obj.currentDojo === "string" ? obj.currentDojo : "",
    currentKata: typeof obj.currentKata === "string" ? obj.currentKata : null,
    editor: typeof obj.editor === "string" ? obj.editor : null,
    progress,
  };
}

// --- Manifest types ---

export interface KataEntry {
  template: string;
  test?: string;
  name?: string;
  title?: string;
  description?: string;
  difficulty?: 1 | 2 | 3;
  tags?: string[];
  prerequisites?: string[];
}

export interface DojoManifest {
  marketplace?: boolean;
  mode?: "katas";
  name: string;
  version: string;
  description: string;
  test: string;
  katas: KataEntry[];
  runner?: RunnerConfig;
  author?: string;
  language?: string;
  framework?: string;
  tags?: string[];
  homepage?: string;
  repository?: string;
}

export interface InteractiveDojoManifest {
  marketplace?: boolean;
  mode: "interactive";
  name: string;
  version: string;
  description: string;
  lessons: string;
  author?: string;
  language?: string;
  framework?: string;
  tags?: string[];
  homepage?: string;
  repository?: string;
}

export type CourseManifest = DojoManifest | InteractiveDojoManifest;

export function courseMode(manifest: CourseManifest): "katas" | "interactive" {
  return manifest.mode ?? "katas";
}

export class ManifestValidationError extends Error {
  constructor(
    public readonly errors: string[],
    path: string,
  ) {
    super(
      `Invalid dojo manifest at ${path}:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
    this.name = "ManifestValidationError";
  }
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((v) => typeof v === "string");
}

export function validateManifest(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["manifest must be a JSON object"];
  }

  const obj = data as Record<string, unknown>;

  for (const field of ["name", "version", "description"] as const) {
    if (!(field in obj)) {
      errors.push(`Missing required field: "${field}"`);
    } else if (typeof obj[field] !== "string") {
      errors.push(`"${field}" must be a string`);
    } else if ((obj[field] as string).trim() === "") {
      errors.push(`"${field}" must not be empty`);
    }
  }

  const mode = obj.mode ?? "katas";
  if (mode !== "katas" && mode !== "interactive") {
    errors.push('"mode" must be "katas" or "interactive"');
  }

  if (mode === "interactive") {
    if (!("lessons" in obj)) errors.push('Missing required field: "lessons"');
    else if (typeof obj.lessons !== "string" || obj.lessons.trim() === "") {
      errors.push('"lessons" must be a non-empty string');
    }
  } else if (!("test" in obj)) {
    errors.push('Missing required field: "test"');
  } else if (typeof obj.test !== "string" || obj.test.trim() === "") {
    errors.push('"test" must be a non-empty string');
  }

  if (mode === "interactive") {
    if ("katas" in obj) errors.push('"katas" is not supported for interactive courses');
  } else if (!("katas" in obj)) {
    errors.push('Missing required field: "katas"');
  } else if (!Array.isArray(obj.katas)) {
    errors.push('"katas" must be an array');
  } else if (obj.katas.length === 0) {
    errors.push('"katas" must contain at least one entry');
  } else {
    for (let i = 0; i < obj.katas.length; i++) {
      const kata = obj.katas[i];
      if (typeof kata !== "object" || kata === null || Array.isArray(kata)) {
        errors.push(`katas[${i}] must be an object`);
        continue;
      }
      if (!("template" in kata) || typeof kata.template !== "string") {
        errors.push(`katas[${i}] is missing required "template" string`);
      }
      const k = kata as Record<string, unknown>;
      for (const f of ["test", "name", "title", "description"]) {
        if (f in k && typeof k[f] !== "string") {
          errors.push(`katas[${i}].${f} must be a string`);
        }
      }
      if ("difficulty" in k && (typeof k.difficulty !== "number" || ![1, 2, 3].includes(k.difficulty as number))) {
        errors.push(`katas[${i}].difficulty must be 1, 2, or 3`);
      }
      for (const f of ["tags", "prerequisites"]) {
        if (f in k && !isStringArray(k[f])) {
          errors.push(`katas[${i}].${f} must be an array of strings`);
        }
      }
    }
  }

  // Validate runner field
  if ("runner" in obj) {
    if (typeof obj.runner !== "object" || obj.runner === null || Array.isArray(obj.runner)) {
      errors.push('"runner" must be an object');
    } else {
      const runner = obj.runner as Record<string, unknown>;
      if ("adapter" in runner && runner.adapter !== "vitest" && runner.adapter !== "exit-code") {
        errors.push('"runner.adapter" must be "vitest" or "exit-code"');
      }
      if ("coverage" in runner && typeof runner.coverage !== "boolean") {
        errors.push('"runner.coverage" must be a boolean');
      }
    }
  }

  for (const field of ["author", "language", "framework", "homepage", "repository"] as const) {
    if (field in obj && typeof obj[field] !== "string") {
      errors.push(`"${field}" must be a string`);
    }
  }
  if ("tags" in obj && !isStringArray(obj.tags)) {
    errors.push('"tags" must be an array of strings');
  } else if (Array.isArray(obj.tags)) {
    const facets = new Set(
      [obj.language, obj.framework]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLocaleLowerCase()),
    );
    if (obj.tags.some((tag) => facets.has(tag.toLocaleLowerCase()))) {
      errors.push('"tags" must not repeat "language" or "framework"');
    }
  }
  if ("marketplace" in obj && typeof obj.marketplace !== "boolean") {
    errors.push('"marketplace" must be a boolean');
  }

  return errors;
}

export function parseManifest(source: string, path: string): CourseManifest {
  let data: unknown;
  try {
    data = path.endsWith(".yaml") || path.endsWith(".yml")
      ? parseYaml(source)
      : JSON.parse(source);
  } catch {
    throw new ManifestValidationError([
      path.endsWith(".yaml") || path.endsWith(".yml") ? "Invalid YAML" : "Invalid JSON",
    ], path);
  }
  const errors = validateManifest(data);
  if (errors.length > 0) {
    throw new ManifestValidationError(errors, path);
  }
  return data as CourseManifest;
}

// --- Resolved kata ---

export interface ResolvedKata {
  name: string;
  template: string;
  workspacePath: string;
  testPath: string;
  senseiPath: string;
  dojoKataDir: string;
  test?: string;
}

// --- Config loading ---

export function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== "/") {
    if (existsSync(resolve(dir, ".dojorc"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

export function readDojoRc(root: string): DojoRc {
  const rcPath = resolve(root, ".dojorc");
  if (!existsSync(rcPath)) {
    throw new Error(".dojorc not found — run `npx dojofoo install` first");
  }
  return validateDojoRc(JSON.parse(readFileSync(rcPath, "utf8")));
}

export function writeDojoRc(root: string, rc: DojoRc): void {
  const rcPath = resolve(root, ".dojorc");
  writeFileSync(rcPath, JSON.stringify(rc, null, 2) + "\n");
}

export function readCatalog(root: string, active: string): DojoManifest {
  const manifest = readCourseManifest(root, active);
  if (courseMode(manifest) !== "katas") {
    throw new Error(`Dojo "${active}" is an interactive course, not a kata course`);
  }
  return manifest as DojoManifest;
}

export function findManifestPath(directory: string): string | null {
  const matches = MANIFEST_NAMES
    .map((name) => resolve(directory, name))
    .filter(existsSync);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Multiple dojo manifests found in ${directory}; keep only one of ${MANIFEST_NAMES.join(", ")}`);
  }
  return matches[0];
}

export function readCourseManifest(root: string, active: string): CourseManifest {
  const directory = resolve(root, DOJOS_DIR, active);
  const catalogPath = findManifestPath(directory);
  if (!catalogPath) throw new Error(`Dojo manifest not found in ${directory}`);
  return parseManifest(readFileSync(catalogPath, "utf8"), catalogPath);
}

export function dojoDir(root: string, active: string): string {
  return resolve(root, DOJOS_DIR, active);
}

export function readDojoMd(root: string, active: string): string {
  if (active) {
    const activePath = resolve(root, DOJOS_DIR, active, "DOJO.md");
    if (existsSync(activePath)) return readFileSync(activePath, "utf8");
  }
  // Fallback to root .dojos/DOJO.md
  const rootDojoPath = resolve(root, DOJOS_DIR, "DOJO.md");
  if (existsSync(rootDojoPath)) return readFileSync(rootDojoPath, "utf8");
  return "";
}

export function loadConfig(root?: string, env?: ConfigEnv): ResolvedConfig {
  const projectRoot = root ?? findProjectRoot();
  const configEnv = env ?? { command: "kata" };
  for (const name of ["dojo.config.ts", "dojo.config.js"]) {
    const configPath = resolve(projectRoot, name);
    if (existsSync(configPath)) {
      try {
        const source = readFileSync(configPath, "utf8");
        if (
          source.includes('import { defineConfig } from "@dojofoo/config"')
          && /export default defineConfig\(\s*\)/.test(source)
        ) {
          return resolveConfig({}, projectRoot);
        }
        const jiti = createJiti(configPath);
        const mod = jiti(configPath) as { default?: unknown } | DojoUserConfig;
        let raw = "default" in mod && mod.default ? mod.default : mod;
        if (typeof raw === "function") raw = (raw as (env: ConfigEnv) => DojoUserConfig)(configEnv);
        return resolveConfig(raw as DojoUserConfig, projectRoot);
      } catch (err) {
        throw new Error(`Failed to load config from ${configPath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return resolveConfig({}, projectRoot);
}

export function katasPath(root: string): string {
  return loadConfig(root).katasPath;
}

/** Shared by installed courses and authoring readiness; compound extensions
 * keep their existing convention (kata.js -> kata.test.js). */
export function kataTestTemplate(template: string): string {
  const file = basename(template);
  const dot = file.indexOf(".");
  return join(dirname(template), dot < 0 ? `${file}.test` : `${file.slice(0, dot)}.test${file.slice(dot)}`);
}

export function resolveKata(
  root: string,
  rc: DojoRc,
  entry: KataEntry,
): ResolvedKata {
  const dojo = dojoDir(root, rc.currentDojo);
  const wp = katasPath(root);
  const name = entry.name ?? basename(dirname(entry.template));
  const templateBasename = basename(entry.template);

  return {
    name,
    template: entry.template,
    workspacePath: resolve(wp, name, templateBasename),
    testPath: resolve(dojo, kataTestTemplate(entry.template)),
    senseiPath: ["SENSEI.mdx", "SENSEI.md"]
      .map((name) => resolve(dojo, dirname(entry.template), name))
      .find(existsSync) ?? resolve(dojo, dirname(entry.template), "SENSEI.md"),
    dojoKataDir: resolve(dojo, dirname(entry.template)),
    test: entry.test,
  };
}

export function resolveAllKatas(
  root: string,
  rc: DojoRc,
  catalog: DojoManifest,
): ResolvedKata[] {
  return catalog.katas.map((entry) => resolveKata(root, rc, entry));
}

export type KataState = "not-started" | "ongoing" | "completed";

export function kataState(kata: ResolvedKata, progress?: KataProgress): KataState {
  if (progress?.completed.includes(kata.name)) return "completed";
  return existsSync(kata.workspacePath) ? "ongoing" : "not-started";
}

export function findCurrentKata(
  katas: ResolvedKata[],
  current: string | null,
): ResolvedKata | null {
  if (current) {
    const found = katas.find((k) => k.name === current);
    if (found && existsSync(found.workspacePath)) return found;
  }
  return katas.find((k) => existsSync(k.workspacePath)) ?? null;
}

export function findNextKata(katas: ResolvedKata[], progress?: KataProgress): ResolvedKata | null {
  return katas.find((k) => {
    if (progress?.completed.includes(k.name)) return false;
    return !existsSync(k.workspacePath);
  }) ?? null;
}

export function completedCount(
  katas: ResolvedKata[],
  progress?: KataProgress,
): number {
  if (progress) {
    return katas.filter((k) => progress.completed.includes(k.name)).length;
  }
  return 0;
}

export function findKataByIdOrName(
  katas: ResolvedKata[],
  query: string,
): ResolvedKata | null {
  const byName = katas.find((k) => k.name === query);
  if (byName) return byName;
  const padded = query.padStart(3, "0");
  return katas.find((k) => k.name.startsWith(padded + "-")) ?? null;
}

export function listDojos(root: string): string[] {
  const dojosPath = resolve(root, DOJOS_DIR);
  if (!existsSync(dojosPath)) return [];
  return readdirSync(dojosPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

// --- Registry types ---

export interface RegistryItem {
  name: string;
  version: string;
  description: string;
  source: { type: "github"; repository: string } | { type: "tarball"; url: string };
}

export interface RegistryIndex {
  items: Array<{ name: string; description: string; version: string }>;
}
