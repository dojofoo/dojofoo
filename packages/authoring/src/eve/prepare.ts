import { access, chmod, copyFile, cp, lstat, mkdir, readFile, readlink, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { existsSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { kyoshiSkills } from "./instructions.ts";
import { agentSourceHash, authoringPackageRoot, courseAgentOutput } from "./artifact.ts";

const require = createRequire(import.meta.url);
const manifest = {
  name: "dojo-kyoshi-runtime",
  private: true,
  type: "module",
  dependencies: { "@dojofoo/agent": "*", "@dojofoo/authoring": "*" },
};

export const kyoshiRuntimeSource = `import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const runtime = async () => JSON.parse(await readFile(resolve(process.cwd(), "runtime.json"), "utf8"));
const load = createRequire(resolve(process.cwd(), "package.json"));
const host = path => pathToFileURL(load.resolve("@dojofoo/authoring/" + path)).href;
export const modules = { agent: host("eve/agent"), evaluate: host("eve/evaluate"), sandbox: host("sandbox"), instructions: host("eve/instructions") };
`;

/** Link immutable packaged output; each workspace retains its own runtime and durable state. */
export async function prepareKyoshiOutput(app: string, sourceRoot?: string): Promise<void> {
  const hash = await agentSourceHash(sourceRoot ?? join(authoringPackageRoot, "agents/kyoshi"));
  const target = sourceRoot ? courseAgentOutput(sourceRoot, hash) : join(authoringPackageRoot, "dist/prepared/kyoshi");
  try { await access(join(target, "server/index.mjs")); }
  catch (cause) { throw new Error(sourceRoot ? "This course agent needs preparation. Run dojofoo install in the course workspace." : "The prepared Kyoshi server is missing. Reinstall Dojofoo.", { cause }); }
  if (await readFile(join(target, "source.sha256"), "utf8") !== hash) {
    throw new Error("The installed Kyoshi build does not match its sources. Reinstall Dojofoo before opening the course.");
  }
  const output = join(app, ".output");
  let existing;
  try { existing = await lstat(output); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (existing) {
    if (!existing.isSymbolicLink()) throw new Error("Refusing to replace existing Kyoshi output.");
    if (resolve(dirname(output), await readlink(output)) === resolve(target)) return;
    await unlink(output);
  }
  await symlink(target, output, "dir");
}

/** Managed infrastructure only. Never modifies the course's package or lessons. */
export async function prepareKyoshiApp(courseRoot: string): Promise<string> {
  const course = await realpath(courseRoot);
  if (course === dirname(course)) throw new Error("A course cannot be a filesystem root.");
  const authored = join(course, ".dojo", "kyoshi");
  if (existsSync(authored)) {
    if (!(await lstat(authored)).isDirectory()) throw new Error("Kyoshi definitions must be a directory, not a link.");
    return prepareAuthoredKyoshi(authored);
  }
  return prepareKyoshiHost(course);
}

/** Private host state is independent of authored definitions and cached code. */
export async function prepareKyoshiHost(courseRoot: string, name = "kyoshi-app"): Promise<string> {
  const course = await realpath(courseRoot);
  if (course === dirname(course)) throw new Error("A course cannot be a filesystem root.");
  const app = join(course, ".dojo", name);
  await mkdir(app, { recursive: true });
  // This entire directory is managed runtime state, including local credentials.
  await writeFile(join(app, ".gitignore"), "*\n");
  const packagePath = join(app, "package.json");
  try {
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const current = JSON.parse(await readFile(packagePath, "utf8"));
    if (current.name !== manifest.name || current.private !== true) {
      throw new Error(`Refusing to replace an unmanaged Kyoshi app: ${app}`);
    }
  }
  for (const name of ["@dojofoo/agent", "@dojofoo/authoring"]) {
    const target = dirname(require.resolve(`${name}/package.json`));
    const link = join(app, "node_modules", name);
    await mkdir(dirname(link), { recursive: true });
    try { await symlink(target, link, "dir"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await realpath(link) !== await realpath(target)) {
        throw new Error(`Kyoshi dependency points to a different installation: ${link}`);
      }
    }
  }
  const agent = join(app, "agents", "kyoshi");
  // Leave old development generations intact until their durable sessions can
  // migrate. New workspaces use the same portable sources as the release build.
  if (existsSync(join(agent, ".eve", "dev-runtime"))) return agent;
  try {
    const saved = JSON.parse(await readFile(join(agent, "runtime.json"), "utf8"));
    if (saved && typeof saved === "object" && !("auth" in saved)) return agent;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await cp(join(authoringPackageRoot, "agents/kyoshi"), agent, {
    recursive: true,
    filter: path => ![".eve", ".output", "runtime.json"].includes(path.split(/[\\/]/u).at(-1)!),
  });
  // Register the same shipped material with Eve's native eve__skill tool.
  // These are managed app assets, never edits to the author's course files.
  for (const [skill, assets] of Object.entries(kyoshiSkills)) {
    const directory = join(agent, "skills", skill);
    await mkdir(directory, { recursive: true });
    for (const asset of assets) {
      await copyFile(require.resolve(`@dojofoo/authoring/skills/${skill}/${asset}`), join(directory, asset));
    }
  }
  return agent;
}

/** Fill missing host defaults; authored Eve files remain the source of truth. */
async function prepareAuthoredKyoshi(agent: string): Promise<string> {
  if (existsSync(join(agent, ".eve", "dev-runtime"))) return agent;
  await mkdir(join(agent, ".eve"), { recursive: true });
  await writeFile(join(agent, ".eve", ".gitignore"), "*\n");
  // The portable authored defaults import this generated, unpublished binding.
  await writeFile(join(agent, ".eve", "dojo-runtime.ts"), kyoshiRuntimeSource);
  const defaults: Record<string, string> = {
    "agent.ts": 'import { createKyoshiAgent } from "@dojofoo/authoring/eve/agent";\nimport { runtime } from "./.eve/dojo-runtime.ts";\nexport default createKyoshiAgent(runtime);\n',
    "tools/dojo_ui_ask.ts": 'export { default } from "@dojofoo/agent/tools/ask_question";\n',
    "tools/dojo_authoring_evaluate.ts": 'import { createKyoshiEvaluationTool } from "@dojofoo/authoring/eve/evaluate";\nimport { runtime } from "../.eve/dojo-runtime.ts";\nexport default createKyoshiEvaluationTool(runtime);\n',
    "sandbox/sandbox.ts": 'import { defineSandbox } from "@dojofoo/agent/sandbox";\nimport { createAuthoringSandbox } from "@dojofoo/authoring/sandbox";\nimport { runtime } from "../.eve/dojo-runtime.ts";\nexport const environment = createAuthoringSandbox(async () => (await runtime()).courseRoot);\nexport default defineSandbox(() => environment.open());\n',
    "channels/eve.ts": 'import { eveChannel } from "@dojofoo/agent/channels/eve";\nimport { httpBasic } from "@dojofoo/agent/channels/auth";\nimport { runtime } from "../.eve/dojo-runtime.ts";\nexport default eveChannel({ auth: async request => httpBasic((await runtime()).auth)(request) });\n',
  };
  if (!["instructions", "instructions.md", "instructions.ts", "instructions.js", "instructions.mts", "instructions.cts", "instructions.mjs", "instructions.cjs"].some(file => existsSync(join(agent, file)))) {
    defaults["instructions.ts"] = 'export { default } from "@dojofoo/authoring/eve/instructions";\n';
  }
  for (const name of ["bash", "read_file", "write_file"]) {
    defaults[`tools/${name}.ts`] = 'import { disableTool } from "@dojofoo/agent/tools";\nexport default disableTool();\n';
  }
  for (const [file, source] of Object.entries(defaults)) {
    if (["ts", "js", "mts", "cts", "mjs", "cjs"].some(extension => existsSync(join(agent, file.replace(/\.ts$/u, `.${extension}`))))) continue;
    await mkdir(dirname(join(agent, file)), { recursive: true });
    try { await writeFile(join(agent, file), source, { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  for (const [skill, assets] of Object.entries(kyoshiSkills)) {
    const directory = join(agent, "skills", skill);
    await mkdir(directory, { recursive: true });
    for (const asset of assets) {
      try { await copyFile(require.resolve(`@dojofoo/authoring/skills/${skill}/${asset}`), join(directory, asset), constants.COPYFILE_EXCL); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
  }
  return agent;
}

export async function prepareKyoshiHarness(courseRoot: string): Promise<string> {
  const course = await realpath(courseRoot);
  if (course === dirname(course)) throw new Error("A course cannot be a filesystem root.");
  const root = join(course, ".dojo", "kyoshi-harness");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, ".gitignore"), "*\n");
  const link = join(root, "course");
  try { await symlink(course, link, "dir"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await realpath(link) !== course) throw new Error("Kyoshi harness points to a different course.");
  }
  return root;
}

/** Expose the installed CLI to native shell tools without global installation. */
export async function prepareKyoshiCommand(harnessRoot: string, cli: string): Promise<string> {
  await access(cli);
  const directory = join(harnessRoot, "bin");
  await mkdir(directory, { recursive: true });
  const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const command = join(directory, "dojofoo");
  await writeFile(command, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`, { mode: 0o700 });
  await chmod(command, 0o700);
  return directory;
}
