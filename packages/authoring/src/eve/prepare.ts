import { access, chmod, lstat, mkdir, readFile, readlink, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { authoringPackageRoot } from "./artifact.ts";

const require = createRequire(import.meta.url);
export type PreparedPersona = "kyoshi" | "sensei";
const names: Record<PreparedPersona, string> = { kyoshi: "Kyoshi", sensei: "Sensei" };
const manifest = (persona: PreparedPersona) => ({
  name: `dojo-${persona}-runtime`,
  private: true,
  type: "module",
  dependencies: { "@dojofoo/harness": "*", "@dojofoo/authoring": "*" },
});

/** Link immutable packaged output; each workspace retains its own runtime and durable state. */
export async function preparePersonaOutput(app: string, persona: PreparedPersona): Promise<void> {
  const target = join(authoringPackageRoot, "dist/prepared", persona);
  try { await access(join(target, "server/index.mjs")); }
  catch (cause) { throw new Error(`The shipped ${names[persona]} server is missing. Reinstall Dojofoo.`, { cause }); }
  const output = join(app, ".output");
  let existing;
  try { existing = await lstat(output); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (existing) {
    if (!existing.isSymbolicLink()) throw new Error(`Refusing to replace existing ${names[persona]} output.`);
    if (resolve(dirname(output), await readlink(output)) === resolve(target)) return;
    await unlink(output);
  }
  await symlink(target, output, "dir");
}

export function prepareKyoshiOutput(app: string): Promise<void> {
  return preparePersonaOutput(app, "kyoshi");
}

export function prepareKyoshiApp(courseRoot: string): Promise<string> {
  return preparePersonaApp(courseRoot, "kyoshi");
}

/** Managed infrastructure only. Never modifies the course's package or lessons. */
export async function preparePersonaApp(courseRoot: string, persona: PreparedPersona): Promise<string> {
  const course = await realpath(courseRoot);
  if (course === dirname(course)) throw new Error("A course cannot be a filesystem root.");
  const app = join(course, ".dojo", `${persona}-app`);
  await mkdir(app, { recursive: true });
  // This entire directory is managed runtime state, including local credentials.
  await writeFile(join(app, ".gitignore"), "*\n");
  const packagePath = join(app, "package.json");
  try {
    await writeFile(packagePath, `${JSON.stringify(manifest(persona), null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const current = JSON.parse(await readFile(packagePath, "utf8"));
    if (current.name !== manifest(persona).name || current.private !== true) {
      throw new Error(`Refusing to replace an unmanaged ${names[persona]} app: ${app}`);
    }
    // An app prepared under earlier package names: Eve finds the app by its dependency on the harness
    const { dependencies } = manifest(persona);
    if (JSON.stringify(current.dependencies) !== JSON.stringify(dependencies)) {
      await writeFile(packagePath, `${JSON.stringify({ ...current, dependencies }, null, 2)}\n`);
    }
  }
  for (const name of ["@dojofoo/harness", "@dojofoo/authoring"]) {
    const target = dirname(require.resolve(`${name}/package.json`));
    const link = join(app, "node_modules", name);
    await mkdir(dirname(link), { recursive: true });
    try { await symlink(target, link, "dir"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!(await lstat(link)).isSymbolicLink()) throw new Error(`Refusing to replace a ${names[persona]} dependency that is not a link: ${link}`);
      // Another dojofoo (an upgrade, another checkout) prepared this course: its links are ours to move
      if (await realpath(link).catch(() => "") !== await realpath(target)) {
        await unlink(link);
        await symlink(target, link, "dir");
      }
    }
  }
  const agent = join(app, "agents", persona);
  await mkdir(agent, { recursive: true });
  return agent;
}

export function prepareKyoshiHarness(courseRoot: string): Promise<string> {
  return preparePersonaHarness(courseRoot);
}

/** Kyoshi's harness root: `.dojo/kyoshi-harness` with a `course` link. Sensei's lives outside the workspace (sensei/runtime.ts). */
export async function preparePersonaHarness(courseRoot: string): Promise<string> {
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
