import { expect, it } from "vitest";
import { preservesAcceptedMaterial, restoreMaterial } from "./accepted-material";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const kata = { name: "one", template: "src/one/kata.ts" };
const before = {
  "dojo.yaml": JSON.stringify({ mode: "katas", test: "vitest", katas: [kata] }),
  "DOJO.md": "Course guidance",
  "src/one/SENSEI.md": "Lesson guidance",
};
it("allows another curriculum entry without invalidating the existing lesson", () => {
  const current = { ...before, "dojo.yaml": JSON.stringify({ mode: "katas", test: "vitest", katas: [kata, { name: "two", template: "src/two/kata.ts" }] }) };
  expect(preservesAcceptedMaterial(before, current, ["one"])).toBe(true);
});
it.each(["DOJO.md", "src/one/SENSEI.md"])("rejects changes to %s", path => {
  expect(preservesAcceptedMaterial(before, { ...before, [path]: "Changed" }, ["one"])).toBe(false);
});
it("rejects added lesson files and changed execution configuration", () => {
  expect(preservesAcceptedMaterial(before, { ...before, "src/one/helper.ts": "new" }, ["one"])).toBe(false);
  expect(preservesAcceptedMaterial(before, { ...before, "dojo.yaml": JSON.stringify({ mode: "katas", test: "different", katas: [kata] }) }, ["one"])).toBe(false);
});

it("restores a snapshot without allowing paths outside the replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-restore-test-"));
  try {
    await restoreMaterial(root, before);
    expect(await readFile(join(root, "src/one/SENSEI.md"), "utf8")).toBe("Lesson guidance");
    await expect(restoreMaterial(root, { "../outside.md": "bad" })).rejects.toThrow("escapes");
    await expect(restoreMaterial(root, { "/outside.md": "bad" })).rejects.toThrow("escapes");
  } finally { await rm(root, { recursive: true, force: true }); }
});
