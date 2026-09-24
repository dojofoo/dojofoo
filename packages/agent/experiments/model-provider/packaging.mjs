import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "dojo-agent-consumer-"));
const source = fileURLToPath(new URL("../../", import.meta.url));
try {
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const [packed] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", root], {
    cwd: source, encoding: "utf8",
  }));
  assert.ok(packed.files.some(file => file.path === "dist/eve/NOTICE"));
  assert.ok(packed.files.some(file => file.path === "dist/eve/bin/eve.js"));
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: {
    "@dojofoo/agent": `file:./${packed.filename}`,
    "@ai-sdk/sandbox-just-bash": manifest.devDependencies["@ai-sdk/sandbox-just-bash"],
    "ai": manifest.dependencies.ai,
    "@ai-sdk/harness": manifest.dependencies["@ai-sdk/harness"],
  } }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  assert.ok(!Object.keys(lock.packages).some(path => path.endsWith("node_modules/eve")), "Consumer must not install a separate Eve");
  const installed = JSON.parse(await readFile(join(root, "node_modules/@dojofoo/agent/package.json"), "utf8"));
  assert.equal(installed.scripts.postinstall, undefined);
  for (const file of ["provider.test.mjs", "recovery-worker.mjs", "filesystem.test.mjs", "exports.test.mjs"]) {
    await copyFile(join(source, "experiments/model-provider", file), join(root, file));
  }
  execFileSync(process.execPath, ["--test", "--test-timeout=30000", "provider.test.mjs", "filesystem.test.mjs", "exports.test.mjs"], {
    cwd: root, stdio: "inherit", env: { ...process.env, EVE_NATIVE_COMPACTION: "1" },
  });
} finally {
  await rm(root, { recursive: true, force: true });
}
