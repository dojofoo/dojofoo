import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { agentSourceHash } = await import("../dist/eve/artifact.js");
const release = JSON.parse(await readFile(join(packageRoot, "../cli/package.json"), "utf8"));
const installed = createRequire(join(packageRoot, "package.json"));
const sdk = JSON.parse(await readFile(installed.resolve("@dojofoo/harness/package.json"), "utf8"));
const eve = JSON.parse(await readFile(installed.resolve("@dojofoo/harness/eve/package.json"), "utf8"));
// The prepared servers are deployed from this lockfile, which also pins dependency patches
const lockfile = createHash("sha256").update(await readFile(resolve(packageRoot, "../../pnpm-lock.yaml"))).digest("hex");
const names = { kyoshi: "Kyoshi", sensei: "Sensei" };

// Workspace packages are injected as built, so their version does not change
// when their code does; hash the built files that a prepared server copies.
async function builtHash(...roots) {
  const digest = createHash("sha256");
  for (const root of roots) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const files = entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name))
      .filter(file => !file.startsWith(join(packageRoot, "dist/prepared"))).sort();
    for (const file of files) digest.update(file.slice(root.length)).update(await readFile(file));
  }
  return digest.digest("hex");
}
const sdkRoot = dirname(installed.resolve("@dojofoo/harness/package.json"));
const built = await builtHash(join(sdkRoot, "dist"), join(sdkRoot, "patches"), join(packageRoot, "dist"));

async function current(destination, hash, label) {
  try {
    const saved = JSON.parse(await readFile(join(destination, "build.json"), "utf8"));
    const savedHash = (await readFile(join(destination, "source.sha256"), "utf8")).trim();
    await access(join(destination, "server/index.mjs"));
    return savedHash === hash && Object.entries(label).every(([key, value]) => saved[key] === value);
  } catch (error) {
    if (!(error instanceof SyntaxError) && error.code !== "ENOENT") throw error;
    return false;
  }
}

async function build({ persona, source, destination, hash, label }) {
  const scratch = await mkdtemp(join(tmpdir(), "dojo-agent-package-"));
  const isolated = join(scratch, "application");

try {
  // Use the locked production graph, without links back into the monorepo.
  execFileSync(process.env.npm_execpath ?? "pnpm", ["--filter", "@dojofoo/agents", "deploy",
    "--config.inject-workspace-packages=true", "--prod", "--ignore-scripts", isolated], {
    cwd: resolve(packageRoot, "../.."), stdio: "inherit",
  });
  // Trace source dependencies once; a previous prepared server contains its
  // own traced graph and must not become input to the next build.
  await rm(join(isolated, "dist/prepared"), { recursive: true, force: true });
  const agent = join(isolated, "agents", persona);
  await cp(source, agent, {
    recursive: true,
    filter: path => ![".eve", ".output", "runtime.json"].includes(path.split(/[\\/]/u).at(-1)),
  });
  // Kyoshi's authoring skills; Sensei has none
  if (persona === "kyoshi") await cp(join(packageRoot, "skills"), join(agent, "skills"), { recursive: true });
  const load = createRequire(join(isolated, "package.json"));
  const builder = load.resolve("@dojofoo/harness/server/build");
  const builtPath = join(scratch, "built-path.json");
  execFileSync(process.execPath, ["--input-type=module", "-e",
    'import { writeFile } from "node:fs/promises"; const { buildApplication } = await import(process.argv[1]); const output = await buildApplication(process.argv[2], { skipSandboxPrewarm: false }); await writeFile(process.argv[3], JSON.stringify({ output })); process.exit(0);', builder, agent, builtPath,
  ], { cwd: agent, env: { ...process.env, VERCEL: "", NITRO_PRESET: "node-server" }, stdio: "inherit" });
  const { output } = JSON.parse(await readFile(builtPath, "utf8"));
  await access(join(output, "server/index.mjs"));
  if (await agentSourceHash(source) !== hash) throw new Error("Agent definitions changed during preparation. Save again to prepare the current version.");
  await rm(destination, { recursive: true, force: true });
  await cp(output, destination, { recursive: true, verbatimSymlinks: true });
  await writeFile(join(destination, "source.sha256"), hash);
  await writeFile(join(destination, "build.json"), JSON.stringify(label, null, 2) + "\n");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
}
for (const persona of ["kyoshi", "sensei"]) {
  const source = join(packageRoot, "agents", persona);
  const destination = join(packageRoot, "dist/prepared", persona);
  const hash = await agentSourceHash(source);
  const label = {
    dojofoo: `dojofoo@${release.version}`,
    harness: `@dojofoo/harness@${sdk.version}`,
    eve: `eve@${eve.version}`,
    source: `dojofoo/${persona}@${release.version}`,
    sourceHash: hash,
    lockfile,
    built,
  };
  if (await current(destination, hash, label)) {
    console.info(`${names[persona]} source and release match; reusing the prepared build.`);
    continue;
  }
  await build({ persona, source, destination, hash, label });
}
// Like Eve's bin entrypoint, this one-shot worker has no work after cleanup.
process.exit(0);
