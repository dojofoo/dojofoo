import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readRecords, saveRecord, updateRecord } from "./records";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const workspace = () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-records-"));
  roots.push(root);
  return root;
};
const record = (id: string) => ({ id, agent: "opencode", persona: "sensei" as const, createdAt: "2026-11-04T00:00:00.000Z", revision: 0 });

it("concurrent updates to two records in one workspace both land", async () => {
  const root = workspace();
  await Promise.all([saveRecord(root, record("a")), saveRecord(root, record("b"))]);
  await Promise.all([
    updateRecord(root, "a", current => ({ ...current, model: "openai/gpt-4o-mini", revision: current.revision + 1 })),
    updateRecord(root, "b", current => ({ ...current, lifecycle: { status: "working", updatedAt: "2026-11-04T00:00:01.000Z" } })),
    updateRecord(root, "a", current => ({ ...current, revision: current.revision + 1 })),
  ]);
  const saved = await readRecords(root);
  expect(saved.find(item => item.id === "a")).toMatchObject({ model: "openai/gpt-4o-mini", revision: 2 });
  expect(saved.find(item => item.id === "b")).toMatchObject({ lifecycle: { status: "working" } });
  expect(JSON.parse(readFileSync(join(root, ".dojo/agent-sessions.json"), "utf8")).sessions).toHaveLength(2);
});

it("a record without a revision reads as revision 0", async () => {
  const root = workspace();
  mkdirSync(join(root, ".dojo"));
  writeFileSync(join(root, ".dojo/agent-sessions.json"), JSON.stringify({ sessions: [{ id: "old", agent: "codex", persona: "kyoshi", createdAt: "2026-10-28T00:00:00.000Z" }] }));
  expect(await readRecords(root)).toEqual([{ id: "old", agent: "codex", persona: "kyoshi", createdAt: "2026-10-28T00:00:00.000Z", revision: 0 }]);
  expect(await updateRecord(root, "old", current => ({ ...current, revision: current.revision + 1 }))).toMatchObject({ revision: 1 });
});

it("an update of a missing record answers session_not_found", async () => {
  const root = workspace();
  await saveRecord(root, record("a"));
  await expect(updateRecord(root, "missing", current => current)).rejects.toMatchObject({ status: 404, code: "session_not_found" });
});
