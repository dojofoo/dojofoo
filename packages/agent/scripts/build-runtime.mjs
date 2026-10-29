import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Release-time assembly only. Consumers never execute this script or patch Eve.
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const harness = JSON.parse(await readFile(createRequire(join(root, "package.json")).resolve("@ai-sdk/harness/package.json"), "utf8"));
const version = manifest.devDependencies.eve;
const staging = await mkdtemp(join(tmpdir(), "dojo-agent-runtime-"));
try {
  const [packed] = JSON.parse(execFileSync("npm", ["pack", `eve@${version}`,
    "--ignore-scripts", "--json", "--registry=https://registry.npmjs.org"], {
    cwd: staging, encoding: "utf8",
  }));
  assert.equal(packed.integrity, "sha512-kOjykogXDocRtz65OJtxFvkvoSXai/sWDonzTVXA2NKkJr4/Nnxt1RAuwQo2haf614CX54oQy1eY4y9pHbc1Iw==",
    "Re-audit the upstream artifact and patch before updating Eve");
  execFileSync("tar", ["-xzf", packed.filename], { cwd: staging });
  const upstream = join(staging, "package");
  const eve = JSON.parse(await readFile(join(upstream, "package.json"), "utf8"));
  assert.equal(eve.version, version);
  for (const key of Object.keys(eve.exports)) {
    assert.ok(Object.hasOwn(manifest.exports, key), `Missing pinned Eve export ${key}`);
  }
  for (const [name, version] of Object.entries(eve.dependencies)) {
    // The provider bridge and its consumers share HarnessAgent's SDK types.
    // Keep other Eve dependencies pinned to the audited runtime artifact.
    const pinned = name === "ai" || name === "@ai-sdk/provider" ? harness.dependencies[name] : version;
    assert.equal(manifest.dependencies[name], pinned, `Keep runtime dependency ${name} pinned`);
  }
  const patch = join(root, "patches", `eve@${version}.patch`);
  execFileSync("git", ["apply", "--check", patch], { cwd: upstream });
  execFileSync("git", ["apply", patch], { cwd: upstream });
  const distributionPatch = join(root, "patches", `eve-distribution@${version}.patch`);
  execFileSync("git", ["apply", "--check", distributionPatch], { cwd: upstream });
  execFileSync("git", ["apply", distributionPatch], { cwd: upstream });
  // A terminal provider-executed tool result is not an unfinished host tool.
  const nativeTurnPatch = join(root, "patches", `eve-native-turn@${version}.patch`);
  execFileSync("git", ["apply", "--check", nativeTurnPatch], { cwd: upstream });
  execFileSync("git", ["apply", nativeTurnPatch], { cwd: upstream });
  // Opt-in .dojo roles resolve against this installation, not a course package.
  const managedProjectPatch = join(root, "patches", `eve-managed-project@${version}.patch`);
  execFileSync("git", ["apply", "--check", managedProjectPatch], { cwd: upstream });
  execFileSync("git", ["apply", managedProjectPatch], { cwd: upstream });
  const destination = join(root, "dist/eve");
  await rm(destination, { recursive: true, force: true });
  // Preserve package scope, internal imports, workers, assets and license notices.
  await cp(upstream, destination, { recursive: true });
  // Re-export the host API from our facade; do not modify Eve's public module.
  const server = 'export * from "./eve/dist/src/public/server/index.js";\nexport { createDevelopmentServer } from "./eve/dist/src/internal/nitro/host/start-development-server.js";\nexport { startProductionServer } from "./eve/dist/src/internal/nitro/host/start-production-server.js";\n';
  for (const extension of ["js", "d.ts"]) {
    await writeFile(join(root, "dist", `server.${extension}`), server);
    await writeFile(join(root, "dist", `server-production.${extension}`), 'export { startProductionServer } from "./eve/dist/src/internal/nitro/host/start-production-server.js";\n');
    await writeFile(join(root, "dist", `server-build.${extension}`), 'export { buildApplication } from "./eve/dist/src/internal/nitro/host/build-application.js";\n');
  }
  await writeFile(join(destination, "dojo-build.json"), JSON.stringify({
    upstream: `eve@${version}`, integrity: packed.integrity,
  }, null, 2) + "\n");
  for (const name of await readdir(join(root, "dist"))) {
    if (!/\.(?:js|d\.ts)$/.test(name)) continue;
    const path = join(root, "dist", name);
    const source = await readFile(path, "utf8");
    const rewritten = source.replace(/from "(eve(?:\/[^"]+)?)"/g, (_, specifier) => {
      const key = specifier === "eve" ? "." : `.${specifier.slice(3)}`;
      const entry = eve.exports[key];
      const target = name.endsWith(".d.ts") ? entry.types : entry.import;
      assert.ok(target, `Missing Eve export ${specifier}`);
      return `from "./eve/${target.slice(2)}"`;
    });
    await writeFile(path, rewritten);
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}
