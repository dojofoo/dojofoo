import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { expect, it, onTestFinished, vi } from "vitest";
import { listWorkspaces } from "@dojofoo/config/local-state";
import { scaffoldAuthoringWorkspace } from "../scaffold";
import { createAuthoringLesson, createLessonTrial, readAuthoringDraft } from "./service";
import { dojoDir, readDojoRc, readCatalog, resolveAllKatas } from "@dojofoo/config";

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "dojo-trial-safety-"));
  const course = resolve(directory, "course");
  vi.stubEnv("DOJOFOO_HOME", resolve(directory, "state"));
  vi.stubEnv("TMPDIR", directory);
  onTestFinished(() => {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  scaffoldAuthoringWorkspace({ root: course, name: "Trial safety", style: "katas" });
  const manifestPath = resolve(course, "dojo.yaml");
  const manifest = parse(readFileSync(manifestPath, "utf8"));
  manifest.description = "Practice in a separate workspace.";
  writeFileSync(manifestPath, stringify(manifest));
  const lesson = createAuthoringLesson(course, "First lesson");
  const source = `src/${lesson}/kata.ts`;
  return {
    directory, course, lesson, source,
    trial() {
      const created = createLessonTrial(course, lesson);
      const workspace = listWorkspaces().find(item => item.id === created.workspaceId)!;
      expect(dirname(workspace.path)).toBe(directory);
      expect(workspace.path.startsWith(`${course}/`)).toBe(false);
      expect(existsSync(resolve(course, ".dojo/trials"))).toBe(false);
      expect(existsSync(resolve(course, ".dojo/state/trials"))).toBe(false);
      return dojoDir(workspace.path, created.courseId);
    },
  };
}

it("uses author-owned exclusions for local configuration while retaining the portable toolchain", () => {
  const f = fixture();
  const secrets = ["mise.local.toml", ".mise.local.toml", "mise.production.local.toml",
    ".envrc", ".dev.vars", ".dev.vars.test", "signing.key", "client.pem", "client.p12", "client.pfx",
    ".ssh/id_ed25519", ".aws/credentials", ".gnupg/private-key"];
  appendFileSync(resolve(f.course, ".gitignore"), `\n${secrets.join("\n")}\n`);
  for (const path of secrets) {
    mkdirSync(dirname(resolve(f.course, path)), { recursive: true });
    writeFileSync(resolve(f.course, path), "PRIVATE_FIXTURE=do-not-copy");
  }
  const copied = f.trial();
  for (const path of secrets) expect(existsSync(resolve(copied, path)), path).toBe(false);
  expect(readFileSync(resolve(copied, "mise.toml"), "utf8"))
    .toBe(readFileSync(resolve(f.course, "mise.toml"), "utf8"));
});

it("trials a chapter lesson using the installed-course layout and keeps its Sensei definitions", () => {
  const f = fixture();
  const manifestPath = resolve(f.course, "dojo.yaml");
  const manifest = parse(readFileSync(manifestPath, "utf8"));
  delete manifest.katas;
  manifest.chapters = [{ id: "basics", title: "Basics", path: "chapters/01", lessons: [
    { id: "start", title: "Start", template: "chapters/01/lessons/01/kata.ts" },
  ] }];
  writeFileSync(manifestPath, stringify(manifest));
  const lessonPath = resolve(f.course, "chapters/01/lessons/01");
  mkdirSync(lessonPath, { recursive: true });
  writeFileSync(resolve(lessonPath, "kata.ts"), "export const start = () => 0;\n");
  writeFileSync(resolve(lessonPath, "kata.test.ts"), "// Checks\n");
  writeFileSync(resolve(lessonPath, "SENSEI.md"), "Guide the learner with a useful question.\n");
  mkdirSync(resolve(f.course, ".dojo/sensei"), { recursive: true });
  writeFileSync(resolve(f.course, ".dojo/sensei/instructions.md"), "COURSE SENSEI");
  const draft = readAuthoringDraft(f.course);
  expect(draft.lessons[0]?.senseiPath).toBe("chapters/01/lessons/01/SENSEI.md");
  const trial = createLessonTrial(f.course, "start");
  const workspace = listWorkspaces().find(item => item.id === trial.workspaceId)!;
  expect(existsSync(resolve(workspace.path, ".dojos"))).toBe(false);
  expect(existsSync(resolve(workspace.path, "katas"))).toBe(false);
  const installed = dojoDir(workspace.path, trial.courseId);
  expect(readFileSync(resolve(installed, ".dojo/sensei/instructions.md"), "utf8")).toBe("COURSE SENSEI");
  const selected = resolveAllKatas(workspace.path, readDojoRc(workspace.path), readCatalog(workspace.path, trial.courseId))[0]!;
  expect(selected.workspacePath).toBe(resolve(installed, "chapters/01/lessons/01/kata.ts"));
  writeFileSync(selected.workspacePath, "// Trial only\n");
  expect(readFileSync(resolve(lessonPath, "kata.ts"), "utf8")).toContain("export const start");
});

it("materializes an internal file link so editing the trial cannot edit the draft", () => {
  const f = fixture();
  const alias = `src/${f.lesson}/alias.ts`;
  const original = readFileSync(resolve(f.course, f.source), "utf8");
  symlinkSync(resolve(f.course, f.source), resolve(f.course, alias));
  const copied = f.trial();
  expect(lstatSync(resolve(copied, alias)).isSymbolicLink()).toBe(false);
  writeFileSync(resolve(copied, alias), "// Trial only\n");
  expect(readFileSync(resolve(f.course, f.source), "utf8")).toBe(original);
});

it.each(["external", "private"])("rejects a link to %s material", kind => {
  const f = fixture();
  const target = resolve(kind === "external" ? f.directory : f.course, ".env");
  writeFileSync(target, "PRIVATE_FIXTURE=do-not-copy");
  symlinkSync(target, resolve(f.course, `src/${f.lesson}/alias.ts`));
  expect(() => f.trial()).toThrow(/outside the course|private course state/);
  expect(readdirSync(f.directory).filter(name => name.startsWith("dojofoo-trial-"))).toEqual([]);
  expect(listWorkspaces()).toEqual([]);
  expect(readFileSync(target, "utf8")).toBe("PRIVATE_FIXTURE=do-not-copy");
});
