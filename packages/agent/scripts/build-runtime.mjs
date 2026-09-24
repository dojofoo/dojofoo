import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Release-time assembly only. Consumers never execute this script or patch Eve.
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = manifest.devDependencies.eve;
const staging = await mkdtemp(join(tmpdir(), "dojo-agent-runtime-"));
try {
  const [packed] = JSON.parse(execFileSync("npm", ["pack", `eve@${version}`,
    "--ignore-scripts", "--json", "--registry=https://registry.npmjs.org"], {
    cwd: staging, encoding: "utf8",
  }));
  assert.equal(packed.integrity, "sha512-UXmo5QVn2LdB4HLUFmpUnny6iJMJMOpjaapR8gVg1/QkoYoM4NJh6kOR4VkhORb/OMcvyyrJ1uM9b/5q+2igyw==",
    "Re-audit the upstream artifact and patch before updating Eve");
  execFileSync("tar", ["-xzf", packed.filename], { cwd: staging });
  const upstream = join(staging, "package");
  const eve = JSON.parse(await readFile(join(upstream, "package.json"), "utf8"));
  assert.equal(eve.version, version);
  for (const key of Object.keys(eve.exports)) {
    assert.ok(Object.hasOwn(manifest.exports, key), `Missing pinned Eve export ${key}`);
  }
  for (const [name, version] of Object.entries(eve.dependencies)) {
    assert.equal(manifest.dependencies[name], version, `Keep Eve runtime dependency ${name} pinned`);
  }
  const patch = join(root, "patches", `eve@${version}.patch`);
  execFileSync("git", ["apply", "--check", patch], { cwd: upstream });
  execFileSync("git", ["apply", patch], { cwd: upstream });
  const distributionPatch = join(root, "patches", `eve-distribution@${version}.patch`);
  execFileSync("git", ["apply", "--check", distributionPatch], { cwd: upstream });
  execFileSync("git", ["apply", distributionPatch], { cwd: upstream });
  const destination = join(root, "dist/eve");
  await rm(destination, { recursive: true, force: true });
  // Preserve package scope, internal imports, workers, assets and license notices.
  await cp(upstream, destination, { recursive: true });
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
