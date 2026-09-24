import { createHash, randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  observeLocalContext,
} from "@dojofoo/config/local-state";
import { validateManifest, writeDojoRc } from "@dojofoo/config";
import {
  AUTHORING_BOOTSTRAP_MARKER,
  AUTHORING_BOOTSTRAP_PROMPT,
  messageWithAuthoringEdits,
  type AuthoringAgent,
  type AuthoringStreamPart,
  type AuthoringTranscriptMessage,
} from "./types";
import kyoshiContract from "../contracts/KYOSHI.md?raw";
import {
  acknowledgeAuthoringEdits,
  pendingAuthoringEdits,
  writeAuthoringFile,
} from "./files";

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
  if (!lessons.some((lesson) => lesson.id === lessonId)) {
    throw new Error(`Lesson not found: ${lessonId}`);
  }
  if (!String(manifest.name ?? "").trim() || !String(manifest.description ?? "").trim()) {
    throw new Error("Name and describe the course before starting a trial");
  }
  const courseId = slugify(String(manifest.name));
  if (!courseId) throw new Error("Course name must contain letters or numbers");
  const trialRoot = resolve(root, ".dojo", "trials", `${lessonId}-${randomUUID()}`);
  const courseRoot = resolve(trialRoot, ".dojos", courseId);
  mkdirSync(dirname(courseRoot), { recursive: true });
  mkdirSync(courseRoot, { recursive: true });
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".dojo" || entry.name === ".git" || entry.name === "node_modules") continue;
    cpSync(resolve(root, entry.name), resolve(courseRoot, entry.name), {
      recursive: true,
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
  const template = resolve(courseRoot, "src", lessonId, "solution.ts");
  const workspace = resolve(trialRoot, "katas", lessonId, "solution.ts");
  mkdirSync(dirname(workspace), { recursive: true });
  writeFileSync(workspace, readFileSync(template, "utf8"));
  const observed = observeLocalContext(trialRoot);
  if (!observed) throw new Error("Could not register the lesson trial workspace");
  return { workspaceId: observed.workspaceId, courseId, lessonId };
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
      template: `src/${id}/solution.ts`,
      test: `src/${id}/solution.test.ts`,
      description: "",
      difficulty: 1,
    },
  ];
  writeAuthoringFile(root, "dojo.yaml", stringifyYaml(manifest));
  writeAuthoringFile(root, `src/${id}/SENSEI.md`, `# ${title}\n`);
  mkdirSync(resolve(root, "src", id), { recursive: true });
  writeFileSync(resolve(root, "src", id, "solution.ts"), "");
  writeFileSync(resolve(root, "src", id, "solution.test.ts"), "");
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
  if (!existsSync(path)) throw new Error("dojo.yaml is missing from this authoring workspace");
  return parseYaml(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function draftLessons(root: string, manifest: Record<string, unknown>): AuthoringLesson[] {
  const entries = Array.isArray(manifest.katas)
    ? manifest.katas.filter(isRecord)
    : [];
  return entries.map((entry) => {
    const id = String(entry.name ?? basename(dirname(String(entry.template ?? ""))));
    const directory = resolve(root, "src", id);
    const senseiPath = ["SENSEI.mdx", "SENSEI.md"]
      .map((name) => resolve(directory, name))
      .find(existsSync);
    const relativeSenseiPath = `src/${id}/${senseiPath?.endsWith(".mdx") ? "SENSEI.mdx" : "SENSEI.md"}`;
    const sensei = senseiPath ? readFileSync(senseiPath, "utf8") : "";
    const files = readAuthoringDirectory(root, directory);
    const evalPaths = files
      .map(({ path }) => path)
      .filter((path) => /(?:^|\/)(?:eval|\w[\w.-]*\.eval)\.ya?ml$/u.test(path));
    const checks: AuthoringReadinessCheck[] = [
      { id: "sensei", label: "Lesson briefing and Sensei guidance", ready: substantiveMarkdown(sensei) },
      { id: "scaffold", label: "Learner scaffold and checks", ready: existsSync(resolve(directory, "solution.ts")) && existsSync(resolve(directory, "solution.test.ts")) },
    ];
    return {
      id,
      title: String(entry.title ?? humanTitle(id)),
      description: String(entry.description ?? ""),
      senseiPath: relativeSenseiPath,
      sensei,
      files,
      hasSensei: Boolean(senseiPath && substantiveMarkdown(readFileSync(senseiPath, "utf8"))),
      evalPaths,
      checks,
    };
  });
}

function readAuthoringDirectory(root: string, directory: string): AuthoringSourceFile[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return readAuthoringDirectory(root, path);
      if (!entry.isFile()) return [];
      return [{ content: readOptionalFile(path), label: entry.name, path: relative(root, path) }];
    });
}

function readRootAuthoringFiles(root: string): AuthoringSourceFile[] {
  const excluded = new Set([".dojo", ".git", "evals", "node_modules", "src"]);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => !excluded.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(root, entry.name);
      if (entry.isDirectory()) return readAuthoringDirectory(root, path);
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
