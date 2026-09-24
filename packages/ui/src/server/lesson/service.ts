import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  findCurrentKata,
  findKataByIdOrName,
  findNextKata,
  kataState,
  readCatalog,
  readDojoMd,
  readDojoRc,
  resolveAllKatas,
  writeDojoRc,
} from "@dojofoo/config";
import type { UIMessage } from "@tanstack/ai-client";
import type { DojoLessonContext } from "@dojofoo/protocol";
import { senseiInstructions } from "./instructions";
import type { HarnessKind } from "../harness/adapter";
import { dojofooHarness } from "../harness/registry";
import { acpClient, type AcpStreamPart, type SessionModelConfiguration, type TranscriptMessage } from "./codex-client";
import { parseSenseiContent } from "./sensei-content";

type WebState = {
  version: 4;
  threads: Record<string, { sessionId: string; harness: HarnessKind; contractHash: string; aliases: string[]; resumeFailed?: boolean }>;
  results: Record<string, TestReport>;
  checkpoints: Record<string, { at: string; threadId?: string }>;
  observations: Record<string, {
    code: string;
    failureSignature: string;
    attempt: number;
  }>;
};

export type TestReport = {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs?: number;
  complete: boolean;
  tests: Array<{
    name: string;
    suite: string[];
    filePath?: string;
    status: "passed" | "failed" | "skipped";
    failureMessages: string[];
    durationMs?: number;
  }>;
  coverage?: {
    lines: { covered: number; total: number; percentage: number };
    lineHits: Record<string, number>;
  };
};

export type CheckObservation = {
  id: string;
  attempt: number;
  codeChanged: boolean;
  diff: string;
  report: TestReport;
};

export type LessonSnapshot = {
  dojo: string;
  kata: string;
  title: string;
  briefing: string;
  code: string;
  starterCode: string;
  fileId: "solution";
  filePath: string;
  language: "javascript" | "typescript" | "python";
  introduced: boolean;
  checkpointed: boolean;
  sessionId: string | null;
  model: SessionModelConfiguration | null;
  state: "completed" | "ongoing" | "not-started";
  isCurrent: boolean;
  result: TestReport | null;
  messages: UIMessage[];
  fragments: Record<string, string>;
  lessons: Array<{ name: string; title: string; summary: string; state: string; isCurrent: boolean }>;
};

export type LessonFileResource = {
  type: "lesson-files";
  id: "solution";
  attributes: {
    path: string;
    language: LessonSnapshot["language"];
    content: string;
    starterContent: string;
  };
};

export function dojoLessonContext(snapshot: LessonSnapshot): DojoLessonContext {
  return {
    phase: snapshot.introduced ? "resume" : "start",
    course: { id: snapshot.dojo },
    lesson: {
      id: snapshot.kata,
      title: snapshot.title,
      objective: snapshot.briefing || snapshot.title,
      state: snapshot.state,
    },
    learner: {
      file: { path: snapshot.filePath, language: snapshot.language, content: snapshot.code },
      latestCheck: snapshot.result,
    },
  };
}

export function dojoLessonFragment(snapshot: LessonSnapshot, fragmentId: string): { fragmentId: string } {
  if (!snapshot.fragments[fragmentId]) throw new Error(`Lesson fragment not found: ${fragmentId}`);
  return { fragmentId };
}

export function shouldIntroduceLesson(snapshot: Pick<LessonSnapshot, "introduced">): boolean {
  return !snapshot.introduced;
}

function dojoContextResource(snapshot: LessonSnapshot) {
  return {
    uri: `dojo://courses/${encodeURIComponent(snapshot.dojo)}/lessons/${encodeURIComponent(snapshot.kata)}/context`,
    mimeType: "application/json",
    text: JSON.stringify(dojoLessonContext(snapshot)),
  };
}

export const solutionBoundary = `Preserve ownership of the kata. Never write or dictate code that the learner can paste into the kata to satisfy its current failure. This includes a one-line expression, not only a complete function. Do not evade this boundary with an isomorphic example: renaming the learner's parameter or function while retaining the same methods, operators, literals, and composition still reveals the answer. Teach one missing concept through an authoritative reference, an authored interactive fragment, or a genuinely different problem whose final composition cannot be mechanically substituted into the kata. Help the learner connect that knowledge to what they observe, but leave the final composition and edit to them.`;

export async function getLesson(root: string, requestedKata?: string): Promise<LessonSnapshot | null> {
  const rc = readDojoRc(root);
  if (!rc.currentDojo) return null;
  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const progress = rc.progress?.[rc.currentDojo];
  const current = findCurrentKata(katas, rc.currentKata) ?? findNextKata(katas, progress);
  const selected = requestedKata
    ? findKataByIdOrName(katas, requestedKata)
    : current;
  if (!selected) return null;

  const key = lessonKey(rc.currentDojo, selected.name);
  const webState = readWebState(root);
  const storedThread = webState.threads[key];
  const harness = dojofooHarness();
  let threadId: string | undefined = storedThread?.sessionId;
  const sensei = readFileSync(selected.senseiPath, "utf8");
  const instructions = lessonInstructions(root, rc.currentDojo, sensei);
  const contractHash = lessonContractHash(instructions);
  const senseiContent = parseSenseiContent(sensei);
  let messages: UIMessage[] = [];
  if (threadId && storedThread?.harness === harness) {
    try {
      await acpClient.resumeThread(threadId, {
        root,
        runtimeKey: lessonRuntimeKey(root, key, harness),
        harness,
        developerInstructions: instructions,
      });
      messages = transcriptToUIMessages(await acpClient.history(threadId), threadId);
      if (storedThread?.contractHash !== contractHash) {
        webState.threads[key] = {
          sessionId: threadId,
          harness,
          contractHash,
          aliases: storedThread?.aliases ?? [],
        };
        writeWebState(root, webState);
      }
    } catch (cause) {
      console.warn(`Could not resume ${harness} lesson session ${threadId}:`, cause);
      if (storedThread) {
        webState.threads[key] = {
          ...storedThread,
          aliases: [...new Set([...storedThread.aliases, storedThread.sessionId])],
          resumeFailed: true,
        };
      }
      writeWebState(root, webState);
      threadId = undefined;
    }
  } else if (threadId) threadId = undefined;

  const selectedState = kataState(selected, progress);
  const scaffoldPath = resolve(root, ".dojos", rc.currentDojo, selected.template);
  const starterCode = existsSync(scaffoldPath) ? readFileSync(scaffoldPath, "utf8") : "";
  let result: TestReport | null = webState.results[key] ?? null;
  let resultChanged = false;
  if (selectedState === "completed" && catalog.runner?.coverage === true && !result?.coverage) {
    try {
      result = parseTestReport(runDojo(root, ["kata", selected.name, "--check", "--reporter=json"]));
      resultChanged = true;
    } catch {
      if (!result) {
        result = completedTestReport(sensei);
        resultChanged = true;
      }
    }
  } else if (!result && selectedState === "completed") {
    result = completedTestReport(sensei);
    resultChanged = true;
  }
  if (result && (resultChanged || !webState.results[key])) {
    webState.results[key] = result;
    writeWebState(root, webState);
  }
  return {
    dojo: rc.currentDojo,
    kata: selected.name,
    title: humanTitle(selected.name),
    briefing: senpaiBriefing(sensei),
    code: existsSync(selected.workspacePath) ? readFileSync(selected.workspacePath, "utf8") : starterCode,
    starterCode,
    fileId: "solution",
    filePath: relative(root, selected.workspacePath),
    language: editorLanguage(selected.workspacePath),
    introduced: progress?.kataIntros?.includes(selected.name) === true,
    checkpointed: Boolean(webState.checkpoints[key]),
    sessionId: threadId ?? null,
    model: threadId ? acpClient.modelConfiguration(threadId) : null,
    state: selectedState,
    isCurrent: selected.name === current?.name,
    result,
    messages,
    fragments: senseiContent.fragments,
    lessons: katas.map((kata) => ({
      name: kata.name,
      title: humanTitle(kata.name),
      summary: lessonSummary(readFileSync(kata.senseiPath, "utf8")),
      state: kataState(kata, progress),
      isCurrent: kata.name === current?.name,
    })),
  };
}

export async function readLessonFile(
  root: string,
  courseId: string,
  lessonId: string,
  fileId: string,
): Promise<LessonFileResource> {
  if (fileId !== "solution") throw new Error(`Lesson file not found: ${fileId}`);
  const lesson = await getLesson(root, lessonId);
  if (!lesson || lesson.dojo !== courseId) throw new Error(`Lesson not found: ${lessonId}`);
  return {
    type: "lesson-files",
    id: "solution",
    attributes: {
      path: lesson.filePath,
      language: lesson.language,
      content: lesson.code,
      starterContent: lesson.starterCode,
    },
  };
}

export async function writeLessonFile(
  root: string,
  courseId: string,
  lessonId: string,
  fileId: string,
  content: string,
): Promise<LessonFileResource> {
  if (fileId !== "solution") throw new Error(`Lesson file not found: ${fileId}`);
  const target = lessonTarget(root, courseId, lessonId);
  mkdirSync(dirname(target.workspacePath), { recursive: true });
  writeFileSync(target.workspacePath, content);
  const rc = readDojoRc(root);
  rc.currentKata = lessonId;
  rc.progress ??= {};
  rc.progress[courseId] ??= { completed: [], lastActive: null };
  rc.progress[courseId].lastActive = lessonId;
  writeDojoRc(root, rc);
  const state = readWebState(root);
  delete state.results[lessonKey(courseId, lessonId)];
  writeWebState(root, state);
  return readLessonFile(root, courseId, lessonId, fileId);
}

export async function checkLesson(
  root: string,
  courseId: string,
  lessonId: string,
): Promise<{ lesson: LessonSnapshot; observation: CheckObservation }> {
  const target = lessonTarget(root, courseId, lessonId);
  const code = existsSync(target.workspacePath) ? readFileSync(target.workspacePath, "utf8") : "";
  const output = runDojo(root, ["kata", lessonId, "--check", "--reporter=json"]);
  const report = parseTestReport(output);
  const webState = readWebState(root);
  const key = lessonKey(courseId, lessonId);
  const previous = webState.observations[key];
  const failureSignature = report.tests
    .filter((test) => test.status === "failed")
    .map((test) => [...test.suite, test.name].join(" > "))
    .sort()
    .join("\n");
  const codeChanged = previous?.code !== code;
  const attempt = previous && previous.failureSignature === failureSignature && !codeChanged
    ? previous.attempt + 1
    : 1;
  webState.results[key] = report;
  webState.observations[key] = { code, failureSignature, attempt };
  writeWebState(root, webState);
  const updated = await getLesson(root, lessonId);
  if (!updated) throw new Error(`Lesson not found: ${lessonId}`);
  return {
    lesson: updated,
    observation: {
      id: crypto.randomUUID(),
      attempt,
      codeChanged,
      diff: lineDelta(previous?.code ?? "", code),
      report,
    },
  };
}

function lineDelta(previous: string, current: string): string {
  if (previous === current) return "No code change since the previous check.";
  const before = previous.split("\n");
  const after = current.split("\n");
  const lines: string[] = [];
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    if (before[index] === after[index]) continue;
    if (before[index] !== undefined) lines.push(`- ${before[index]}`);
    if (after[index] !== undefined) lines.push(`+ ${after[index]}`);
  }
  return lines.slice(0, 40).join("\n") || "Code changed.";
}

export function transcriptToUIMessages(transcript: TranscriptMessage[], sessionId: string): UIMessage[] {
  const messages: UIMessage[] = [];
  let hiddenUserBoundary = false;
  for (const entry of transcript) {
    const visibleText = visibleTranscriptText(entry);
    if (!visibleText) {
      if (entry.role === "user") hiddenUserBoundary = true;
      continue;
    }
    if (entry.kind === "reasoning" && entry.text.trim().startsWith("Introduce this lesson in your own words.")) continue;
    const durationMs = entry.startedAt !== undefined && entry.completedAt !== undefined
      ? Math.max(0, entry.completedAt - entry.startedAt)
      : undefined;
    const part = entry.kind === "reasoning"
      ? { type: "thinking" as const, content: visibleText, ...(durationMs === undefined ? {} : { durationMs }) }
      : entry.kind === "tool" && visibleText.startsWith("{")
        ? (() => {
            const tool = JSON.parse(visibleText) as { name: string; input: unknown; output: unknown };
            if (tool.name === "dojo_lesson_verify" && isTestReport(tool.output)) {
              return {
                type: "tool-call" as const,
                name: tool.name,
                id: `${sessionId}:tool:${messages.length}`,
                state: "complete" as const,
                arguments: jsonText(tool.input),
                input: tool.input,
                output: tool.output,
                ...(durationMs === undefined ? {} : { durationMs }),
              };
            }
            return {
              type: "tool-call" as const,
              name: tool.name,
              id: `${sessionId}:tool:${messages.length}`,
              state: "complete" as const,
              arguments: jsonText(tool.input),
              input: tool.input,
              output: tool.output,
              ...(durationMs === undefined ? {} : { durationMs }),
            };
          })()
      : { type: "text" as const, content: visibleText };
    const previous = messages.at(-1);
    const standaloneCheck = part.type === "tool-call" && part.name === "dojo_lesson_verify";
    if (entry.role === "assistant" && previous?.role === "assistant" && !hiddenUserBoundary && !standaloneCheck) {
      previous.parts.push(part);
      continue;
    }
    messages.push({
      id: `${sessionId}:${messages.length}`,
      role: entry.role,
      parts: [part],
    });
    hiddenUserBoundary = false;
  }
  return messages;
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const checkResourceMarker = /^\[?(?:dojo|dojofoo):\/\/lessons\/[^\]\s]+\/checks\/[^\]\s]+\]?\s*/u;

export function visibleTranscriptText(entry: TranscriptMessage): string {
  const text = entry.text.replace(checkResourceMarker, "").trim();
  if (!text) return "";
  if (entry.role !== "user") return text;
  if (text.startsWith(solutionBoundary)) return "";
  if (text.startsWith('{"instruction":"This check already completed.')) return "";
  return text;
}

function isTestReport(value: unknown): value is TestReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<TestReport>;
  return typeof report.total === "number"
    && typeof report.passed === "number"
    && typeof report.failed === "number"
    && Array.isArray(report.tests);
}

export async function answerSenseiQuestion(
  root: string,
  kataName: string | undefined,
  answers: Record<string, string[]>,
): Promise<{ ok: true } | LessonSnapshot> {
  const rc = readDojoRc(root);
  if (!rc.currentDojo) throw new Error("No current dojo");
  const kata = kataName ?? rc.currentKata;
  if (!kata) throw new Error("No lesson selected");
  const threadId = readWebState(root).threads[lessonKey(rc.currentDojo, kata)]?.sessionId;
  if (!threadId) throw new Error("No active sensei session");
  const moveOn = wantsNextLesson(answers);
  acpClient.answerUserInput(threadId, answers);
  if (moveOn) {
    return nextLesson(root, { checkpointCurrent: false });
  }
  return { ok: true };
}

export async function streamSensei(
  root: string,
  kataName: string | undefined,
  message: string,
  onPart: (part: AcpStreamPart) => void,
  signal?: AbortSignal,
): Promise<void> {
  const snapshot = await getLesson(root, kataName);
  if (!snapshot) throw new Error("No lesson selected");
  const { threadId } = await lessonThread(root, snapshot.kata);
  const evidence = snapshot.result ? testEvidence(snapshot.result) : "No test run has been recorded yet.";
  const evidenceContext = `${solutionBoundary}\n\nCurrent local test evidence. Do not comment on it unless relevant to the learner's message.\n${evidence}`;
  await acpClient.send(
    threadId,
    message,
    onPart,
    {
      signal,
      context: [{
        uri: `dojo://lessons/${encodeURIComponent(snapshot.kata)}/checks/latest`,
        mimeType: "text/plain",
        text: evidenceContext,
      }, dojoContextResource(snapshot)],
    },
  );
}

export async function streamCheckObservation(
  root: string,
  kataName: string,
  observation: CheckObservation,
  onPart: (part: AcpStreamPart) => void,
  signal?: AbortSignal,
): Promise<void> {
  const snapshot = await getLesson(root, kataName);
  if (!snapshot) throw new Error("No lesson selected");
  const { threadId } = await lessonThread(root, snapshot.kata);
  await acpClient.send(threadId, "Ran lesson checks.", onPart, {
    signal,
    visible: false,
    context: [dojoContextResource(snapshot), {
      uri: `dojo://lessons/${encodeURIComponent(kataName)}/checks/${observation.id}`,
      mimeType: "application/json",
      text: JSON.stringify({
        instruction: checkObservationInstruction(observation),
        attempt: observation.attempt,
        codeChanged: observation.codeChanged,
        diff: observation.diff,
        report: observation.report,
      }),
    }],
  });
}

export function checkObservationInstruction(observation: Pick<CheckObservation, "attempt" | "codeChanged" | "report">): string {
  const base = "This check already completed. Inspect the attached evidence without running it again or repeating its test counts.";
  if (observation.report.complete) {
    return `${base} Briefly recognize the progress and continue with the lesson's completion guidance.`;
  }
  if (observation.codeChanged) {
    return `${base} Respond to what the learner tried, then connect one useful failure to one achievable next move.`;
  }
  if (observation.attempt === 1) {
    return `${base} The evidence is unchanged. Leave room for the learner unless one new observation would clearly help.`;
  }
  if (observation.attempt === 2) {
    return `${base} This is the second unchanged check. Give one friendly nudge that is more concrete than your previous guidance.`;
  }
  return `${base} The learner has run the same failing check ${observation.attempt} times without changing the code. Treat this as an implicit request for help, not inactivity. Do not stay silent and do not repeat prior advice. Continue teaching one level more concretely: present the relevant authored fragment when available, link an authoritative reference, use an example from a different problem domain, or ask one simple diagnostic question the learner can answer. Do not write code that can be pasted into the kata to fix its current failure.`;
}

export async function streamLessonIntroduction(
  root: string,
  lessonId: string,
  onPart: (part: AcpStreamPart) => void,
  signal?: AbortSignal,
): Promise<void> {
  const snapshot = await getLesson(root, lessonId);
  if (!snapshot) throw new Error("No lesson selected");
  if (!shouldIntroduceLesson(snapshot)) return;
  const { threadId } = await lessonThread(root, snapshot.kata);
  const introductionInstruction = "The learner can already see the lesson goal and tasks, so do not repeat them. Inspect their solution file, orient them to one useful starting point, and invite one small first step without providing solution code. Point to relevant lines with [highlight:L3] or [highlight:L3-4].";
  await acpClient.send(
    threadId,
    "Begin the lesson.",
    onPart,
    {
      signal,
      visible: false,
      context: [dojoContextResource(snapshot), {
        uri: `dojo://lessons/${encodeURIComponent(snapshot.kata)}/introduction`,
        mimeType: "text/plain",
        text: introductionInstruction,
      }],
    },
  );
  if (!snapshot.introduced) runDojo(root, ["kata", "intro", "--done"]);
}

function testEvidence(report: TestReport): string {
  const summary = report.tests
    .map((test) => `${test.status.toUpperCase()}: ${[...test.suite, test.name].join(" > ")}`)
    .join("\n");
  return `${report.passed}/${report.total} passing.\n${summary}`;
}

export async function nextLesson(
  root: string,
  options: { checkpointCurrent?: boolean } = {},
): Promise<LessonSnapshot> {
  const rc = readDojoRc(root);
  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const next = findNextKata(katas, rc.progress?.[rc.currentDojo]);
  if (!next) throw new Error("The dojo is complete");
  if (rc.currentKata) {
    const state = readWebState(root);
    const key = lessonKey(rc.currentDojo, rc.currentKata);
    const threadId = state.threads[key]?.sessionId;
    if (threadId && options.checkpointCurrent !== false) await acpClient.checkpoint(threadId);
    if (options.checkpointCurrent !== false) {
      state.checkpoints[key] = { at: new Date().toISOString(), ...(threadId ? { threadId } : {}) };
      writeWebState(root, state);
    }
  }
  const scaffoldPath = resolve(root, ".dojos", rc.currentDojo, next.template);
  if (!existsSync(scaffoldPath)) throw new Error(`Lesson scaffold not found: ${next.name}`);
  await writeLessonFile(root, rc.currentDojo, next.name, "solution", readFileSync(scaffoldPath, "utf8"));
  const nextSnapshot = await getLesson(root, next.name);
  if (!nextSnapshot) throw new Error("No next lesson is available");
  return nextSnapshot;
}

export function wantsNextLesson(answers: Record<string, string[]>): boolean {
  return Object.values(answers).flat().some((value) =>
    /^(?:move on|next|continue)$/iu.test(value.trim())
    || /\b(?:move|go|continue|advance|start)\b[\s\S]*\bnext\b/iu.test(value)
    || /\bfinish(?: it| this| up)?\b[\s\S]*\bmove\b/iu.test(value)
  );
}

async function lessonThread(root: string, kataName: string, options: { forceNew?: boolean } = {}) {
  const rc = readDojoRc(root);
  const key = lessonKey(rc.currentDojo, kataName);
  const state = readWebState(root);
  const existing = state.threads[key];
  const harness = dojofooHarness();
  const runtimeKey = lessonRuntimeKey(root, key, harness);
  if (!options.forceNew && existing && existing.harness === harness && !existing.resumeFailed) {
    const catalog = readCatalog(root, rc.currentDojo);
    const kata = findKataByIdOrName(resolveAllKatas(root, rc, catalog), kataName);
    if (!kata) throw new Error(`Kata not found: ${kataName}`);
    const sensei = readFileSync(kata.senseiPath, "utf8");
    const instructions = lessonInstructions(root, rc.currentDojo, sensei);
    const contractHash = lessonContractHash(instructions);
    await acpClient.resumeThread(existing.sessionId, {
      root,
      runtimeKey,
      harness,
      developerInstructions: instructions,
      lessonContext: async () => {
        const current = await getLesson(root, kataName);
        if (!current) throw new Error(`Lesson not found: ${kataName}`);
        return dojoLessonContext(current);
      },
      lessonFragment: (fragmentId) => lessonFragment(root, kataName, fragmentId),
    });
    if (existing.contractHash !== contractHash) {
      state.threads[key] = { ...existing, contractHash };
      writeWebState(root, state);
    }
    return { threadId: existing.sessionId, created: false };
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const kata = findKataByIdOrName(resolveAllKatas(root, rc, catalog), kataName);
  if (!kata) throw new Error(`Kata not found: ${kataName}`);
  const sensei = readFileSync(kata.senseiPath, "utf8");
  const instructions = lessonInstructions(root, rc.currentDojo, sensei);
  const threadId = await acpClient.startThread({
    root,
    runtimeKey,
    harness,
    developerInstructions: instructions,
    lessonContext: async () => {
      const current = await getLesson(root, kataName);
      if (!current) throw new Error(`Lesson not found: ${kataName}`);
      return dojoLessonContext(current);
    },
    lessonFragment: (fragmentId) => lessonFragment(root, kataName, fragmentId),
  });
  state.threads[key] = {
    sessionId: threadId,
    harness,
    contractHash: lessonContractHash(instructions),
    aliases: existing
      ? [...new Set([...existing.aliases, existing.sessionId])]
      : [],
  };
  writeWebState(root, state);
  return { threadId, created: true };
}

async function lessonFragment(root: string, kataName: string, fragmentId: string): Promise<{ fragmentId: string }> {
  const current = await getLesson(root, kataName);
  if (!current) throw new Error(`Lesson not found: ${kataName}`);
  return dojoLessonFragment(current, fragmentId);
}

export async function setLessonModel(
  root: string,
  kataName: string,
  value: string,
): Promise<SessionModelConfiguration> {
  const { threadId } = await lessonThread(root, kataName);
  return acpClient.setModel(threadId, value);
}

export async function startLessonSession(
  root: string,
  kataName: string,
): Promise<LessonSnapshot> {
  await lessonThread(root, kataName, { forceNew: true });
  const lesson = await getLesson(root, kataName);
  if (!lesson) throw new Error(`Lesson not found: ${kataName}`);
  return lesson;
}

function lessonInstructions(root: string, dojo: string, sensei: string): string {
  return senseiInstructions({ mode: readCatalog(root, dojo).mode, dojo: readDojoMd(root, dojo) ?? "", sensei });
}

function lessonTarget(root: string, courseId: string, lessonId: string) {
  const rc = readDojoRc(root);
  if (rc.currentDojo !== courseId) throw new Error(`Course not found: ${courseId}`);
  const catalog = readCatalog(root, courseId);
  const lesson = findKataByIdOrName(resolveAllKatas(root, rc, catalog), lessonId);
  if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
  return lesson;
}

function runDojo(root: string, args: string[]): string {
  const configured = dojoCliPath();
  const command = configured ? process.execPath : "npx";
  const commandArgs = configured ? [configured, ...args] : ["dojofoo", ...args];
  return execFileSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DOJO_PROJECT_ROOT: root, DOJO_SKIP_PREPARE: "1" },
    timeout: 90_000,
  });
}

function dojoCliPath(): string | undefined {
  if (process.env.DOJO_CLI) return process.env.DOJO_CLI;
  const serverEntry = process.argv[1];
  if (!serverEntry) return undefined;
  const bundledCli = resolve(dirname(serverEntry), "..", "..", "index.js");
  return existsSync(bundledCli) ? bundledCli : undefined;
}

function senpaiBriefing(markdown: string): string {
  const section = markdown.match(/## Briefing\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1] ?? "";
  return section.replace(/### Hints[\s\S]*$/i, "").trim();
}

function lessonSummary(markdown: string): string {
  const briefing = senpaiBriefing(markdown);
  const prose = briefing
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !/^\d+[.)]\s/.test(line));
  if (!prose) return "Open this lesson to see its learning goal.";
  return prose.replaceAll("`", "").replace(/\.$/, "") + ".";
}

function humanTitle(name: string): string {
  return name.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function testSummary(output: string): string {
  return output.replace(/<dojo:prompt>[\s\S]*?<\/dojo:prompt>/g, "").trim();
}

function parseTestReport(output: string): TestReport {
  try {
    const result = JSON.parse(output) as {
      total: number;
      passed: number;
      failed?: number;
      skipped?: number;
      durationMs?: number;
      tests: Array<{
        name?: string;
        title?: string;
        suite?: string[];
        filePath?: string;
        status: "passed" | "failed" | "skipped";
        failureMessages?: string[];
        durationMs?: number;
      }>;
      coverage?: TestReport["coverage"];
      error: string | null;
    };
    if (result.error) throw new Error(result.error);
    return {
      passed: result.passed,
      failed: result.failed ?? result.tests.filter((test) => test.status === "failed").length,
      skipped: result.skipped ?? result.tests.filter((test) => test.status === "skipped").length,
      total: result.total,
      ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
      complete: result.total > 0 && result.passed === result.total,
      tests: result.tests.map((test) => ({
        name: test.name ?? test.title ?? "Unnamed test",
        suite: test.suite ?? [],
        ...(test.filePath ? { filePath: test.filePath } : {}),
        status: test.status,
        failureMessages: test.failureMessages ?? [],
        ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
      })),
      ...(result.coverage ? { coverage: result.coverage } : {}),
    };
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      // Migrate reports persisted before the machine-readable CLI reporter.
    } else {
      throw cause;
    }
  }
  const summary = testSummary(output);
  const counts = summary.match(/:\s+(\d+)\/(\d+)(?:\s+passing|\s+—\s+complete!)/i);
  if (!counts) throw new Error("The dojo returned an unreadable test report");
  const passed = Number(counts[1]);
  const total = Number(counts[2]);
  const tests = [...summary.matchAll(/^\s*\[([x ])\]\s+(.+)$/gim)].map((match) => ({
    name: match[2].trim(),
    suite: [],
    status: match[1].toLowerCase() === "x" ? "passed" as const : "failed" as const,
    failureMessages: [],
  }));
  return { passed, failed: total - passed, skipped: 0, total, complete: total > 0 && passed === total, tests };
}

function completedTestReport(sensei: string): TestReport | null {
  const table = sensei.match(/## Test Map\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1] ?? "";
  const titles = table
    .split("\n")
    .filter((line) => /^\|/.test(line) && !/^\|\s*(?:Test\s*\||[-: ]+\|)/i.test(line))
    .map((line) => line.split("|")[1]?.trim().replaceAll("`", ""))
    .filter((title): title is string => Boolean(title));
  if (titles.length === 0) return null;
  return {
    passed: titles.length,
    failed: 0,
    skipped: 0,
    total: titles.length,
    complete: true,
    tests: titles.map((name) => ({ name, suite: [], status: "passed", failureMessages: [] })),
  };
}

function editorLanguage(path: string): LessonSnapshot["language"] {
  if (/\.py$/i.test(path)) return "python";
  if (/\.[cm]?js$/i.test(path)) return "javascript";
  return "typescript";
}

function lessonKey(dojo: string, kata: string): string {
  return `${dojo}/${kata}`;
}

function lessonRuntimeKey(root: string, key: string, harness: HarnessKind = dojofooHarness()): string {
  return `${harness}\0${resolve(root)}\0${key}`;
}

function lessonContractHash(instructions: string): string {
  return `sha256:${createHash("sha256").update(instructions).digest("hex")}`;
}

function webStatePath(root: string): string {
  return resolve(root, ".dojo", "web.json");
}

function readWebState(root: string): WebState {
  const path = webStatePath(root);
  if (!existsSync(path)) return { version: 4, threads: {}, results: {}, checkpoints: {}, observations: {} };
  const stored = JSON.parse(readFileSync(path, "utf8")) as {
    threads?: Record<string, string | { sessionId: string; harness?: HarnessKind; contractHash?: string; aliases?: string[]; resumeFailed?: boolean }>;
    results?: Record<string, string | TestReport>;
    checkpoints?: Record<string, { at: string; threadId?: string }>;
    observations?: WebState["observations"];
  };
  const results = Object.fromEntries(
    Object.entries(stored.results ?? {}).map(([key, result]) => [
      key,
      typeof result === "string" ? parseTestReport(result) : normalizeStoredTestReport(result),
    ]),
  );
  return {
    version: 4,
    threads: normalizeLessonThreads(stored.threads),
    results,
    checkpoints: stored.checkpoints ?? {},
    observations: stored.observations ?? {},
  };
}

export function normalizeLessonThreads(
  threads: Record<string, string | { sessionId: string; harness?: HarnessKind; contractHash?: string; aliases?: string[]; resumeFailed?: boolean }> = {},
): WebState["threads"] {
  return Object.fromEntries(Object.entries(threads).map(([key, thread]) => [
    key,
    typeof thread === "string"
      ? { sessionId: thread, harness: "codex", contractHash: "", aliases: [] }
      : {
          sessionId: thread.sessionId,
          harness: thread.harness ?? "codex",
          contractHash: thread.contractHash ?? "",
          aliases: thread.aliases ?? [],
          ...(thread.resumeFailed ? { resumeFailed: true } : {}),
        },
  ]));
}

function normalizeStoredTestReport(report: TestReport | Record<string, unknown>): TestReport {
  if (Array.isArray((report as TestReport).tests)) return report as TestReport;
  const legacy = report as {
    passed: number;
    total: number;
    complete: boolean;
    checks?: Array<{ title: string; status: "passed" | "failed"; failureMessages?: string[] }>;
  };
  const tests = (legacy.checks ?? []).map((check) => ({
    name: check.title,
    suite: [],
    status: check.status,
    failureMessages: check.failureMessages ?? [],
  }));
  return {
    passed: legacy.passed,
    failed: tests.filter((test) => test.status === "failed").length,
    skipped: 0,
    total: legacy.total,
    complete: legacy.complete,
    tests,
  };
}

function writeWebState(root: string, state: WebState): void {
  const path = webStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}
