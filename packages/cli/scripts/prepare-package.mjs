import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Build-time packaging only: retain Node's normal module resolution and assets.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const destination = resolve(root, ".package");
const scratch = mkdtempSync(resolve(tmpdir(), "dojo-cli-runtime-"));
const packages = ["protocol", "config", "harness", "agents"].map(name => resolve(root, "..", name));
// Retain the tested shutdown fix rather than reinstalling unpatched Nitro.
packages.push(dirname(createRequire(resolve(root, "../harness/package.json")).resolve("nitro/package.json")));
// Warm installation and the prepared agent must use the same patched bootstrap.
const authoring = createRequire(resolve(root, "../agents/package.json"));
packages.push(dirname(authoring.resolve("@ai-sdk/harness-opencode/package.json")));
// The same for the other patched adapters: FX, and the ACP bridge that Grok Build runs
packages.push(dirname(authoring.resolve("@ai-sdk/harness-fx/package.json")));
packages.push(dirname(createRequire(authoring.resolve("@ai-sdk/harness-grok-build/package.json")).resolve("@ai-sdk/harness-acp/package.json")));
const dependencies = { ...manifest.dependencies };
const bundledDependencies = [];

try {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const file of manifest.files) {
    if (existsSync(resolve(root, file))) cpSync(resolve(root, file), resolve(destination, file), { recursive: true });
  }
  for (const directory of packages) {
    const pkg = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
    bundledDependencies.push(pkg.name);
    dependencies[pkg.name] = pkg.version;
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      if (version.startsWith("workspace:")) continue;
      // An exact pin satisfies a caret range on the same version; keep the pin
      const current = dependencies[name];
      if (current === version || current === version.replace(/^\^/u, "")) continue;
      assert.ok(!current || current === `^${version}`, `Conflicting runtime dependency: ${name}`);
      dependencies[name] = version;
    }
    const packed = JSON.parse(execFileSync("pnpm", ["pack", "--json", "--pack-destination", scratch], {
      cwd: directory, encoding: "utf8",
    }));
    const target = resolve(destination, "node_modules", pkg.name);
    mkdirSync(target, { recursive: true });
    execFileSync("tar", ["-xzf", packed.filename, "--strip-components=1", "-C", target]);
  }
  writeFileSync(resolve(destination, "package.json"), `${JSON.stringify({
    ...manifest,
    dependencies,
    bundledDependencies,
    scripts: undefined,
    devDependencies: undefined,
    publishConfig: { access: "public" },
  }, null, 2)}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
