import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFileGuard, withPathLock, writeFileAtomic } from "../src/file-guard.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup(content: string | null = "export const answer = 0;\n") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-guard-")));
  roots.push(root);
  const file = join(root, "course", "solution.ts");
  if (content !== null) await writeFileAtomic(file, content);
  return { root, file, guard: createFileGuard(join(root, "store")) };
}

describe("file guard", () => {
  it("restores a changed file and quarantines the other version", async () => {
    const { file, guard } = await setup();
    const window = await guard.open("eve-1", file, { lessonId: "first" });
    await writeFile(file, "native write\n");
    const verdict = await guard.verify(window.id);
    expect(verdict).toMatchObject({ action: "restored", window: { owner: "eve-1", meta: { lessonId: "first" } } });
    expect(await readFile(file, "utf8")).toBe("export const answer = 0;\n");
    expect(await readFile(verdict!.quarantined!, "utf8")).toBe("native write\n");
    expect(await guard.list()).toEqual([]);
  });

  it("recreates a deleted file", async () => {
    const { file, guard } = await setup();
    const window = await guard.open("eve-1", file);
    await rm(file);
    const verdict = await guard.verify(window.id);
    expect(verdict).toMatchObject({ action: "recreated" });
    expect(verdict!.quarantined).toBeUndefined();
    expect(await readFile(file, "utf8")).toBe("export const answer = 0;\n");
  });

  it("removes a created file when none existed", async () => {
    const { root, guard } = await setup(null);
    const created = join(root, "course", "created.ts");
    const window = await guard.open("eve-1", created);
    await writeFileAtomic(created, "created natively\n");
    const verdict = await guard.verify(window.id);
    expect(verdict).toMatchObject({ action: "removed" });
    expect(existsSync(created)).toBe(false);
    expect(await readFile(verdict!.quarantined!, "utf8")).toBe("created natively\n");
  });

  it("a write through update while the window is open is kept", async () => {
    const { file, guard } = await setup();
    const window = await guard.open("eve-1", file);
    expect((await guard.open("eve-1", file)).id).toBe(window.id);
    await withPathLock(file, async () => {
      await writeFileAtomic(file, "learner save\n");
      await guard.update(file, "learner save\n");
    });
    expect(await guard.verify(window.id)).toMatchObject({ action: "unchanged" });
    expect(await readFile(file, "utf8")).toBe("learner save\n");
  });

  it("a crash between the copy and the record leaves no window", async () => {
    const { root, guard } = await setup();
    await writeFileAtomic(join(root, "store", "windows", "orphan.copy"), "copy only\n");
    expect(await guard.list()).toEqual([]);
    expect(await guard.find("eve-1")).toBeUndefined();
    expect(await guard.verify("orphan")).toBeUndefined();
  });

  it("verify of a closed window is a no-op", async () => {
    const { file, guard } = await setup();
    const window = await guard.open("eve-1", file);
    expect(await guard.verify(window.id)).toMatchObject({ action: "unchanged" });
    await writeFile(file, "after the close\n");
    expect(await guard.verify(window.id)).toBeUndefined();
    expect(await readFile(file, "utf8")).toBe("after the close\n");
    const discarded = await guard.open("eve-2", file);
    await guard.discard(discarded.id);
    expect(await guard.verify(discarded.id)).toBeUndefined();
  });

  it("one quarantine per path, replaced by the next violation", async () => {
    const { root, file, guard } = await setup();
    const first = await guard.open("eve-1", file);
    await writeFile(file, "first violation\n");
    const one = await guard.verify(first.id);
    const second = await guard.open("eve-1", file);
    await writeFile(file, "second violation\n");
    const two = await guard.verify(second.id);
    expect(two!.quarantined).toBe(one!.quarantined);
    expect(await readFile(two!.quarantined!, "utf8")).toBe("second violation\n");
    expect((await readdir(join(root, "store", "quarantine"))).sort()).toHaveLength(2);
    expect(JSON.parse(await readFile(`${two!.quarantined}.json`, "utf8"))).toMatchObject({ path: file });
  });

  it("writes go through a temp file and rename", async () => {
    const { root, file } = await setup();
    const before = await stat(file);
    await writeFileAtomic(file, "renamed into place\n");
    expect((await stat(file)).ino).not.toBe(before.ino);
    expect(await readFile(file, "utf8")).toBe("renamed into place\n");
    expect((await readdir(join(root, "course"))).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
});
