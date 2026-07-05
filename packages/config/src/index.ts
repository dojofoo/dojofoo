import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { createJiti } from "jiti";

export const CLI = "dojo";
export const DOJOS_DIR = ".dojos";

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
}

export interface ResolvedRunnerConfig {
  adapter: "vitest" | "exit-code";
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
  const runner: ResolvedRunnerConfig = { adapter: userConfig.runner?.adapter ?? "vitest" };
  const registries = { dojocho: "https://dojocho.ai/r/{name}.json", ...userConfig.registries };
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
  description?: string;
  difficulty?: 1 | 2 | 3;
  tags?: string[];
  prerequisites?: string[];
}

export interface DojoManifest {
  name: string;
  version: string;
  description: string;
  test: string;
  katas: KataEntry[];
  runner?: RunnerConfig;
  author?: string;
  homepage?: string;
  repository?: string;
}

export class ManifestValidationError extends Error {
  constructor(
    public readonly errors: string[],
    path: string,
  ) {
    super(
      `Invalid dojo.json at ${path}:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
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

  for (const field of ["name", "version", "description", "test"] as const) {
    if (!(field in obj)) {
      errors.push(`Missing required field: "${field}"`);
    } else if (typeof obj[field] !== "string") {
      errors.push(`"${field}" must be a string`);
    } else if ((obj[field] as string).trim() === "") {
      errors.push(`"${field}" must not be empty`);
    }
  }

  if (!("katas" in obj)) {
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
      for (const f of ["test", "name", "description"]) {
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
    }
  }

  for (const field of ["author", "homepage", "repository"] as const) {
    if (field in obj && typeof obj[field] !== "string") {
      errors.push(`"${field}" must be a string`);
    }
  }

  return errors;
}

export function parseManifest(json: string, path: string): DojoManifest {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ManifestValidationError(["Invalid JSON"], path);
  }
  const errors = validateManifest(data);
  if (errors.length > 0) {
    throw new ManifestValidationError(errors, path);
  }
  return data as DojoManifest;
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
    throw new Error(".dojorc not found — run `dojo --start` first");
  }
  return validateDojoRc(JSON.parse(readFileSync(rcPath, "utf8")));
}

export function writeDojoRc(root: string, rc: DojoRc): void {
  const rcPath = resolve(root, ".dojorc");
  writeFileSync(rcPath, JSON.stringify(rc, null, 2) + "\n");
}

export function readCatalog(root: string, active: string): DojoManifest {
  const catalogPath = resolve(root, DOJOS_DIR, active, "dojo.json");
  if (!existsSync(catalogPath)) {
    throw new Error(`dojo.json not found at ${catalogPath}`);
  }
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

export function resolveKata(
  root: string,
  rc: DojoRc,
  entry: KataEntry,
): ResolvedKata {
  const dojo = dojoDir(root, rc.currentDojo);
  const wp = katasPath(root);
  const name = entry.name ?? basename(dirname(entry.template));
  const templateBasename = basename(entry.template);
  const dotIdx = templateBasename.indexOf(".");
  const stem = dotIdx >= 0 ? templateBasename.substring(0, dotIdx) : templateBasename;
  const ext = dotIdx >= 0 ? templateBasename.substring(dotIdx) : "";

  return {
    name,
    template: entry.template,
    workspacePath: resolve(wp, name, templateBasename),
    testPath: resolve(dojo, dirname(entry.template), `${stem}.test${ext}`),
    senseiPath: resolve(dojo, dirname(entry.template), "SENSEI.md"),
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
  source: { type: "npm"; package: string } | { type: "tarball"; url: string };
}

export interface RegistryIndex {
  items: Array<{ name: string; description: string; version: string }>;
}
