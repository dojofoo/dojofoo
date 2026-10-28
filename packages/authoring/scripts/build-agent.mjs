import { execFileSync } from "node:child_process";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { agentSourceHash } = await import("../dist/eve/artifact.js");
const source = join(packageRoot, "agents/kyoshi");
const hash = await agentSourceHash(source);
const destination = join(packageRoot, "dist/prepared/kyoshi");

async function build() {
  const scratch = await mkdtemp(join(tmpdir(), "dojo-agent-package-"));
  const isolated = join(scratch, "application");

try {
  // Use the locked production graph, without links back into the monorepo.
  execFileSync(process.env.npm_execpath ?? "pnpm", ["--filter", "@dojofoo/authoring", "deploy",
    "--config.inject-workspace-packages=true", "--prod", "--offline", "--ignore-scripts", isolated], {
    cwd: resolve(packageRoot, "../.."), stdio: "inherit",
  });
  // Trace source dependencies once; a previous prepared server contains its
  // own traced graph and must not become input to the next build.
  await rm(join(isolated, "dist/prepared"), { recursive: true, force: true });
  const agent = join(isolated, "agents/kyoshi");
  await cp(source, agent, {
    recursive: true,
    filter: path => ![".eve", ".output", "runtime.json"].includes(path.split(/[\\/]/u).at(-1)),
  });
  await cp(join(packageRoot, "skills"), join(agent, "skills"), { recursive: true });
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
