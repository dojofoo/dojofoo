import { mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const manifest = {
  name: "dojo-kyoshi-runtime",
  private: true,
  type: "module",
  dependencies: { "@dojofoo/agent": "*", "@dojofoo/authoring": "*" },
};

/** Managed infrastructure only. Never modifies the course's package or lessons. */
export async function prepareKyoshiApp(courseRoot: string): Promise<string> {
  const course = await realpath(courseRoot);
  if (course === dirname(course)) throw new Error("A course cannot be a filesystem root.");
  const app = join(course, ".dojo", "kyoshi-app");
  await mkdir(app, { recursive: true });
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
  await mkdir(join(agent, "tools"), { recursive: true });
  await mkdir(join(agent, "sandbox"), { recursive: true });
  const files: Record<string, string> = {
    "agent.ts": `import { readFile } from "node:fs/promises";
import { createKyoshiAgent } from "@dojofoo/authoring/eve/agent";
export default createKyoshiAgent(async () => JSON.parse(await readFile(${JSON.stringify(join(agent, "runtime.json"))}, "utf8")));
`,
    "instructions.ts": 'export { default } from "@dojofoo/authoring/eve/instructions";\n',
    "sandbox/sandbox.ts": `import { createAuthoringSandbox } from "@dojofoo/authoring/sandbox";\nexport default createAuthoringSandbox(${JSON.stringify(course)});\n`,
    "tools/dojo_ui_ask.ts": 'export { default } from "@dojofoo/authoring/eve/ask";\n',
  };
  for (const [file, source] of Object.entries(files)) {
    await writeFile(join(agent, file), source);
  }
  return agent;
}

export async function prepareKyoshiHarness(courseRoot: string): Promise<string> {
  const course = await realpath(courseRoot);
  if (course === dirname(course)) throw new Error("A course cannot be a filesystem root.");
  const root = join(course, ".dojo", "kyoshi-harness");
  await mkdir(root, { recursive: true });
  const link = join(root, "course");
  try { await symlink(course, link, "dir"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await realpath(link) !== course) throw new Error("Kyoshi harness points to a different course.");
  }
  return root;
}
