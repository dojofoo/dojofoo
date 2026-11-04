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
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";
import {
  observeLocalContext,
} from "@dojofoo/config/local-state";
import { courseContent, ensureCourseContent, readIntroduction, type CourseIntroduction, courseAppearanceErrors, type CourseAppearance, type ChapterReference, chapterCurriculum, courseChapters, courseFileFilter, courseRelativePath, createStateDirectory, kataTestTemplate, validateManifest, writeDojoRc } from "@dojofoo/config";
import { checkSensei, checkTests } from "../evaluation/preflight.ts";
import { readPrompt } from "../prompts.ts";
import {
  writeAuthoringFile,
  authoringFileFilter,
} from "./files";

export type AuthoringLesson = {
  chapter?: ChapterReference;
  intro?: CourseIntroduction | null;
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
  /** File ownership comes from the authoring service, not UI extension guesses. */
  courseFile?: boolean;
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

/** Course files and readiness are independent of a chat runtime. */
export type AuthoringDraft = {
  title?: string;
  author?: string;
  repository?: string;
  version?: string;
  appearance?: CourseAppearance;
  intro?: CourseIntroduction | null;
  chapters?: Array<ChapterReference & { intro?: CourseIntroduction | null; files?: AuthoringSourceFile[] }>;
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
};

export function readAuthoringDraft(root: string): AuthoringDraft {
  const manifest = readDraftManifest(root);
  const content = courseContent(root, manifest);
  const lessons = draftLessons(root, manifest).map(lesson => ({ ...lesson, chapter: lesson.chapter ?? courseChapters(manifest)[0] }));
  return {
    root,
    title: typeof manifest.title === "string" ? manifest.title : undefined,
    author: typeof manifest.author === "string" ? manifest.author : undefined,
    repository: typeof manifest.repository === "string" ? manifest.repository : undefined,
    version: typeof manifest.version === "string" ? manifest.version : undefined,
    appearance: manifest.appearance && !courseAppearanceErrors(manifest.appearance).length ? manifest.appearance as CourseAppearance : undefined,
    intro: content.intro,
    chapters: content.chapters.map(chapter => ({ ...chapter, files: readAuthoringDirectory(root, resolve(root, chapter.path)).filter(file =>
      !lessons.some(lesson => file.path.startsWith(`${dirname(lesson.templatePath ?? lesson.senseiPath).replaceAll("\\", "/")}/`))
      && !content.chapters.some(other => other.id !== chapter.id && other.path.startsWith(`${chapter.path}/`) && file.path.startsWith(`${other.path}/`))) })),
    style: String(manifest.mode ?? "katas"),
    name: String(manifest.title ?? manifest.name ?? basename(root)),
    description: String(manifest.description ?? ""),
    manifestSource: readOptionalFile(resolve(root, "dojo.yaml")),
    courseGuidance: readOptionalFile(resolve(root, "DOJO.md")),
    rootFiles: readRootAuthoringFiles(root).filter(file => !content.chapters.some(chapter => file.path.startsWith(`${chapter.path}/`))),
    language: String(manifest.language ?? ""),
    issues: [...validateManifest(manifest), ...content.issues],
    courseChecks: courseReadiness(root, manifest, lessons),
    lessons,
  };
}

export function createLessonTrial(root: string, lessonId: string, options: { agent?: AgentId; kind?: WorkspaceKind } = {}): {
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
    writeFileSync(resolve(trialRoot, ".dojo/runtimes.json"), JSON.stringify({ agent: options.agent ?? resolveAgent(root) }));
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
    const observed = observeLocalContext(trialRoot, { kind: options.kind ?? "learner" });
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

/** Materialize the Default chapter without moving lessons or changing their IDs. */
function chapterDocument(root: string) {
  const document = parseDocument(readOptionalFile(resolve(root, "dojo.yaml")));
  const manifest = readDraftManifest(root);
  if (!Array.isArray(manifest.chapters) || !manifest.chapters.length) {
    const lessons = Array.isArray(manifest.katas) ? manifest.katas.filter(isRecord).map(({ name, ...lesson }) => ({ ...lesson, id: String(name) })) : [];
    const chapter = { ...courseChapters(manifest)[0], lessons };
    const errors = chapterCurriculum({ chapters: [chapter] }).errors;
    if (errors.length) throw new Error(errors.join("; "));
    document.delete("katas");
    document.set("chapters", document.createNode([chapter]));
  }
  return document;
}

export function createAuthoringChapter(root: string, requestedTitle = "New chapter"): string {
  const title = requestedTitle.trim() || "New chapter";
  const document = chapterDocument(root);
  const chapters = (document.toJS() as { chapters: Array<ChapterReference> }).chapters;
  const base = slugify(title) || "chapter";
  let id = base;
  for (let suffix = 2; chapters.some(chapter => chapter.id === id) || existsSync(resolve(root, "src", id)); suffix++) id = `${base}-${suffix}`;
  document.addIn(["chapters"], document.createNode({ id, title, path: `src/${id}`, lessons: [] }));
  writeAuthoringFile(root, "dojo.yaml", document.toString());
  ensureCourseContent(root, document.toJS() as Record<string, unknown>);
  return id;
}

export function renameAuthoringChapter(root: string, chapterId: string, requestedTitle: string): void {
  const title = requestedTitle.trim();
  if (!title) throw new Error("Chapter title is required");
  const document = chapterDocument(root);
  const chapters = (document.toJS() as { chapters: Array<ChapterReference> }).chapters;
  const index = chapters.findIndex(chapter => chapter.id === chapterId);
  if (index < 0) throw new Error(`Chapter not found: ${chapterId}`);
  document.setIn(["chapters", index, "title"], title);
  writeAuthoringFile(root, "dojo.yaml", document.toString());
}

export function createAuthoringLesson(root: string, requestedTitle: string, chapterId?: string): string {
  const title = requestedTitle.trim() || "Untitled lesson";
  const manifest = readDraftManifest(root);
  const chapters = Array.isArray(manifest.chapters) ? manifest.chapters.filter(isRecord) : undefined;
  if (chapterId && chapterId !== "default" && !chapters) throw new Error("Select an existing chapter for the new lesson");
  const chapter = chapters?.find(entry => chapterId ? entry.id === chapterId : true);
  if (chapters && (!chapter || !courseRelativePath(chapter.path))) throw new Error("Select an existing chapter for the new lesson");
  const entries = chapters ? chapterCurriculum(manifest).katas : Array.isArray(manifest.katas) ? manifest.katas.filter(isRecord) : [];
  const prefix = String(entries.length + 1).padStart(3, "0");
  const base = slugify(title) || "lesson";
  let id = `${prefix}-${base}`;
  let suffix = 2;
  while (entries.some((entry) => entry.name === id) || existsSync(resolve(root, chapter ? String(chapter.path) : "src", id))) {
    id = `${prefix}-${base}-${suffix}`;
    suffix += 1;
  }
  const directory = `${chapter ? chapter.path : "src"}/${id}`;
  const entry = {
      ...(chapter ? { id } : { name: id }),
      title,
      template: `${directory}/kata.ts`,
      description: "",
      difficulty: 1,
  };
  if (chapter) chapter.lessons = [...(Array.isArray(chapter.lessons) ? chapter.lessons : []), entry];
  else manifest.katas = [...entries, entry];
  writeAuthoringFile(root, "dojo.yaml", stringifyYaml(manifest));
  // Every new lesson starts with its evals in place: the SENSEI template the
  // preflight checks against, and a staircase of todo checks to fill in.
  writeAuthoringFile(root, `${directory}/SENSEI.md`, readPrompt("skills/kata-lessons/SENSEI.tmpl").replace("{Lesson title}", title));
  mkdirSync(resolve(root, chapter ? String(chapter.path) : "src", id), { recursive: true });
  writeFileSync(resolve(root, directory, "kata.ts"), "");
  writeFileSync(resolve(root, directory, "kata.test.ts"), [
    `import { describe, it } from "vitest";`,
    ``,
    `// A staircase of checks: the easiest win first, then one test per stumbling point.`,
    `describe(${JSON.stringify(title)}, () => {`,
    `  it.todo("the easiest behavior a learner can win");`,
    `  it.todo("one stumbling point, named as a behavior");`,
    `});`,
    ``,
  ].join("\n"));
  ensureCourseContent(root, manifest);
  return id;
}

export function updateAuthoringAppearance(root: string, input: unknown): void {
  const manifest = readDraftManifest(root);
  const appearance = { ...(isRecord(manifest.appearance) ? manifest.appearance : {}), ...(isRecord(input) ? input : {}) };
  const errors = !isRecord(input) ? ['"appearance" must be an object'] : courseAppearanceErrors(appearance);
  if (errors.length) throw new Error(errors.join("; "));
  const document = parseDocument(readOptionalFile(resolve(root, "dojo.yaml")));
  if (!isRecord(manifest.appearance)) document.set("appearance", document.createNode({}));
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) document.setIn(["appearance", key], value);
  writeAuthoringFile(root, "dojo.yaml", document.toString());
}

export function renameAuthoringCourse(root: string, requestedTitle: string): void {
  const title = requestedTitle.trim();
  if (!title) throw new Error("Course title is required");
  const manifest = readDraftManifest(root);
  if (typeof manifest.title === "string") manifest.title = title;
  else manifest.name = title;
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
  const entries = Array.isArray(manifest.chapters)
    ? manifest.chapters.filter(isRecord).flatMap(chapter => Array.isArray(chapter.lessons) ? chapter.lessons.filter(isRecord) : [])
    : Array.isArray(manifest.katas) ? manifest.katas.filter(isRecord) : [];
  const lesson = entries.find((entry) => String(entry.id ?? entry.name ?? "") === lessonId);
  if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
  lesson.title = title;
  if (!Array.isArray(manifest.chapters)) manifest.katas = entries;
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
    const intro = readIntroduction(root, directory);
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
      { id: "intro", label: "Learner introduction in INTRO.md or INTRO.mdx", ready: Boolean(intro?.content.trim()) },
      { id: "sensei", label: "Lesson briefing and Sensei guidance", ready: !senseiFindings.length, findings: senseiFindings },
      { id: "scaffold", label: "Learner scaffold and checks", ready: !scaffoldFindings.length, findings: scaffoldFindings },
    ];
    return {
      ...(isRecord(entry.chapter) ? { chapter: entry.chapter as unknown as ChapterReference } : {}),
      id, intro,
      title: String(entry.title ?? humanTitle(id)),
      description: String(entry.description ?? ""),
      senseiPath: relativeSenseiPath,
      templatePath,
      testPath,
      sensei,
      files: files.map(file => ({ ...file, courseFile: file.courseFile || file.path === templatePath || file.path === testPath || evalPaths.includes(file.path) })),
      hasSensei: Boolean(senseiPath && substantiveMarkdown(readFileSync(senseiPath, "utf8"))),
      evalPaths,
      checks,
    };
  });
}

function primaryCourseFile(name: string): boolean {
  return /^(README\.md|INTRO\.mdx?|DOJO\.md|SENSEI\.mdx?|dojo\.(?:ya?ml|json))$/i.test(name);
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
      return [{ content: readOptionalFile(path), label: entry.name, path: relative(root, path), courseFile: primaryCourseFile(entry.name) }];
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
      return [{ content: readOptionalFile(path), label: entry.name, path: relative(root, path), courseFile: primaryCourseFile(entry.name) }];
    });
}

function courseReadiness(
  root: string,
  manifest: Record<string, unknown>,
  lessons: AuthoringLesson[]
): AuthoringReadinessCheck[] {
  const content = courseContent(root, manifest);
  return [
    { id: "introduction", label: "Course README.md and chapter introductions", ready: Boolean(content.intro?.content.trim()) && content.chapters.every(chapter => Boolean(chapter.intro?.content.trim())), findings: content.issues.filter(issue => !issue.includes(" lesson introduction")) },
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
import { resolveAgent } from "@dojofoo/config/runtime";
import type { AgentId, WorkspaceKind } from "@dojofoo/protocol";
