import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { listWorkspaces, observeWorkspacePath, setWorkspaceKind } from "@dojofoo/config/local-state";
import { buildControlRoutes } from "./control/routes";
import { spawn } from "node:child_process";
import { recordProcessGroup } from "@dojofoo/agent/process-groups";
import { backfillWorkspaceKinds, startUiServer } from "./startup";

const temporaryPaths: string[] = [];
afterEach(() => { for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true }); });

it("backfills a missing kind from the dashboard's draft rule", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-startup-home-"));
  const scratch = mkdtempSync(join(tmpdir(), "dojofoo-startup-"));
  temporaryPaths.push(stateHome, scratch);
  const folder = (name: string, files: Record<string, string> = {}) => {
    const root = resolve(name.startsWith("drafts/") ? stateHome : scratch, name);
    mkdirSync(resolve(root, ".dojo"), { recursive: true });
    writeFileSync(resolve(root, "dojo.yaml"), `mode: katas\nname: ${name.replace("/", "-")}\ndescription: A course.\n`);
    for (const [path, content] of Object.entries(files)) writeFileSync(resolve(root, path), content);
    return root;
  };
  const managed = folder("drafts/course-managed");
  const legacy = folder("legacy", { ".dojo/kyoshi.json": JSON.stringify({ sessionId: "acp-1" }) });
  const recorded = folder("recorded", { ".dojo/agent-sessions.json": JSON.stringify({ sessions: [
    { id: "kyoshi-1", agent: "codex", persona: "kyoshi", createdAt: "2026-10-01T10:00:00.000Z" },
  ] }) });
  const plain = folder("plain");
  const labelled = folder("labelled", { ".dojo/kyoshi.json": "{}" });
  const ids = Object.fromEntries([managed, legacy, recorded, plain, labelled].map(root => [root, observeWorkspacePath(root, { stateHome })]));
  // Rows from before kinds existed have none; one row was already set and is left alone
  const db = new DatabaseSync(resolve(stateHome, "dojofoo.db"));
  db.exec("UPDATE workspaces SET kind = NULL");
  db.close();
  setWorkspaceKind(ids[labelled]!, "evaluation-trial", { stateHome });
  // Until the backfill runs, the listing applies the same rule
  expect((await (await buildControlRoutes({ stateHome }).request("/authoring")).json() as Array<{ workspaceId: string }>)
    .map(draft => draft.workspaceId).sort()).toEqual([ids[managed], ids[legacy], ids[recorded]].sort());

  backfillWorkspaceKinds({ stateHome });

  const kinds = Object.fromEntries(listWorkspaces({ stateHome }).map(workspace => [workspace.path, workspace.kind]));
  expect(kinds).toEqual({ [managed]: "draft", [legacy]: "draft", [recorded]: "draft", [plain]: "learner", [labelled]: "evaluation-trial" });
  expect((await (await buildControlRoutes({ stateHome }).request("/authoring")).json() as Array<{ workspaceId: string; sessionId: string | null }>)
    .find(draft => draft.workspaceId === ids[legacy])).toMatchObject({ sessionId: null });
});

it("reaps recorded process groups at startup", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-startup-reap-"));
  temporaryPaths.push(stateHome);
  const sleeper = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
  try {
    const exited = new Promise(accept => sleeper.once("exit", accept));
    const record = resolve(stateHome, "state/processes/w1.sensei.jsonl");
    for (let attempt = 0; attempt < 50 && !(await import("node:fs")).existsSync(record); attempt++) {
      recordProcessGroup(record, sleeper.pid!);
      await new Promise(accept => setTimeout(accept, 20));
    }
    startUiServer({ stateHome });
    await expect(Promise.race([exited.then(() => "exited"), new Promise(accept => setTimeout(() => accept("running"), 5_000))])).resolves.toBe("exited");
  } finally { try { process.kill(-sleeper.pid!, "SIGKILL"); } catch {} }
});
