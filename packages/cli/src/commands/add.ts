import { existsSync, mkdirSync, cpSync, renameSync, unlinkSync, symlinkSync, readdirSync, readFileSync, writeFileSync, rmSync, lstatSync, mkdtempSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { basename, dirname, resolve, relative } from "node:path";
import { parseDocument } from "yaml";
import { tmpdir } from "node:os";
import {
  CLI,
  DOJOS_DIR,
  readDojoRc,
  writeDojoRc,
  dojoDir,
  courseMode,
  findManifestPath,
  loadConfig,
  parseManifest,
  readCourseManifest,
  createStateDirectory,
  courseFileFilter,
  type RegistryItem,
} from "../config";
import { remove as removeDojo } from "./remove";
import { agentsFromArgs, configuredAgents, detectAgentsFromEnv, ensureProject, setupAgents } from "./setup";
import { pmCommands } from "../pm";
import { AGENTS } from "./setup";
import { queueCourseEvent } from "../telemetry";
import { startKata } from "./kata";
import {
  parseGithubSource,
  readInstalledSource,
  writeInstalledSource,
  type InstalledSource,
} from "../source";
import { acquireRemoteDojo, type RemoteDojoSource } from "../source-acquisition";
import { checkCourseAudits } from "../course-audit";

export async function add(root: string, args: string[]): Promise<void> {
  ensureProject(root);
  const requestedAgents = agentsFromArgs(args);
  const agents = requestedAgents.length > 0 ? requestedAgents : detectAgentsFromEnv();
  if (agents.length > 0) setupAgents(root, agents);
  const source = positionalArgs(args)[0];
  const force = args.includes("--force");
  const authoring = args.includes("--master");
  const yes = args.includes("--yes");
  if (!source) {
    throw new Error(`Usage: ${CLI} add <source>

Source can be:
  Local path:   ${CLI} add ./path/to/dojo
  Registry:     ${CLI} add effect-ts
  URL:          ${CLI} add https://example.com/dojo.tgz
  GitHub:       ${CLI} add owner/repository

Flags:
  --force                  Overwrite existing dojo
  --yes                    Install despite security warnings (a failed check still stops it)
  --master                 Include editable source and Kyoshi definitions; respect the course license when forking
  --agent <name[,name]>    Install support for codex, opencode, claude, gemini, or pi`);
  }

  const sourceType = classifySource(source);
  switch (sourceType) {
    case "local":    addLocal(root, source, force, authoring); break;
    case "npm":      throw deprecatedNpmSource(source);
    case "github":   await addRemote(root, source, "github", force, authoring, yes); break;
    case "url":      await addRemote(root, source, "url", force, authoring, yes); break;
    case "registry": await addFromRegistry(root, source, force, authoring, yes); break;
  }
}

function positionalArgs(args: string[]): string[] {
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--agent") {
      index += 1;
    } else if (!argument.startsWith("--")) {
      positional.push(argument);
    }
  }
  return positional;
}

export function classifySource(source: string): "local" | "npm" | "github" | "url" | "registry" {
  if (source.startsWith(".") || source.startsWith("/")) return "local";
  if (source.startsWith("https://") || source.startsWith("http://")) return "url";
  if (source.startsWith("@")) return "npm";
  if (parseGithubSource(source)) return "github";
  return "registry";
}

function deprecatedNpmSource(source: string): Error {
  const repository = source.replace(/^@/u, "").replace(/^(dojofoo)\//u, "$1/");
  return new Error(`npm dojo installation is deprecated: ${source}\n\nInstall the course from Git instead, for example:\n  ${CLI} add ${repository}`);
}

function moveDir(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch {
    cpSync(src, dest, { recursive: true });
  }
}

function handleExisting(root: string, name: string, force: boolean): void {
  const targetPath = dojoDir(root, name);
  if (!existsSync(targetPath)) return;
  if (!force) {
    throw new Error(existingDojoMessage(root, name));
  }
  if (targetPath === resolve(root, DOJOS_DIR, name)) {
    const baseline = resolve(root, ".dojo/state", name, "installation.sha256");
    if (!existsSync(baseline) || readFileSync(baseline, "utf8") !== directoryIntegrity(targetPath)) {
      throw new Error(`Dojo "${name}" has local changes or no installation baseline. Update stopped to preserve your files. Commit or copy your course before removing and reinstalling it.`);
    }
  }
  removeDojo(root, [name]);
}

export function existingDojoMessage(root: string, name: string): string {
  const installed = readInstalledSource(dojoDir(root, name));
  return `Dojo "${name}" is already installed in this project.

  Location: ${DOJOS_DIR}/${name}${installed ? `\n  Source:   ${installed.locator}` : ""}
  Update:   ${CLI} update ${name}
  Remove:   ${CLI} remove ${name}`;
}

function addLocal(root: string, source: string, force: boolean, authoring: boolean): void {
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath)) {
    throw new Error(`Source not found: ${sourcePath}`);
  }
  if (!statSync(sourcePath).isDirectory()) throw new Error("Local course sources must be directories; use a Git repository or archive URL for remote sources.");

  const tmpDir = mkdtempSync(resolve(tmpdir(), "dojofoo-local-"));

  try {
    const staged = resolve(tmpDir, "course");
    const include = courseFileFilter(sourcePath, authoring);
    cpSync(sourcePath, staged, {
      recursive: true,
      filter: (path) => {
        const relativePath = relative(sourcePath, path);
        return !lstatSync(path).isSymbolicLink() && include(relativePath);
      },
    });
    installExtracted(root, staged, source, force, {
      version: 1,
      type: "local",
      locator: sourcePath,
      authoring,
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function installExtracted(
  root: string,
  extractedDir: string,
  source: string,
  force: boolean,
  installedSource?: InstalledSource,
): void {
  const manifestPath = findManifestPath(extractedDir);
  if (!manifestPath) {
    throw new Error(`${source} is not a dojo — missing dojo.yaml, dojo.yml, or dojo.json`);
  }
  const manifest = parseManifest(readFileSync(manifestPath, "utf8"), manifestPath);
  if (manifestPath.endsWith(".json")) {
    const document = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete document.progress;
    writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
  } else {
    const document = parseDocument(readFileSync(manifestPath, "utf8"));
    document.delete("progress");
    writeFileSync(manifestPath, document.toString());
  }
  const name = manifest.name.includes("/") ? manifest.name.split("/").pop()! : manifest.name;
  const targetPath = dojoDir(root, name);
  const currentSource = readInstalledSource(targetPath);
  if (force && installedSource?.integrity && currentSource?.integrity === installedSource.integrity
    && Boolean(currentSource.authoring) === Boolean(installedSource.authoring)) {
    console.log(`Dojo "${name}" is already up to date.`);
    return;
  }

  // Definition updates must not reset the learner's YAML progress.
  if (force && existsSync(targetPath)) {
    const previousPath = findManifestPath(targetPath);
    if (previousPath) {
      const previousSource = readFileSync(previousPath, "utf8");
      const previous = previousPath.endsWith(".json") ? JSON.parse(previousSource) : parseDocument(previousSource).toJS();
      if (previous.progress !== undefined) {
        if (manifestPath.endsWith(".json")) {
          const document = JSON.parse(readFileSync(manifestPath, "utf8"));
          document.progress = previous.progress;
          writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
        } else {
          const document = parseDocument(readFileSync(manifestPath, "utf8"));
          document.set("progress", previous.progress);
          writeFileSync(manifestPath, document.toString());
        }
      }
    }
  }

  if (installedSource) writeInstalledSource(extractedDir, installedSource);

  // Install deps in staging dir (still in tmpDir)
  const pm = pmCommands(root);
  const pkgPath = resolve(extractedDir, "package.json");
  const hasMise = existsSync(resolve(extractedDir, "mise.toml")) || existsSync(resolve(extractedDir, ".mise.toml"));
  if (existsSync(pkgPath) && !hasMise) {
    console.log(`Installing ${name} dependencies...`);
    try {
      execSync(pm.installSilent, { cwd: extractedDir, stdio: "pipe" });
    } catch (err) {
      const e = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
      const detail =
        e.stderr?.toString().trim() ||
        e.stdout?.toString().trim() ||
        e.message ||
        "unknown error";
      throw new Error(`Failed to install ${name} dependencies via ${pm.name}:\n\n${detail}`);
    }
  }

  // Move to final location
  handleExisting(root, name, force);
  mkdirSync(resolve(root, DOJOS_DIR), { recursive: true });
  moveDir(extractedDir, targetPath);

  finalize(root, name, targetPath, installedSource);
}

async function addRemote(root: string, source: string, type: RemoteDojoSource, force: boolean, authoring: boolean, yes: boolean): Promise<void> {
  const locator = type === "github" ? parseGithubSource(source)?.repository : source;
  if (!locator) throw new Error(`Invalid GitHub repository: ${source}`);
  const tmpDir = mkdtempSync(resolve(tmpdir(), "dojofoo-giget-"));
  const staged = resolve(tmpDir, "course");

  try {
    console.log(`Fetching ${locator}...`);
    const downloaded = await acquireRemoteDojo(locator, type, staged);
    const extracted = findDownloadedDojo(downloaded);
    if (!extracted) throw new Error(`${source} is not a dojo — missing dojo.yaml, dojo.yml, or dojo.json`);
    // Downloaded without credentials, so public: what the course API's checks found
    if (type === "github") await checkCourseAudits(locator, { yes });
    const published = resolve(tmpDir, "published");
    const include = courseFileFilter(extracted, authoring);
    cpSync(extracted, published, {
      recursive: true,
      filter: path => !lstatSync(path).isSymbolicLink() && include(relative(extracted, path)),
    });
    installExtracted(root, published, source, force, {
      version: 1,
      type,
      locator,
      integrity: directoryIntegrity(published),
      authoring,
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function validateRegistryItem(data: unknown): RegistryItem {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid registry response: expected a JSON object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || typeof obj.version !== "string" || typeof obj.description !== "string") {
    throw new Error("Invalid registry item: missing name, version, or description");
  }
  if (typeof obj.source !== "object" || obj.source === null) {
    throw new Error("Invalid registry item: missing source");
  }
  const src = obj.source as Record<string, unknown>;
  if (src.type === "github" && typeof src.repository === "string" && parseGithubSource(src.repository)) {
    return obj as unknown as RegistryItem;
  }
  if (src.type === "tarball" && typeof src.url === "string") {
    return obj as unknown as RegistryItem;
  }
  throw new Error(`Invalid registry item: source must be github or tarball`);
}

async function addFromRegistry(root: string, name: string, force: boolean, authoring: boolean, yes: boolean): Promise<void> {
  const config = loadConfig(root, { command: "add" });

  for (const [registryName, urlTemplate] of Object.entries(config.registries)) {
    const url = urlTemplate.replace("{name}", name);
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const item = validateRegistryItem(await res.json());
      if (item.source.type === "github") {
        return addRemote(root, item.source.repository, "github", force, authoring, yes);
      }
      return addRemote(root, item.source.url, "url", force, authoring, yes);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Invalid registry")) throw err;
      console.log(`Registry "${registryName}" unreachable: ${url}`);
    }
  }

  throw new Error(`"${name}" not found in any registry.

Try:
  GitHub:       ${CLI} add dojofoo/${name}
  Local path:   ${CLI} add ./path/to/${name}`);
}

function findDownloadedDojo(directory: string): string | null {
  if (findManifestPath(directory)) return directory;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && findManifestPath(resolve(directory, entry.name))) {
      return resolve(directory, entry.name);
    }
  }
  return null;
}

function directoryIntegrity(directory: string): string {
  const hash = createHash("sha256");
  const visit = (current: string, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(current, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if ([".git", "node_modules", ".pnpm-store", ".eve", ".dojo-source.json"].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) {
        hash.update(`link:${relativePath}\0`);
        continue;
      }
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${relativePath}\0`);
      if (entry.isDirectory()) visit(path, relativePath);
      else if (statSync(path).isFile()) {
        if (prefix === "" && ["dojo.yaml", "dojo.yml", "dojo.json"].includes(entry.name)) {
          const source = readFileSync(path, "utf8");
          const manifest = entry.name.endsWith(".json") ? JSON.parse(source) : parseDocument(source).toJS();
          delete manifest.progress;
          hash.update(JSON.stringify(manifest));
        } else hash.update(readFileSync(path));
      }
    }
  };
  visit(directory);
  return `sha256-${hash.digest("hex")}`;
}

function finalize(root: string, name: string, targetPath: string, source?: InstalledSource): void {
  // Update .dojorc
  const rc = readDojoRc(root);
  rc.currentDojo = name;
  writeDojoRc(root, rc);

  // Add dependency paths to the dojo's tsconfig
  const dojoPkgPath = resolve(targetPath, "package.json");
  const dojoTsconfigPath = resolve(targetPath, "tsconfig.json");
  if (existsSync(dojoPkgPath) && existsSync(dojoTsconfigPath)) {
    const dojoPkg = JSON.parse(readFileSync(dojoPkgPath, "utf8"));
    const dojoTsconfig = JSON.parse(readFileSync(dojoTsconfigPath, "utf8"));
    const deps = Object.keys(dojoPkg.dependencies ?? {});
    if (deps.length > 0) {
      dojoTsconfig.compilerOptions ??= {};
      const paths = dojoTsconfig.compilerOptions.paths ?? {};
      for (const dep of deps) {
        paths[dep] = [`./node_modules/${dep}`];
        paths[`${dep}/*`] = [`./node_modules/${dep}/*`];
      }
      dojoTsconfig.compilerOptions.paths = paths;
      writeFileSync(dojoTsconfigPath, JSON.stringify(dojoTsconfig, null, 2) + "\n");
    }
  }

  const mode = courseMode(readCourseManifest(root, name));
  if (mode === "katas" && existsSync(resolve(root, ".dojorc"))) {
    // Kata courses extend their tooling into the learner's coding workspace.
    const dojo = loadConfig(root);
    const katasInclude = `${relative(root, dojo.katasPath)}/**/*.ts`;
    const tsconfigPath = resolve(root, "tsconfig.json");
    const extendsPath = `./${relative(root, resolve(targetPath, "tsconfig.json"))}`;
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          extends: extendsPath,
          compilerOptions: { noEmit: true },
          include: [katasInclude],
        },
        null,
        2,
      ) + "\n",
    );
  }

  if (mode === "katas" && !existsSync(resolve(root, ".dojorc"))) {
    const catalog = readCourseManifest(root, name);
    if ("katas" in catalog) {
      const starters = createStateDirectory(root, name, "starters");
      for (const lesson of catalog.katas) {
        // The name lesson state uses everywhere else (resolveKata): its own, or its folder's
        const id = lesson.name ?? basename(dirname(lesson.template));
        if (!id || !/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/u.test(id)) throw new Error("Each installed lesson needs a stable ID");
        const template = resolve(targetPath, lesson.template);
        const initial = resolve(starters, id);
        writeFileSync(initial, readFileSync(template));
      }
    }
  }

  // Symlink commands/skills to agent directories
  symlinkDojo(root, targetPath);

  runLifecycleScript(root, targetPath, "prepare.sh");
  if (mode === "katas" && !source?.authoring && !readDojoRc(root).currentKata) startKata(root);
  if (targetPath === resolve(root, DOJOS_DIR, name)) {
    writeFileSync(resolve(createStateDirectory(root, name), "installation.sha256"), directoryIntegrity(targetPath));
  }

  console.log(`Dojo "${name}" added.

  Location:  ${DOJOS_DIR}/${name}
  Active:    ${name}
  Start:     ${source?.authoring ? `cd ${DOJOS_DIR}/${name} && ${CLI} --authoring` : CLI}`);

  queueCourseEvent(
    root,
    name,
    "installed",
    undefined,
    source?.type === "github"
      ? {
          type: "github",
          locator: source.locator,
          ...(source.integrity ? { integrity: source.integrity } : {}),
        }
      : undefined,
  );
}


function symlinkDir(sourceDir: string, targetDir: string, filter: (e: import("node:fs").Dirent) => boolean): void {
  if (!existsSync(sourceDir)) return;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!filter(entry)) continue;
    const link = resolve(targetDir, entry.name);
    try {
      if (!lstatSync(link).isSymbolicLink()) continue;
      unlinkSync(link);
    } catch {
      // The local catalog does not contain this skill yet.
    }
    symlinkSync(relative(targetDir, resolve(sourceDir, entry.name)), link);
  }
}

export function runLifecycleScript(root: string, dojoPath: string, script: string): void {
  const scriptPath = resolve(dojoPath, script);
  if (!existsSync(scriptPath)) return;
  try {
    execSync(`bash ${scriptPath}`, {
      cwd: dojoPath,
      stdio: "inherit",
      env: { ...process.env, PROJECT_ROOT: root },
    });
  } catch {
    console.log(`Warning: ${script} exited with errors.`);
  }
}

function symlinkDojo(root: string, dojoPath: string): void {
  symlinkDir(
    resolve(dojoPath, "skills"),
    resolve(root, ".agents", "skills"),
    (entry) => entry.isDirectory(),
  );
  for (const agent of configuredAgents(root)) {
    const dir = AGENTS[agent].dir;
    symlinkDir(resolve(dojoPath, "commands"), resolve(root, dir, "commands"), (e) => e.name.endsWith(".md"));
  }
}
