import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  observeLocalContext,
} from "@dojofoo/config/local-state";
import { chapterCurriculum, courseFileFilter, courseRelativePath, createStateDirectory, kataTestTemplate, validateManifest, writeDojoRc } from "@dojofoo/config";
import { checkSensei, checkTests } from "../evaluation/preflight.ts";
import { readPrompt } from "../prompts.ts";
import {
  AUTHORING_BOOTSTRAP_MARKER,
  AUTHORING_BOOTSTRAP_PROMPT,
  messageWithAuthoringEdits,
  type AuthoringAgent,
  type AuthoringStreamPart,
  type AuthoringTranscriptMessage,
} from "./types";
import {
  acknowledgeAuthoringEdits,
  pendingAuthoringEdits,
  writeAuthoringFile,
  authoringFileFilter,
} from "./files";

const kyoshiContract = readFileSync(createRequire(import.meta.url).resolve("@dojofoo/authoring/KYOSHI.md"), "utf8");

type AuthoringThreadState = {
  version: 1;
  sessionId: string;
  harness: string;
  aliases: string[];
};

export type AuthoringLesson = {
  id: string;
  title: string;
  description: string;
  senseiPath: string;
  templatePath?: string;
  testPath?: string;
  sensei: string;
  files: AuthoringSourceFile[];
  hasSensei: boolean;
  evalPaths: string[];
  checks: AuthoringReadinessCheck[];
};

export type AuthoringSourceFile = {
  content: string;
  label: string;
  path: string;
};

export type AuthoringReadinessCheck = {
  id: string;
  label: string;
  ready: boolean;
  /** What the free lesson preflight still asks for; empty or absent when ready. */
  findings?: string[];
};

export type AuthoringWorkspace = {
  root: string;
  style: string;
  name: string;
  description: string;
  manifestSource: string;
  courseGuidance: string;
  rootFiles: AuthoringSourceFile[];
  language: string;
  issues: string[];
  courseChecks: AuthoringReadinessCheck[];
  lessons: AuthoringLesson[];
  sessionId: string | null;
  messages: AuthoringTranscriptMessage[];
};

/** Course files and readiness are independent of a chat runtime. */
export type AuthoringDraft = Omit<AuthoringWorkspace, "sessionId" | "messages">;

export function readAuthoringDraft(root: string): AuthoringDraft {
  const manifest = readDraftManifest(root);
  const lessons = draftLessons(root, manifest);
  return {
    root,
    style: String(manifest.mode ?? "katas"),
    name: String(manifest.name ?? basename(root)),
    description: String(manifest.description ?? ""),
    manifestSource: readOptionalFile(resolve(root, "dojo.yaml")),
    courseGuidance: readOptionalFile(resolve(root, "DOJO.md")),
    rootFiles: readRootAuthoringFiles(root),
    language: String(manifest.language ?? ""),
    issues: validateManifest(manifest),
    courseChecks: courseReadiness(root, manifest, lessons),
    lessons,
  };
}

export function createAuthoringService(agent: AuthoringAgent) {
  const getWorkspace = async (root: string): Promise<AuthoringWorkspace> => {
    const draft = readAuthoringDraft(root);
    const thread = readThreadState(root);
    let messages: AuthoringTranscriptMessage[] = [];
    let sessionId: string | null = null;
    if (thread) {
      await resumeThread(agent, root, thread);
      messages = await agent.history(thread.sessionId);
      sessionId = thread.sessionId;
    }
    return {
      ...draft,
      sessionId,
      messages,
    };
  };

  return {
    getWorkspace,
    startSession: async (root: string) => {
      await authoringThread(agent, root);
      return getWorkspace(root);
    },
    streamIntroduction: async (
      root: string,
      onPart: (part: AuthoringStreamPart) => void,
      signal?: AbortSignal
    ) => {
      const { threadId } = await authoringThread(agent, root);
      const history = await agent.history(threadId);
      if (history.some((entry) =>
        entry.role === "assistant" && entry.kind === "message")) return;
      await agent.send(
        threadId,
        `${AUTHORING_BOOTSTRAP_MARKER}\n${AUTHORING_BOOTSTRAP_PROMPT}`,
        onPart,
        { visible: false, signal }
      );
    },
    streamMessage: async (
      root: string,
      message: string,
      onPart: (part: AuthoringStreamPart) => void,
      signal?: AbortSignal
    ) => {
      const { threadId } = await authoringThread(agent, root);
      const edits = pendingAuthoringEdits(root);
      await agent.send(
        threadId,
        messageWithAuthoringEdits(message, edits),
        onPart,
        { signal }
      );
      acknowledgeAuthoringEdits(root, edits);
    },
    answer: (root: string, answers: Record<string, string[]>) => {
      const thread = readThreadState(root);
      if (!thread) throw new Error("No Kyoshi session is active");
      return agent.answer(thread.sessionId, answers);
    },
  };
}

export function createLessonTrial(root: string, lessonId: string): {
  workspaceId: string;
  courseId: string;
  lessonId: string;
} {
  const manifest = readDraftManifest(root);
  const lessons = draftLessons(root, manifest);
  const lesson = lessons.find((lesson) => lesson.id === lessonId);
  if (!lesson) {
    throw new Error(`Lesson not found: ${lessonId}`);
  }
  const templatePath = lesson.templatePath ?? `src/${lessonId}/kata.ts`;
  if (!lesson.files.some((file) => file.path === templatePath)) {
    throw new Error("Lesson template must be an existing lesson file");
  }
  if (!String(manifest.name ?? "").trim() || !String(manifest.description ?? "").trim()) {
    throw new Error("Name and describe the course before starting a trial");
  }
  const courseId = slugify(String(manifest.name));
  if (!courseId) throw new Error("Course name must contain letters or numbers");
  const trialRoot = mkdtempSync(resolve(tmpdir(), "dojofoo-trial-"));
  const courseRoot = resolve(trialRoot, "courses", courseId);
  // mkdtemp owns this exact isolated workspace; cleanup never targets the draft.
  try {
    mkdirSync(resolve(trialRoot, ".dojo"), { recursive: true });
    writeFileSync(resolve(trialRoot, ".dojo/runtimes.json"), JSON.stringify({ lesson: resolveRuntimeHarness("lesson", root) }));
    mkdirSync(dirname(courseRoot), { recursive: true });
    mkdirSync(courseRoot, { recursive: true });
    const include = trialCopyFilter(root);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!include(resolve(root, entry.name))) continue;
      cpSync(resolve(root, entry.name), resolve(courseRoot, entry.name), {
        recursive: true, dereference: true, filter: include,
      });
    }
    writeDojoRc(trialRoot, {
      currentDojo: courseId,
      currentKata: lessonId,
      editor: null,
      progress: {
        [courseId]: { completed: [], lastActive: lessonId, kataIntros: [] },
      },
    });
    const template = resolve(courseRoot, templatePath);
    const starters = createStateDirectory(trialRoot, courseId, "starters");
    writeFileSync(resolve(starters, lessonId), readFileSync(template));
    const observed = observeLocalContext(trialRoot);
    if (!observed) throw new Error("Could not register the lesson trial workspace");
    return { workspaceId: observed.workspaceId, courseId, lessonId };
  } catch (error) {
    rmSync(trialRoot, { recursive: true, force: true });
    throw error;
  }
}

/** Materialize safe internal links; never retain a path back into the draft. */
function trialCopyFilter(root: string): (source: string) => boolean {
  const logicalRoot = resolve(root);
  const physicalRoot = realpathSync(root);
  const include = courseFileFilter(root);
  return source => {
    if (!include(relative(logicalRoot, source))) return false;
    const target = realpathSync(source);
    const path = relative(physicalRoot, target);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
      throw new Error(`Trial link points outside the course: ${relative(logicalRoot, source)}`);
    }
    if (!include(path)) {
      throw new Error(`Trial link points to private course state: ${relative(logicalRoot, source)}`);
    }
    if (lstatSync(source).isSymbolicLink()) {
      for (let parent = dirname(source); ; parent = dirname(parent)) {
        if (realpathSync(parent) === target) throw new Error(`Trial link cycle: ${relative(logicalRoot, source)}`);
        if (parent === logicalRoot) break;
      }
    }
    return true;
  };
}

export function authoringEvalReadiness(root: string): AuthoringReadinessCheck[] {
  const manifest = readDraftManifest(root);
  const lessons = draftLessons(root, manifest);
  return [
    ...courseReadiness(root, manifest, lessons),
    ...lessons.flatMap((lesson) => lesson.checks.map((check) => ({
      ...check,
      id: `${lesson.id}:${check.id}`,
      label: `${lesson.title}: ${check.label}`,
    }))),
  ];
}

export function createAuthoringLesson(root: string, requestedTitle: string): string {
  const title = requestedTitle.trim() || "Untitled lesson";
  const manifest = readDraftManifest(root);
  const entries = Array.isArray(manifest.katas)
    ? manifest.katas.filter(isRecord)
    : [];
  const prefix = String(entries.length + 1).padStart(3, "0");
  const base = slugify(title) || "lesson";
  let id = `${prefix}-${base}`;
  let suffix = 2;
  while (entries.some((entry) => entry.name === id) || existsSync(resolve(root, "src", id))) {
    id = `${prefix}-${base}-${suffix}`;
    suffix += 1;
  }
  manifest.katas = [
    ...entries,
    {
      name: id,
      title,
      template: `src/${id}/kata.ts`,
      description: "",
      difficulty: 1,
    },
  ];
  writeAuthoringFile(root, "dojo.yaml", stringifyYaml(manifest));
  // Every new lesson starts with its evals in place: the SENSEI template the
  // preflight checks against, and a staircase of todo checks to fill in.
  writeAuthoringFile(root, `src/${id}/SENSEI.md`, readPrompt("skills/kata-lessons/SENSEI.tmpl").replace("{Lesson title}", title));
  mkdirSync(resolve(root, "src", id), { recursive: true });
  writeFileSync(resolve(root, "src", id, "kata.ts"), "");
  writeFileSync(resolve(root, "src", id, "kata.test.ts"), [
    `import { describe, it } from "vitest";`,
    ``,
    `// A staircase of checks: the easiest win first, then one test per stumbling point.`,
    `describe(${JSON.stringify(title)}, () => {`,
    `  it.todo("the easiest behavior a learner can win");`,
    `  it.todo("one stumbling point, named as a behavior");`,
    `});`,
    ``,
  ].join("\n"));
  return id;
}

export function renameAuthoringCourse(root: string, requestedTitle: string): void {
  const title = requestedTitle.trim();
  if (!title) throw new Error("Course title is required");
  const manifest = readDraftManifest(root);
  manifest.name = title;
  writeAuthoringFile(root, "dojo.yaml", stringifyYaml(manifest));
}

export function renameAuthoringLesson(
  root: string,
  lessonId: string,
  requestedTitle: string
): void {
  const title = requestedTitle.trim();
  if (!title) throw new Error("Lesson title is required");
  const manifest = readDraftManifest(root);
  const entries = Array.isArray(manifest.katas)
    ? manifest.katas.filter(isRecord)
    : [];
  const lesson = entries.find((entry) => String(entry.name ?? "") === lessonId);
  if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
  lesson.title = title;
  manifest.katas = entries;
  writeAuthoringFile(root, "dojo.yaml", stringifyYaml(manifest));
}

function readDraftManifest(root: string): Record<string, unknown> {
  const path = resolve(root, "dojo.yaml");
  if (!existsSync(path)) throw new Error(`Authoring manifest not found: ${path}. Restore this course or open an existing authoring workspace.`);
  return parseYaml(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function draftLessons(root: string, manifest: Record<string, unknown>): AuthoringLesson[] {
  const entries = manifest.chapters !== undefined ? chapterCurriculum(manifest).katas : Array.isArray(manifest.katas)
    ? manifest.katas.filter(isRecord)
    : [];
  return entries.map((entry) => {
    const id = String(entry.name ?? basename(dirname(String(entry.template ?? ""))));
    const templatePath = String(entry.template ?? `src/${id}/kata.ts`);
    if (!courseRelativePath(templatePath)) throw new Error(`Lesson template must stay inside the course: ${id}`);
    const directory = dirname(resolve(root, templatePath));
    const senseiPath = ["SENSEI.mdx", "SENSEI.md"]
      .map((name) => resolve(directory, name))
      .find(existsSync);
    const relativeSenseiPath = relative(root, resolve(directory, senseiPath?.endsWith(".mdx") ? "SENSEI.mdx" : "SENSEI.md"));
    const sensei = senseiPath ? readFileSync(senseiPath, "utf8") : "";
    const files = readAuthoringDirectory(root, directory);
    // A manifest's `test` is an executable command, not a filename. Match the
    // production resolver: tests are named after the actual scaffold.
    const testPath = kataTestTemplate(templatePath);
    const evalPaths = files
      .map(({ path }) => path)
      .filter((path) => /(?:^|\/)(?:eval|\w[\w.-]*\.eval)\.ya?ml$/u.test(path));
    // The free lesson preflight: the same findings that block a paid trial.
    const senseiFindings = substantiveMarkdown(sensei)
      ? checkSensei(sensei, { mdx: senseiPath?.endsWith(".mdx") })
      : ["Fill SENSEI.tmpl into this lesson's SENSEI.md."];
    const tests = files.find((file) => file.path === testPath);
    const scaffoldFindings = !files.some((file) => file.path === templatePath)
      ? [`Add the learner scaffold ${templatePath}.`]
      : tests ? checkTests(tests.content) : [`Add the lesson's checks in ${testPath}.`];
    const checks: AuthoringReadinessCheck[] = [
      { id: "sensei", label: "Lesson briefing and Sensei guidance", ready: !senseiFindings.length, findings: senseiFindings },
      { id: "scaffold", label: "Learner scaffold and checks", ready: !scaffoldFindings.length, findings: scaffoldFindings },
    ];
    return {
      id,
      title: String(entry.title ?? humanTitle(id)),
      description: String(entry.description ?? ""),
      senseiPath: relativeSenseiPath,
      templatePath,
      testPath,
      sensei,
      files,
      hasSensei: Boolean(senseiPath && substantiveMarkdown(readFileSync(senseiPath, "utf8"))),
      evalPaths,
      checks,
    };
  });
}

function readAuthoringDirectory(root: string, directory: string, include = authoringFileFilter(root)): AuthoringSourceFile[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => include(relative(root, resolve(directory, entry.name))))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return readAuthoringDirectory(root, path, include);
      if (!entry.isFile()) return [];
      return [{ content: readOptionalFile(path), label: entry.name, path: relative(root, path) }];
    });
}

function readRootAuthoringFiles(root: string): AuthoringSourceFile[] {
  const include = authoringFileFilter(root);
  const excluded = new Set([".dojo", ".git", "evals", "node_modules", "src"]);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => !excluded.has(entry.name) && include(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) return readAuthoringDirectory(root, path, include);
      if (!entry.isFile()) return [];
      return [{ content: readOptionalFile(path), label: entry.name, path: relative(root, path) }];
    });
}

function courseReadiness(
  root: string,
  manifest: Record<string, unknown>,
  lessons: AuthoringLesson[]
): AuthoringReadinessCheck[] {
  return [
    { id: "manifest", label: "Course metadata", ready: validateManifest(manifest).length === 0 },
    { id: "intent", label: "Course intent and teaching rules", ready: substantiveMarkdown(readOptionalFile(resolve(root, "DOJO.md"))) },
    { id: "curriculum", label: "At least one lesson", ready: lessons.length > 0 },
  ];
}

function readOptionalFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authoringThread(
  agent: AuthoringAgent,
  root: string
): Promise<{ threadId: string; created: boolean }> {
  const existing = readThreadState(root);
  if (existing) {
    await resumeThread(agent, root, existing);
    return { threadId: existing.sessionId, created: false };
  }
  const harness = agent.currentHarness();
  const threadId = await agent.start({
    root,
    runtimeKey: runtimeKey(root, harness),
    harness,
    instructions: kyoshiContract,
  });
  writeThreadState(root, {
    version: 1,
    sessionId: threadId,
    harness,
    aliases: [],
  });
  return { threadId, created: true };
}

async function resumeThread(
  agent: AuthoringAgent,
  root: string,
  state: AuthoringThreadState
): Promise<void> {
  await agent.resume(state.sessionId, {
    root,
    runtimeKey: runtimeKey(root, state.harness),
    harness: state.harness,
    instructions: kyoshiContract,
  });
}

function runtimeKey(root: string, harness: string): string {
  const contract = createHash("sha256").update(kyoshiContract).digest("hex");
  return `${harness}\0${resolve(root)}\0kyoshi\0${contract}`;
}

function statePath(root: string): string {
  return resolve(root, ".dojo", "kyoshi.json");
}

function readThreadState(root: string): AuthoringThreadState | null {
  const path = statePath(root);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as AuthoringThreadState;
}

function writeThreadState(root: string, state: AuthoringThreadState): void {
  const path = statePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

function slugify(value: string): string {
  return value.toLocaleLowerCase().trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function humanTitle(id: string): string {
  return id.replace(/^\d+-/u, "").replace(/-/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toLocaleUpperCase());
}

function substantiveMarkdown(markdown: string): boolean {
  return markdown.replace(/^#.*$/gmu, "").trim().length > 0;
}
import { resolveRuntimeHarness } from "@dojofoo/config/runtime";
