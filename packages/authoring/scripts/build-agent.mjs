import { execFileSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { agentSourceHash, courseAgentOutput } = await import("../dist/eve/artifact.js");
const courseRoot = process.argv[2] ? await realpath(process.argv[2]) : undefined;
const { prepareKyoshiApp, kyoshiRuntimeSource } = await import("../dist/eve/build.js");
const source = courseRoot ? await prepareKyoshiApp(courseRoot) : join(packageRoot, "agents/kyoshi");
const hash = await agentSourceHash(source);
const destination = courseRoot ? courseAgentOutput(source, hash) : join(packageRoot, "dist/prepared/kyoshi");

async function build() {
  if (courseRoot) {
    try {
      if (await readFile(join(destination, "source.sha256"), "utf8") === hash) {
        await access(join(destination, "server/index.mjs"));
        return;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const scratch = await mkdtemp(join(tmpdir(), "dojo-agent-package-"));
  const isolated = join(scratch, "application");

try {
  // Use the locked production graph, without links back into the monorepo.
  if (existsSync(resolve(packageRoot, "../../pnpm-workspace.yaml"))) execFileSync(process.env.npm_execpath ?? "pnpm", ["--filter", "@dojofoo/authoring", "deploy",
    "--config.inject-workspace-packages=true", "--prod", "--offline", "--ignore-scripts", isolated], {
    cwd: resolve(packageRoot, "../.."), stdio: "inherit",
  });
  else {
    // An installed CLI already has a standalone production dependency graph.
    await cp(packageRoot, isolated, { recursive: true, verbatimSymlinks: true,
      filter: path => !["node_modules", "prepared", ".eve"].includes(path.split(/[\\/]/u).at(-1)),
    });
    const installed = createRequire(join(packageRoot, "package.json")).resolve.paths("@dojofoo/agent")
      .find(path => existsSync(join(path, "@dojofoo/agent/package.json")));
    if (!installed) throw new Error("The installed agent dependencies are missing. Reinstall Dojofoo.");
    await mkdir(join(isolated, "node_modules"));
    for (const entry of await readdir(installed)) {
      if (entry.startsWith("@")) {
        await mkdir(join(isolated, "node_modules", entry));
        for (const name of await readdir(join(installed, entry))) {
          if (`${entry}/${name}` === "@dojofoo/authoring") continue;
          await symlink(join(installed, entry, name), join(isolated, "node_modules", entry, name), "dir");
        }
      } else await symlink(join(installed, entry), join(isolated, "node_modules", entry), "dir");
    }
  }
  // Trace source dependencies once; a previous prepared server contains its
  // own traced graph and must not become input to the next build.
  await rm(join(isolated, "dist/prepared"), { recursive: true, force: true });
  let agent = join(isolated, "agents/kyoshi");
  if (courseRoot) {
    const { courseFileFilter } = await import("@dojofoo/config");
    const include = courseFileFilter(courseRoot, true);
    const stagedCourse = join(isolated, "course");
    await cp(courseRoot, stagedCourse, { recursive: true,
      filter: path => include(relative(courseRoot, path)) && !relative(courseRoot, path).split(/[\\/]/u).includes(".output"),
    });
    if (existsSync(join(courseRoot, "node_modules"))) await symlink(join(courseRoot, "node_modules"), join(stagedCourse, "node_modules"), "dir");
    // Compile through Eve's ordinary agent layout. The published .dojo role
    // stays untouched; its managed-project resolver is for live development.
    agent = join(stagedCourse, "agents/kyoshi");
    await rm(agent, { recursive: true, force: true });
    const self = join(isolated, "node_modules/@dojofoo/authoring");
    try { await symlink(isolated, self, "dir"); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  await cp(source, agent, {
    recursive: true,
    filter: path => ![".eve", ".output", "runtime.json"].includes(path.split(/[\\/]/u).at(-1)),
  });
  if (courseRoot) {
    await mkdir(join(agent, ".eve"), { recursive: true });
    await writeFile(join(agent, ".eve/dojo-runtime.ts"), kyoshiRuntimeSource);
    await writeFile(join(agent, "runtime.json"), JSON.stringify({ courseRoot, harnessRoot: courseRoot, harness: "opencode" }));
  } else await cp(join(packageRoot, "skills"), join(agent, "skills"), { recursive: true });
  const load = createRequire(join(isolated, "package.json"));
  const builder = load.resolve("@dojofoo/agent/server/build");
  const builtPath = join(scratch, "built-path.json");
  execFileSync(process.execPath, ["--input-type=module", "-e",
    'import { writeFile } from "node:fs/promises"; const { buildApplication } = await import(process.argv[1]); const output = await buildApplication(process.argv[2], { skipSandboxPrewarm: false }); await writeFile(process.argv[3], JSON.stringify({ output })); process.exit(0);', builder, agent, builtPath,
  ], { cwd: agent, env: { ...process.env, VERCEL: "", NITRO_PRESET: "node-server" }, stdio: "inherit" });
  const { output } = JSON.parse(await readFile(builtPath, "utf8"));
  await access(join(output, "server/index.mjs"));
  if (await agentSourceHash(source) !== hash) throw new Error("Agent definitions changed during preparation. Save again to prepare the current version.");
  await cp(output, destination, { recursive: true, verbatimSymlinks: true });
  await writeFile(join(destination, "source.sha256"), hash);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
}
await build();
// Like Eve's bin entrypoint, this one-shot worker has no work after cleanup.
process.exit(0);
