import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JustBashSandbox } from "@dojofoo/harness/sandbox/just-bash";

const eveRoot = new URL("./", import.meta.resolve("@dojofoo/harness/eve/package.json"));
const { getSandboxEnvironmentRuntime } = await import(new URL("dist/src/shared/sandbox-environment.js", eveRoot));
// 1.0 providers return a byte-level connection; Eve derives the session from it.
const { createConnectionSession } = await import(new URL("dist/src/execution/sandbox/session.js", eveRoot));

test("packaged Eve filesystem edits live course files and reopens private state without installation", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-packaged-filesystem-"));
  const course = join(root, "course");
  let connection;
  try {
    await mkdir(course);
    await writeFile(join(course, "DOJO.md"), "Original course");
    const environment = JustBashSandbox.environment({
      autoInstall: false,
      experimental: {
        filesystem: ({ defaultFilesystem, justBash }) => new justBash.MountableFs({
          base: defaultFilesystem,
          mounts: [{ mountPoint: "/course", filesystem: new justBash.ReadWriteFs({ root: course }) }],
        }),
      },
    });
    const backend = getSandboxEnvironmentRuntime(environment).implementation;
    const resolveProjectPath = path => join(root, path);
    const storagePath = join(root, "state");
    await mkdir(storagePath);
    const artifact = await backend.prepare({
      files: { list: async () => [], read: async () => { throw new Error("Unexpected source read"); } },
      isEmpty: true, storagePath, resolveProjectPath, log() {}, populate: async () => {},
      resourcesDirectory: async () => undefined,
      templateKey: identity => createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
    });
    const context = { kind: "session", resolveProjectPath, storagePath, session: { id: "author" } };
    const started = await backend.start(context, undefined, artifact);
    connection = started.connection;
    let sandbox = createConnectionSession(connection);
    assert.equal(await sandbox.readTextFile({ path: "/course/DOJO.md" }), "Original course");
    await sandbox.writeTextFile({ path: "/course/DOJO.md", content: "Authored course" });
    assert.equal(await readFile(join(course, "DOJO.md"), "utf8"), "Authored course");
    await writeFile(join(course, "DOJO.md"), "Human revision");
    const command = await sandbox.run({ command: "cat /course/DOJO.md" });
    assert.equal(command.exitCode, 0);
    assert.equal(command.stdout, "Human revision");
    await sandbox.writeTextFile({ path: "/workspace/private.md", content: "Retained draft" });
    await connection.stop();
    connection = await backend.resume(context, artifact, started.state);
    sandbox = createConnectionSession(connection);
    assert.equal(await sandbox.readTextFile({ path: "/workspace/private.md" }), "Retained draft");
    await assert.rejects(readFile(join(course, "private.md")), { code: "ENOENT" });
  } finally {
    await connection?.stop();
    await rm(root, { recursive: true, force: true });
  }
});
