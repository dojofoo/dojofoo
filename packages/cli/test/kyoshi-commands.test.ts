import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { scaffoldAuthoringWorkspace } from "@dojofoo/agents/scaffold";
import { readAuthoringDraft } from "@dojofoo/agents/service";
import { execFileSync } from "node:child_process";
import { bootstrapMise } from "../src/mise-bootstrap";
import { ui } from "../src/commands/ui";
import { kyoshi } from "../src/commands/kyoshi";
import { writeEvaluationSettings } from "@dojofoo/agents/evaluation/settings";
import { listWorkspaces } from "@dojofoo/config/local-state";
import { realpathSync } from "node:fs";

vi.mock("../src/commands/ui", () => ({ ui: vi.fn() }));
vi.mock("../src/mise-bootstrap", () => ({ bootstrapMise: vi.fn(async () => "/managed/mise") }));
vi.mock("node:child_process", async importOriginal => ({ ...await importOriginal<typeof import("node:child_process")>(), execFileSync: vi.fn() }));

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dojo-kyoshi-command-"));
  scaffoldAuthoringWorkspace({ root, style: "katas", name: "Commands" });
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); vi.clearAllMocks(); });

it("discovers commands without opening a session or installing tools", async () => {
  await kyoshi(root, ["--help"]);
  expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining("inspect"));
  expect(process.stdout.write).not.toHaveBeenCalledWith(expect.stringContaining("evaluate"));
  expect(ui).not.toHaveBeenCalled();
  expect(bootstrapMise).not.toHaveBeenCalled();
});

it.each(["lesson", "setup", "check", "inspect"])("%s help never mutates the course or starts work", async action => {
  await kyoshi(root, [action, "--help"]);
  expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  expect(readAuthoringDraft(root).lessons).toEqual([]);
  expect(ui).not.toHaveBeenCalled();
  expect(bootstrapMise).not.toHaveBeenCalled();
  expect(execFileSync).not.toHaveBeenCalled();
});

it("rejects unknown lesson flags instead of creating a lesson named after them", async () => {
  await expect(kyoshi(root, ["lesson", "--unknown"])).rejects.toThrow("Usage:");
  expect(readAuthoringDraft(root).lessons).toEqual([]);
});

it("adds one lesson and inspects the same course without starting an agent", async () => {
  await kyoshi(root, ["lesson", "Array", "boundaries"]);
  await kyoshi(root, ["inspect"]);
  const draft = readAuthoringDraft(root);
  expect(draft.lessons).toHaveLength(1);
  expect(draft.lessons[0].templatePath).toMatch(/\/kata\.ts$/);
  expect(process.stdout.write).toHaveBeenLastCalledWith(`${JSON.stringify({ ...draft, evaluation: null })}\n`);
  expect(ui).not.toHaveBeenCalled();
});

it("exposes only evaluation consent to the agent, not worker paths or credentials", async () => {
  await writeEvaluationSettings(root, { enabled: true, teacher: { harness: "codex", model: "gpt-6-astra" } });
  await kyoshi(root, ["inspect"]);
  const output = vi.mocked(process.stdout.write).mock.calls.at(-1)?.[0];
  expect(JSON.parse(String(output)).evaluation).toEqual({ enabled: true });
  expect(output).not.toContain("workerPath");
});

for (const task of ["setup", "check"]) {
  it(`runs ${task} through mise in the course, never the user's pnpm`, async () => {
    await kyoshi(root, [task]);
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith("/managed/mise", ["run", task], { cwd: root, stdio: "inherit" });
    expect(ui).not.toHaveBeenCalled();
  });
}

it("kyoshi evaluate is an unknown command", async () => {
  await expect(kyoshi(root, ["evaluate", "001-first"])).rejects.toThrow("Unknown Kyoshi command: evaluate. Use inspect, lesson, setup, check, or no subcommand to open authoring.");
  expect(ui).not.toHaveBeenCalled();
});

it("rejects a misspelled command instead of silently scaffolding", async () => {
  await expect(kyoshi(root, ["evalute"])).rejects.toThrow("Unknown Kyoshi command");
  expect(ui).not.toHaveBeenCalled();
  expect(readAuthoringDraft(root).lessons).toEqual([]);
});

it("opening authoring registers the folder as a draft workspace", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "dojo-kyoshi-command-home-"));
  vi.stubEnv("DOJOFOO_HOME", stateHome);
  try {
    await kyoshi(root, ["--style", "katas"]);
    expect(ui).toHaveBeenCalledWith(root, ["--authoring"]);
    expect(listWorkspaces({ stateHome }).map(({ path, kind }) => ({ path: realpathSync(path), kind })))
      .toEqual([{ path: realpathSync(root), kind: "draft" }]);
  } finally {
    vi.unstubAllEnvs();
    rmSync(stateHome, { recursive: true, force: true });
  }
});
