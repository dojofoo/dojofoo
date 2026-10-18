import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JustBashSandbox } from "@dojofoo/agent/sandbox/just-bash";

const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
const { getSandboxEnvironmentRuntime } = await import(new URL("dist/src/shared/sandbox-environment.js", eveRoot));

test("packaged Eve filesystem edits live course files and reopens private state without installation", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-packaged-filesystem-"));
  const course = join(root, "course");
  let handle;
  try {
    await mkdir(course);
    await writeFile(join(course, "DOJO.md"), "Original course");
    const environment = JustBashSandbox.environment({
      autoInstall: false,
      filesystem: ({ defaultFilesystem, justBash }) => new justBash.MountableFs({
        base: defaultFilesystem,
        mounts: [{ mountPoint: "/course", filesystem: new justBash.ReadWriteFs({ root: course }) }],
      }),
    });
    const backend = getSandboxEnvironmentRuntime(environment).implementation;
    const host = { resolveProjectPath: path => join(root, path), loadOptionalPackage: ({ importModule }) => importModule() };
    const storagePath = join(root, "state");
    await mkdir(storagePath);
    const artifact = await backend.prepare({ host, storagePath, sourceRevision: "fixture", resources: { source: { kind: "none" } }, files: {
      list: async () => [], read: async () => { throw new Error("Unexpected source read"); }, readText: async () => { throw new Error("Unexpected source read"); },
    } });
    const context = { host, storagePath, session: { id: "author" } };
    const started = await backend.start(context, undefined, artifact);
    handle = started.handle;
    assert.equal(await handle.sandbox.readTextFile({ path: "/course/DOJO.md" }), "Original course");
    await handle.sandbox.writeTextFile({ path: "/course/DOJO.md", content: "Authored course" });
    assert.equal(await readFile(join(course, "DOJO.md"), "utf8"), "Authored course");
    await writeFile(join(course, "DOJO.md"), "Human revision");
    const command = await handle.sandbox.run({ command: "cat /course/DOJO.md" });
    assert.equal(command.exitCode, 0);
    assert.equal(command.stdout, "Human revision");
    await handle.sandbox.writeTextFile({ path: "/workspace/private.md", content: "Retained draft" });
    await handle.onRuntimeShutdown();
    handle = await backend.resume(context, artifact, started.state);
    assert.equal(await handle.sandbox.readTextFile({ path: "/workspace/private.md" }), "Retained draft");
    await assert.rejects(readFile(join(course, "private.md")), { code: "ENOENT" });
  } finally {
    await handle?.onRuntimeShutdown();
    await rm(root, { recursive: true, force: true });
  }
});
