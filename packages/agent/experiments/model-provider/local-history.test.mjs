import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { preserveLegacyLocalHistory, readLegacyLocalHistory } from "@dojofoo/agent/local-history";

const fixture = JSON.parse(await readFile(new URL("./fixtures/legacy-world-v25.json", import.meta.url), "utf8"));
async function workspace(run) {
  const root = await mkdtemp(join(tmpdir(), "dojo-history-upgrade-"));
  try {
    for (const [file, content] of Object.entries(fixture.files)) {
      const target = join(root, ".eve/.workflow-data", file);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, Buffer.from(content, "base64"));
    }
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function hashes(directory) {
  const result = {};
  for (const path of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!path.isFile()) continue;
    const file = join(path.parentPath, path.name);
    result[file.slice(directory.length)] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  return result;
}

test("archives the real 0.53 store unchanged and reads its 24 events without starting Workflow", async () => {
  await workspace(async root => {
    const before = await hashes(join(root, ".eve/.workflow-data"));
    await preserveLegacyLocalHistory(root);
    assert.deepEqual(await hashes(join(root, ".eve/legacy-workflow-data")), before);
    await assert.rejects(readFile(join(root, ".eve/.workflow-data/version.txt")), { code: "ENOENT" });
    assert.deepEqual(await readLegacyLocalHistory(root, fixture.sessionId), fixture.events);
    assert.deepEqual(await hashes(join(root, ".eve/legacy-workflow-data")), before);
    await preserveLegacyLocalHistory(root); // Idempotent on later starts.
    assert.equal(await readLegacyLocalHistory(root, "../../outside"), null);
    assert.equal(await readLegacyLocalHistory(root, "wrun_missing"), null);
  });
});

test("refuses an unknown legacy format without moving or deleting it", async () => {
  await workspace(async root => {
    await writeFile(join(root, ".eve/.workflow-data/version.txt"), "unrecognized-format");
    const before = await hashes(join(root, ".eve/.workflow-data"));
    await assert.rejects(preserveLegacyLocalHistory(root), /Export its history/);
    assert.deepEqual(await hashes(join(root, ".eve/.workflow-data")), before);
  });
});

test("does not overwrite an existing archive", async () => {
  await workspace(async root => {
    await mkdir(join(root, ".eve/legacy-workflow-data"));
    const before = await hashes(join(root, ".eve/.workflow-data"));
    await assert.rejects(preserveLegacyLocalHistory(root), /archive already exists/);
    assert.deepEqual(await hashes(join(root, ".eve/.workflow-data")), before);
  });
});
