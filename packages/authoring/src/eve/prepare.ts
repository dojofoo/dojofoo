import { access, chmod, lstat, mkdir, readFile, readlink, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { authoringPackageRoot } from "./artifact.ts";

const require = createRequire(import.meta.url);
const manifest = {
  name: "dojo-kyoshi-runtime",
  private: true,
  type: "module",
  dependencies: { "@dojofoo/agent": "*", "@dojofoo/authoring": "*" },
};

/** Link immutable packaged output; each workspace retains its own runtime and durable state. */
export async function prepareKyoshiOutput(app: string): Promise<void> {
  const target = join(authoringPackageRoot, "dist/prepared/kyoshi");
  try { await access(join(target, "server/index.mjs")); }
  catch (cause) { throw new Error("The shipped Kyoshi server is missing. Reinstall Dojofoo.", { cause }); }
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
  const app = join(course, ".dojo", "kyoshi-app");
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
  await mkdir(agent, { recursive: true });
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
