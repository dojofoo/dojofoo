import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { ensureCourseContent } from "@dojofoo/config";
import { parse as parseYaml } from "yaml";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

const context = vi.hoisted(() => ({ root: "", trialRoots: [] as string[] }));

vi.mock("@dojofoo/config/local-state", () => ({
  observeLocalContext: (root: string) => {
    context.trialRoots.push(root);
    return { workspaceId: "trial-workspace" };
  },
}));

const { createAuthoringRoutes } = await import("./routes");
const evaluate = vi.fn<typeof import("../evaluation/host").evaluateFromAuthoring>();
const teachingPolicy = vi.fn((mode: string) => `Teach ${mode}`);
const authoringRoutes = createAuthoringRoutes({
  evaluate,
  teachingPolicy,
  resolveWorkspace: () => context.root,
});
const repository = resolve(import.meta.dirname, "../../../..");

describe("authoring routes", () => {
  it("adds and renames chapters in the same course and scopes new lessons to their chapter", async () => {
    const created = await authoringRoutes.request("/chapters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Advanced" }) });
    expect(created.status, await created.clone().text()).toBe(201);
    const body = await created.json();
    expect(body.workspace.chapters.map((chapter: { title: string }) => chapter.title)).toEqual(["Default", "Advanced"]);
    const renamed = await authoringRoutes.request("/chapters/default", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Foundations" }) });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).chapters[0].title).toBe("Foundations");
    const lesson = await authoringRoutes.request("/lessons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Advanced lesson", chapterId: body.chapterId }) });
    expect(lesson.status).toBe(201);
    const result = await lesson.json();
    expect(result.workspace.lessons.find((item: { id: string }) => item.id === result.lessonId).chapter.id).toBe(body.chapterId);
    const invalid = await authoringRoutes.request("/chapters/missing", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Missing" }) });
    expect(invalid.status).toBe(422);
  });

  it("requires the course README and chapter/lesson introductions before evaluation", async () => {
    authorLesson();
    rmSync(resolve(context.root, "src/001-draw-a-boundary/INTRO.md"));
    const draft = await (await authoringRoutes.request("/draft")).json();
    expect(draft.lessons[0].checks.find((check: { id: string }) => check.id === "intro").ready).toBe(false);
    expect(draft.issues.join("\n")).toContain("lesson introduction");
    const run = await authoringRoutes.request("/evals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonIds: ["001-draw-a-boundary"], callId: "missing-intro" }) });
    expect(run.status).toBe(409);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("updates card color through the course API and rejects invalid colors", async () => {
    const response = await authoringRoutes.request("/course", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ appearance: { color: "#3677C980" } }) });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ appearance: { color: "#3677C980" } });
    const invalid = await authoringRoutes.request("/course", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ appearance: { color: "not-a-color" } }) });
    expect(invalid.status).toBe(422);
  });

  it("reports the exact missing manifest after a workspace disappears", async () => {
    const manifestPath = resolve(context.root, "dojo.yaml");
    const manifest = readFileSync(manifestPath, "utf8");
    rmSync(manifestPath);

    const response = await authoringRoutes.request("/draft");
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain(manifestPath);
    expect(existsSync(manifestPath)).toBe(false);

    writeFileSync(manifestPath, manifest);
    const recovered = await authoringRoutes.request("/draft");
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).root).toBe(context.root);
  });

  it.each([
    ["/files/DOJO.md", "PUT", { content: "# Updated teaching guidance" }, 200],
    ["/course", "PATCH", { title: "Updated course" }, 200],
    ["/lessons", "POST", { title: "Another lesson" }, 201],
    ["/lessons/001-draw-a-boundary", "PATCH", { title: "Updated lesson" }, 200],
  ])("edits %s and returns the draft", async (path, method, body, status) => {
    authorLesson();
    const response = await authoringRoutes.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(status);
    const result = await response.json();
    const draft = result.workspace ?? result;
    expect(draft.root).toBe(context.root);
  });

  it("reads draft files", async () => {
    const response = await authoringRoutes.request("/draft");
    expect(response.status).toBe(200);
    const draft = await response.json();
    expect(draft.root).toBe(context.root);
    expect(draft.rootFiles.length).toBeGreaterThan(0);
  });

  beforeEach(() => {
    teachingPolicy.mockReset().mockImplementation(mode => `Teach ${mode}`);
    evaluate.mockReset();
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-"));
    context.root = root;
    context.trialRoots = [];
    onTestFinished(() => {
      for (const trial of context.trialRoots) rmSync(trial, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    });
    cpSync(resolve(repository, "packages/authoring/templates/katas"), context.root, {
      recursive: true,
      filter: (source) => !source.includes("/.dojo/")
        && !source.endsWith("/node_modules")
        && !source.includes("/node_modules/"),
    });
    const installed = resolve(repository, "packages/authoring/templates/katas/node_modules");
    if (existsSync(installed)) {
      symlinkSync(installed, resolve(context.root, "node_modules"), "dir");
    }
  });

  it("projects an empty folder without inventing course material", async () => {
    mkdirSync(resolve(context.root, "evals/lessons"), { recursive: true });
    writeFileSync(resolve(context.root, "evals/lessons/legacy.json"), "{}\n");
    const initial = await authoringRoutes.request("/draft");
    expect(initial.status).toBe(200);
    const projected = await initial.json();
    expect(projected).toMatchObject({
      lessons: [],
      issues: expect.arrayContaining(['"description" must not be empty']),
    });
    expect(projected.courseChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "intent", ready: false }),
      expect.objectContaining({ id: "curriculum", ready: false }),
    ]));
    expect(readFileSync(resolve(context.root, "DOJO.md"), "utf8")).toBe("# Course guidance\n\n");
    expect(projected.rootFiles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "evals/lessons/legacy.json" }),
    ]));

    authorLesson();
    const authored = await authoringRoutes.request("/draft");
    await expect(authored.json()).resolves.toMatchObject({
      lessons: [{
        id: "001-draw-a-boundary",
        hasSensei: true,
        evalPaths: ["src/001-draw-a-boundary/eval.yaml"],
      }],
      issues: [],
    });
  });

  it("rejects evaluations with an actionable readiness response", async () => {
    const response = await authoringRoutes.request("/evals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonIds: ["001-draw-a-boundary"], callId: "ui-not-ready" }),
    });
    expect(response.status).toBe(409);
    const result = await response.json();
    expect(result).toMatchObject({
      error: "The draft is not ready to evaluate.",
    });
    expect(result.missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "intent", ready: false }),
      expect.objectContaining({ id: "curriculum", ready: false }),
    ]));
  });

  it("reads the latest shared report, including reports produced by Kyoshi's tool", async () => {
    for (const [name, startedAt, status] of [["run-old", "2026-10-07T10:00:00Z", "passed"], ["run-new", "2026-10-07T11:00:00Z", "teaching-failed"]]) {
      const directory = resolve(context.root, ".dojo/evaluations", name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, "report.json"), JSON.stringify({ version: 1, startedAt, status }));
    }
    const response = await authoringRoutes.request("/report");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ report: { status: "teaching-failed" } });
  });

  it("returns only reports covering the requested lesson, not the newest unrelated run", async () => {
    for (const [name, lessonId, startedAt] of [["run-first", "first", "2026-10-07"], ["run-second", "second", "2026-10-08"]]) {
      const directory = resolve(context.root, ".dojo/evaluations", name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, "report.json"), JSON.stringify({ version: 1, startedAt, status: "running", lessonIds: [lessonId] }));
    }
    const response = await authoringRoutes.request("/report?lessonId=first");
    await expect(response.json()).resolves.toMatchObject({ report: { lessonIds: ["first"] } });
    const missing = await authoringRoutes.request("/report?lessonId=untested");
    await expect(missing.json()).resolves.toMatchObject({ report: null });
  });

  it("does not advertise a continuity trial as a fresh evaluation of its prerequisite", async () => {
    for (const [name, lessonIds, startedAt] of [
      ["run-first", ["first"], "2026-10-07"],
      ["run-continuity", ["first", "second"], "2026-10-08"],
    ] as const) {
      const directory = resolve(context.root, ".dojo/evaluations", name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, "report.json"), JSON.stringify({ version: 1, startedAt, status: "running", lessonIds }));
    }
    expect((await (await authoringRoutes.request("/report?lessonId=first")).json()).report.lessonIds).toEqual(["first"]);
    expect((await (await authoringRoutes.request("/report?lessonId=second")).json()).report.lessonIds).toEqual(["first", "second"]);
    rmSync(resolve(context.root, ".dojo/evaluations/run-first"), { recursive: true });
    expect((await (await authoringRoutes.request("/report?lessonId=first")).json()).report).toBeNull();
  });

  it("marks a completed report stale once its evaluated lesson changes", async () => {
    writeFileSync(resolve(context.root, "dojo.yaml"), "katas:\n  - name: first\n    template: src/first/solution.ts\n");
    mkdirSync(resolve(context.root, "src/first"), { recursive: true });
    writeFileSync(resolve(context.root, "src/first/SENSEI.md"), "# First\n");
    const { materialHash, readLessonMaterial } = await import("../evaluation/material.ts");
    const directory = resolve(context.root, ".dojo/evaluations/run-passed");
    mkdirSync(directory, { recursive: true });
    const panel = ["a", "b"].map(judge => ({ judge, verdict: { overall: "pass", criteria: [{ id: "engagement", pass: true }] } }));
    const report = { version: 1, startedAt: "2026-10-08T10:00:00Z", status: "passed", lessonIds: ["first"], material: panel, teaching: panel,
      teachingPolicyHash: createHash("sha256").update("Teach katas").digest("hex"),
      materialHash: materialHash(await readLessonMaterial(context.root, ["first"])) };
    writeFileSync(resolve(directory, "report.json"), JSON.stringify(report));
    const read = async () => (await (await authoringRoutes.request("/report")).json()).report.status;
    expect(await read()).toBe("passed");
    writeFileSync(resolve(context.root, "src/first/SENSEI.md"), "# First, edited\n");
    expect(await read()).toBe("stale");
    // Viewing a stale result must not rewrite historical evidence.
    expect(JSON.parse(readFileSync(resolve(directory, "report.json"), "utf8")).status).toBe("passed");
    writeFileSync(resolve(context.root, "src/first/SENSEI.md"), "# First\n");
    expect(await read()).toBe("passed");
    writeFileSync(resolve(context.root, "DOJO.md"), "# Changed shared guidance");
    expect(await read()).toBe("stale");
    rmSync(resolve(context.root, "src/first"), { recursive: true });
    expect(await read()).toBe("stale");
  });

  it("invalidates changed or unrecorded teaching policy without rewriting the saved verdict", async () => {
    const directory = resolve(context.root, ".dojo/evaluations/run-policy");
    mkdirSync(directory, { recursive: true });
    const panel = ["a", "b"].map(judge => ({ judge, verdict: { overall: "pass", criteria: [{ id: "engagement", pass: true }] } }));
    const report = { version: 1, startedAt: "2026-10-08T10:00:00Z", status: "passed", material: panel, teaching: panel,
      teachingPolicyHash: createHash("sha256").update("Teach katas").digest("hex") };
    const path = resolve(directory, "report.json");
    const saved = JSON.stringify(report);
    writeFileSync(path, saved);
    const read = async () => (await (await authoringRoutes.request("/report")).json()).report;
    expect((await read()).status).toBe("passed");
    expect(teachingPolicy).toHaveBeenCalledWith("katas");
    teachingPolicy.mockReturnValue("Changed hidden check instructions");
    expect(await read()).toMatchObject({ status: "stale", error: expect.stringContaining("teaching instructions") });
    expect(readFileSync(path, "utf8")).toBe(saved);
    teachingPolicy.mockReturnValue("Teach katas");
    expect((await read()).status).toBe("passed");
    const { teachingPolicyHash: _, ...legacy } = report;
    writeFileSync(path, JSON.stringify(legacy));
    expect((await read()).status).toBe("stale");
    expect(JSON.parse(readFileSync(path, "utf8")).status).toBe("passed");
  });

  it("does not reuse a historical pass that discarded one judge's failure", async () => {
    const directory = resolve(context.root, ".dojo/evaluations/run-split");
    mkdirSync(directory, { recursive: true });
    const material = ["a", "b"].map(judge => ({ judge, verdict: { overall: "pass", criteria: [{ id: "engagement", pass: true }] } }));
    const teaching = material.map((judge, index) => index ? judge : { ...judge, verdict: { overall: "fail", criteria: [{ id: "engagement", pass: false }] } });
    const report = { version: 1, startedAt: "2026-10-08T10:00:00Z", status: "passed", lessonIds: ["first"], material, teaching };
    writeFileSync(resolve(directory, "report.json"), JSON.stringify(report));
    const response = await authoringRoutes.request("/report?lessonId=first");
    expect((await response.json()).report.status).toBe("stale");
    expect(JSON.parse(readFileSync(resolve(directory, "report.json"), "utf8")).status).toBe("passed");
  });

  it("uses the shared host evaluator and creates an isolated learner trial", async () => {
    authorLesson();
    evaluate.mockResolvedValueOnce({ attempt: 1, remaining: 2, report: {
      version: 1, directory: "/evidence", materialHash: "hash", lessonIds: ["001-draw-a-boundary"],
      status: "teaching-failed", stage: "teaching", startedAt: "start", completedAt: "end",
    } });

    const run = await authoringRoutes.request("/evals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonIds: ["001-draw-a-boundary"], callId: "ui-evaluation-1" }),
    });
    expect(run.status).toBe(200);
    await expect(run.json()).resolves.toMatchObject({
      remaining: 2, report: { status: "teaching-failed", stage: "teaching" },
    });
    expect(evaluate).toHaveBeenLastCalledWith(expect.objectContaining({ root: context.root, lessonIds: ["001-draw-a-boundary"], callId: "ui-evaluation-1" }));

    const trial = await authoringRoutes.request(
      "/lessons/001-draw-a-boundary/trials",
      { method: "POST" }
    );
    expect(trial.status).toBe(201);
    await expect(trial.json()).resolves.toEqual({
      workspaceId: "trial-workspace",
      courseId: "systems-thinking",
      lessonId: "001-draw-a-boundary",
    });
  });

  it("trials authored files without copying Kyoshi runtime or repository state", async () => {
    authorLesson();
    mkdirSync(resolve(context.root, ".dojo"), { recursive: true });
    writeFileSync(resolve(context.root, ".dojo/runtimes.json"), JSON.stringify({ agent: "codex" }));
    for (const directory of [".dojo/kyoshi-app", ".dojo/kyoshi-harness", ".git"]) {
      mkdirSync(resolve(context.root, directory), { recursive: true });
      writeFileSync(resolve(context.root, directory, "private-state"), "not lesson content");
    }
    symlinkSync(context.root, resolve(context.root, ".dojo/kyoshi-harness/course"), "dir");
    for (const path of [".env", ".npmrc", "src/001-draw-a-boundary/.env.local"]) {
      writeFileSync(resolve(context.root, path), "PRIVATE_TOKEN=do-not-copy");
    }
    writeFileSync(resolve(context.root, ".env.example"), "PUBLIC_EXAMPLE=\n");
    writeFileSync(resolve(context.root, ".gitignore"), ".env\n.env.*\n!.env.example\n.npmrc\n.dojo/*\n!.dojo/sensei/\n");
    const original = readFileSync(resolve(context.root, "src/001-draw-a-boundary/solution.ts"), "utf8");
    const response = await authoringRoutes.request("/lessons/001-draw-a-boundary/trials", { method: "POST" });
    expect(response.status).toBe(201);
    const trial = context.trialRoots.at(-1)!;
    expect(trial.startsWith(`${context.root}/`)).toBe(false);
    expect(existsSync(resolve(context.root, ".dojo/state/trials"))).toBe(false);
    expect(JSON.parse(readFileSync(resolve(trial, ".dojo/runtimes.json"), "utf8"))).toEqual({ agent: "codex" });
    const copied = resolve(trial, "courses/systems-thinking");
    for (const directory of [".dojo/kyoshi-app", ".dojo/kyoshi-harness", ".dojo/runtimes.json", ".git", "node_modules", ".env", ".npmrc", "src/001-draw-a-boundary/.env.local"]) {
      expect(existsSync(resolve(copied, directory)), directory).toBe(false);
    }
    expect(readFileSync(resolve(copied, ".env.example"), "utf8")).toBe("PUBLIC_EXAMPLE=\n");
    const learnerFile = resolve(copied, "src/001-draw-a-boundary/solution.ts");
    expect(readFileSync(learnerFile, "utf8")).toBe(original);
    writeFileSync(learnerFile, "// learner edits stay in the trial\n");
    expect(readFileSync(resolve(context.root, "src/001-draw-a-boundary/solution.ts"), "utf8")).toBe(original);
  });

  it("edits only supported authoring files and projects the saved content", async () => {
    const save = await authoringRoutes.request("/files/DOJO.md", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "# Course intent\n\nTeach through comparison." }),
    });
    expect(save.status).toBe(200);
    await expect(save.json()).resolves.toMatchObject({
      courseGuidance: "# Course intent\n\nTeach through comparison.\n",
    });

    const read = await authoringRoutes.request("/files/DOJO.md");
    await expect(read.json()).resolves.toEqual({
      path: "DOJO.md",
      content: "# Course intent\n\nTeach through comparison.\n",
    });

    const packageManifest = '{"name":"authored-course","private":true}';
    const savePackage = await authoringRoutes.request("/files/package.json", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: packageManifest }),
    });
    expect(savePackage.status).toBe(200);
    expect(readFileSync(resolve(context.root, "package.json"), "utf8"))
      .toBe(`${packageManifest}\n`);

    const traversal = await authoringRoutes.request("/files/../secrets", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "no" }),
    });
    expect(traversal.status).not.toBe(200);
  });

  it("adds a lesson and edits its display title without renaming its source paths", async () => {
    const created = await authoringRoutes.request("/lessons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Normalize a Handle" }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      lessonId: "001-normalize-a-handle",
      workspace: {
        lessons: [{
          id: "001-normalize-a-handle",
          title: "Normalize a Handle",
        }],
      },
    });
    expect(existsSync(resolve(context.root, "src/001-normalize-a-handle/KATA.md"))).toBe(false);
    expect(existsSync(resolve(context.root, "src/001-normalize-a-handle/SENSEI.md"))).toBe(true);
    expect(existsSync(resolve(context.root, "src/001-normalize-a-handle/kata.ts"))).toBe(true);
    expect(existsSync(resolve(context.root, "src/001-normalize-a-handle/kata.test.ts"))).toBe(true);
    expect(existsSync(resolve(context.root, "src/001-normalize-a-handle/solution.ts"))).toBe(false);
    expect(existsSync(resolve(context.root, "src/001-normalize-a-handle/eval.yaml"))).toBe(false);

    const renamed = await authoringRoutes.request(
      "/lessons/001-normalize-a-handle",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Canonical Handles" }),
      }
    );
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toMatchObject({
      lessons: [{
        id: "001-normalize-a-handle",
        title: "Canonical Handles",
        senseiPath: "src/001-normalize-a-handle/SENSEI.md",
      }],
    });
  });

  it("summarizes each lesson's evaluation status for the sidebar", async () => {
    authorLesson();
    const created = await (await authoringRoutes.request("/lessons", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Second" }),
    })).json();
    const response = await authoringRoutes.request("/reports");
    expect(response.status).toBe(200);
    expect((await response.json()).statuses).toEqual({ "001-draw-a-boundary": "ready", [created.lessonId]: "draft" });
  });

  it("creates a trial using a new lesson's manifest-selected kata filename", async () => {
    authorLesson();
    const response = await authoringRoutes.request("/lessons", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "New kata" }),
    });
    const created = await response.json();
    const lesson = created.workspace.lessons.find((entry: { id: string }) => entry.id === created.lessonId);
    expect(lesson.templatePath).toBe(`src/${created.lessonId}/kata.ts`);
    expect(lesson.testPath).toBe(`src/${created.lessonId}/kata.test.ts`);
    // A new lesson starts with its basic evals in place, failing until filled in.
    expect(lesson.checks.find((check: { id: string }) => check.id === "scaffold")).toMatchObject({ ready: false, findings: [expect.stringContaining("todo")] });
    const trial = await authoringRoutes.request(`/lessons/${created.lessonId}/trials`, { method: "POST" });
    expect(trial.status).toBe(201);
    expect(existsSync(resolve(context.trialRoots.at(-1)!, "courses/systems-thinking/src", created.lessonId, "kata.ts"))).toBe(true);
  });

  it("edits the course title in dojo.yaml", async () => {
    const renamed = await authoringRoutes.request("/course", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Reliable Systems" }),
    });
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toMatchObject({ name: "Reliable Systems" });
    expect(readFileSync(resolve(context.root, "dojo.yaml"), "utf8"))
      .toContain("name: Reliable Systems");
  });

  function authorLesson() {
    writeFileSync(resolve(context.root, "dojo.yaml"), `mode: katas
name: systems-thinking
version: 0.0.1
description: Reason about systems.
language: TypeScript
test: pnpm test
katas:
  - name: 001-draw-a-boundary
    template: src/001-draw-a-boundary/solution.ts
    test: src/001-draw-a-boundary/solution.test.ts
    description: Draw a useful system boundary.
    difficulty: 1
`);
    const lessonRoot = resolve(context.root, "src/001-draw-a-boundary");
    mkdirSync(lessonRoot, { recursive: true });
    writeFileSync(resolve(context.root, "DOJO.md"), "# Systems thinking\n\nTeach observable boundary decisions.\n");
    writeFileSync(resolve(lessonRoot, "SENSEI.md"), "# Draw a Boundary\n\nHelp the learner compare what is inside and outside.\n\n## Start\n\n- **Hook:** h\n- **Builds on:** b\n- **First move:** f\n\n## Teach\n\n## Stumbling points\n\n## Evidence\n\n## Review\n\n- **Boundary:** b\n- **Predict:** p\n");
    writeFileSync(resolve(lessonRoot, "solution.ts"), "");
    writeFileSync(resolve(lessonRoot, "solution.test.ts"), 'it("draws a boundary", () => {});');
    writeFileSync(resolve(lessonRoot, "eval.yaml"), `cases:
  - id: introduction
    prompt: Begin the lesson.
    fixture: Let us compare what sits inside and outside this system.
    assertions:
      - type: includes
        value: inside and outside
`);
    ensureCourseContent(context.root, parseYaml(readFileSync(resolve(context.root, "dojo.yaml"), "utf8")));
  }
});
