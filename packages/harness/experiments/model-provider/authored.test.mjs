import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
const { compileAgent } = await import(new URL("dist/src/compiler/compile-agent.js", eveRoot));
const { loadCompiledModuleMap } = await import(new URL("dist/src/runtime/loaders/module-map.js", eveRoot));
const { resolveRuntimeModelReference } = await import(new URL("dist/src/runtime/agent/resolve-model.js", eveRoot));
const { AI_GATEWAY_MODELS_CATALOG_URL } = await import(new URL("dist/src/internal/gateway.js", eveRoot));

test("Kyoshi instructions and question tool compile with an independently supplied harness model", async () => {
  const root = await mkdtemp(join(process.cwd(), "authored-kyoshi-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "kyoshi-fixture", private: true, type: "module" }));
    await copyFile(new URL("authored-agent.fixture.ts", import.meta.url), join(root, "agent.ts"));
    await writeFile(join(root, "instructions.ts"), 'export { default } from "@dojofoo/authoring/eve/instructions";\n');
    await mkdir(join(root, "tools"));
    await writeFile(join(root, "tools/dojo_ui_ask.ts"), 'export { default } from "@dojofoo/authoring/eve/ask";\n');
    const compiled = await compileAgent({ startPath: root });
    assert.equal(compiled.metadata.status, "ready");
    assert.deepEqual(compiled.diagnostics.filter(item => item.severity === "error"), []);
    const instructions = compiled.manifest.instructions;
    const policy = await readFile(new URL(import.meta.resolve("@dojofoo/authoring/KYOSHI.md")), "utf8");
    const native = await readFile(new URL("./src/contracts/NATIVE-HARNESS.md", import.meta.resolve("@dojofoo/authoring/package.json")), "utf8");
    assert.ok(instructions.some(item => item.role === "system" && item.content.includes(policy.trim())));
    assert.ok(instructions.some(item => item.content.includes(native.trim())));
    assert.ok(compiled.manifest.tools.some(item => item.name === "dojo_ui_ask"), JSON.stringify(compiled.manifest.tools));
    assert.equal(compiled.manifest.config.model.routing.kind, "external");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("disk-authored provider survives Eve discovery, compilation and runtime model resolution", async () => {
  // Inside the isolated consumer so authored imports resolve its registry packages.
  const root = await mkdtemp(join(process.cwd(), "authored-"));
  const originalFetch = globalThis.fetch;
  const networkAttempts = [];
  globalThis.fetch = input => {
    networkAttempts.push(String(input instanceof Request ? input.url : input));
    throw new Error("Network is forbidden while loading authored configuration");
  };
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "authored-provider-fixture", private: true, type: "module" }));
    await copyFile(new URL("authored-agent.fixture.ts", import.meta.url), join(root, "agent.ts"));
    await writeFile(join(root, "instructions.md"), "Teach one concept at a time.\n");
    const compiled = await compileAgent({ startPath: root });
    assert.equal(compiled.metadata.status, "ready");
    assert.deepEqual(compiled.diagnostics.filter(item => item.severity === "error"), []);
    // 1.0 compilation snapshots the Gateway catalog as optional build metadata and
    // degrades without it; nothing else, and nothing in the authored model, reaches out.
    assert.ok(networkAttempts.every(url => url === AI_GATEWAY_MODELS_CATALOG_URL), JSON.stringify(networkAttempts));
    networkAttempts.length = 0;
    const moduleMap = await loadCompiledModuleMap({ compiledArtifactsSource: { kind: "disk", appRoot: root } });
    const reference = compiled.manifest.config.model;
    const first = await resolveRuntimeModelReference(reference, { moduleMap });
    const second = await resolveRuntimeModelReference(reference, { moduleMap });
    assert.equal(first, second, "Eve reuses the authored model instance");
    assert.equal(first.provider, "harness");
    assert.equal(first.modelId, "openai/gpt-4o");
    assert.equal(first.specificationVersion, "v4");
    assert.equal(typeof first.doStream, "function");
    assert.equal(typeof first.doGenerate, "function");
    assert.deepEqual(networkAttempts, []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
