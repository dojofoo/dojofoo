import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { justbash } from "@dojofoo/agent/sandbox/just-bash";

test("packaged Eve filesystem edits live course files and reopens private state without installation", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-packaged-filesystem-"));
  const course = join(root, "course");
  let handle;
  try {
    await mkdir(course);
    await writeFile(join(course, "DOJO.md"), "Original course");
    const backend = justbash({
      autoInstall: false,
      filesystem: ({ defaultFilesystem, justBash }) => new justBash.MountableFs({
        base: defaultFilesystem,
        mounts: [{ mountPoint: "/course", filesystem: new justBash.ReadWriteFs({ root: course }) }],
      }),
    });
    const input = { templateKey: null, sessionKey: "author", runtimeContext: { appRoot: root } };
    handle = await backend.create(input);
    assert.equal(await handle.session.readTextFile({ path: "/course/DOJO.md" }), "Original course");
    await handle.session.writeTextFile({ path: "/course/DOJO.md", content: "Authored course" });
    assert.equal(await readFile(join(course, "DOJO.md"), "utf8"), "Authored course");
    await writeFile(join(course, "DOJO.md"), "Human revision");
    const command = await handle.session.run({ command: "cat /course/DOJO.md" });
    assert.equal(command.exitCode, 0);
    assert.equal(command.stdout, "Human revision");
    await handle.session.writeTextFile({ path: "/workspace/private.md", content: "Retained draft" });
    const state = await handle.captureState();
    await handle.shutdown();
    handle = await backend.create({ ...input, existingMetadata: state.metadata });
    assert.equal(await handle.session.readTextFile({ path: "/workspace/private.md" }), "Retained draft");
    await assert.rejects(readFile(join(course, "private.md")), { code: "ENOENT" });
  } finally {
    await handle?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
