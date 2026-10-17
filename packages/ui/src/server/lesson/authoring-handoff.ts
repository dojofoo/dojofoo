import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { readLessonSensei } from "@dojofoo/authoring/evaluation/sensei";
import { createLessonTrial } from "@dojofoo/authoring/service";
import { listWorkspaces } from "@dojofoo/config/local-state";
import { prepareWorkspace } from "@dojofoo/config/project-preparation";
import { parse } from "yaml";
import assert from "node:assert/strict";
import { readMaterial } from "@dojofoo/authoring/evaluation/material";
import { TeachingFailure } from "@dojofoo/authoring/evaluation/failure";
import { scriptedLearner } from "@dojofoo/authoring/evaluation/prompts";
import type { LearnerFixture } from "@dojofoo/authoring/evaluation/learner-fixtures";
import type { LearnerDialogue } from "@dojofoo/authoring/evaluation/learner-response";
import { isDeepStrictEqual } from "node:util";
import { acpClient, type AcpStreamPart, type UserQuestion } from "./codex-client";
import { runRoutes } from "../run/routes";
import { senseiInstructions } from "./instructions";
import {
  answerSenseiQuestion, checkLesson, dojoLessonContext, getLesson, nextLesson, setLessonModel,
  startLessonSession, streamCheckObservation, streamLessonIntroduction,
  streamSensei, writeLessonFile,
} from "./service";

/** Worker-only: lesson services own process-wide harness state. */
export async function runAuthoringHandoff(signal: AbortSignal = new AbortController().signal, lessonIds?: string[], options?: {
  fixturesPath?: string;
  learnerProfile?: "struggling" | "confident";
  /** Complete a real teaching dialogue for each lesson instead of seeding
   * earlier completion. Required when claiming a full two-lesson chain. */
  priorLessons?: "seed-completion" | "teach";
  /** Focused teaching checks still use the production setup, but do not claim
   * completion, review or learning outcomes. Empty turns checks just the intro. */
  turns?: ReadonlyArray<{ message: string; code?: string }>;
  respondToReview?(dialogue: LearnerDialogue, source: string, signal: AbortSignal): Promise<string>;
  /** Answer the actual teaching question; no hidden guidance or expected answer. */
  respondToQuestion?(questions: UserQuestion[], dialogue: LearnerDialogue, source: string, signal: AbortSignal): Promise<Record<string, string[]>>;
  verifyFixtures?(root: string, courseId: string, fixtures: Record<string, LearnerFixture>, lessonIds: string[], signal: AbortSignal): Promise<unknown>;
}) {
  signal.throwIfAborted();
  // Live-eval pacing: synthetic learners otherwise send many turns
  // faster than a human can read. No retry or change to production chat.
  const turnIntervalMs = Number(process.env.DOJOFOO_EVAL_TURN_INTERVAL_MS ?? 15_000);
  if (!Number.isSafeInteger(turnIntervalMs) || turnIntervalMs < 0 || turnIntervalMs > 60_000) {
    throw new Error("Evaluation turn interval must be between 0 and 60000 milliseconds");
  }
  const learnerProfile = options?.turns ? "focused" : options?.learnerProfile ?? "struggling";
  const maxTeachingQuestionReplies = 4;
  if (learnerProfile === "confident" && !options?.respondToReview) throw new Error("Confident scenario requires a learner responder");
  assert.equal(process.env.DOJOFOO_EVALUATION_WORKER, "1", "Production teaching evaluations require an isolated worker");
  const authoredRoot = process.env.DOJOFOO_HANDOFF_COURSE;
  if (!authoredRoot) throw new Error("DOJOFOO_HANDOFF_COURSE is required");
  if (!process.env.DOJOFOO_HARNESS) throw new Error("Choose a production lesson harness explicitly");
  await mkdir(resolve(authoredRoot, ".dojo/handoffs"), { recursive: true });
  const evidenceRoot = await mkdtemp(resolve(authoredRoot, ".dojo/handoffs/run-"));
  const evidencePath = resolve(evidenceRoot, "evidence.json");
  console.log(`Production Sensei evidence: ${evidenceRoot}`);
  process.env.DOJOFOO_HOME = resolve(authoredRoot, ".dojo/handoff-state");
  process.env.DOJO_CLI ||= resolve(import.meta.dirname, "../../../../cli/dist/index.js");
  await access(process.env.DOJO_CLI); // Build the real CLI before spending inference.
  const manifest = parse(await readFile(resolve(authoredRoot, "dojo.yaml"), "utf8"));
  const lessons = lessonIds ? manifest.katas.filter((entry: { name: string }) => lessonIds.includes(entry.name)) : manifest.katas;
  assert.ok(lessons.length >= 1 && lessons.length <= 2, "Evaluate one lesson, or two lessons to check continuity");
  if (options?.turns) assert.equal(lessons.length, 1, "Focused teaching checks require one lesson");
  if (lessonIds) assert.equal(lessons.length, new Set(lessonIds).size, "Requested lesson is missing");
  // The learner's edits are separate, reviewed fixtures. They never enter the
  // teacher's system prompt and are applied only at the scripted learner stage.
  const learnerPath = options?.turns ? undefined : options?.fixturesPath ?? resolve(authoredRoot, ".dojo/learner-fixtures.json");
  const learner: Record<string, LearnerFixture> = learnerPath ? JSON.parse(await readFile(learnerPath, "utf8")) : {};
  const priorLessons = options?.priorLessons ?? "seed-completion";
  const evidence: unknown[] = [{ learnerProfile, priorLessons, maxTeachingQuestionReplies, harness: process.env.DOJOFOO_HARNESS, model: process.env.DOJOFOO_HANDOFF_MODEL, learnerPath, turnIntervalMs }];
  const persist = () => writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  await mkdir(process.env.DOJOFOO_HOME, { recursive: true });
  const trial = createLessonTrial(authoredRoot, lessons[0].name);
  const root = listWorkspaces().find(workspace => workspace.id === trial.workspaceId)?.path;
  if (!root) throw new Error("Production trial did not register its workspace");
  evidence.push({ trialWorkspace: root });
  await prepareWorkspace(root);
  const installedCourse = resolve(root, ".dojos", trial.courseId);
  const protectedMaterial = await readMaterial(installedCourse);
  await writeFile(resolve(evidenceRoot, "installed-material.json"), JSON.stringify(protectedMaterial, null, 2));
  if (options?.verifyFixtures && !options.turns) {
    try {
      const reports = await options.verifyFixtures(root, trial.courseId, learner, lessons.map((entry: { name: string }) => entry.name), signal);
      evidence.push({ fixturePreflight: "passed", reports });
    } catch (error) {
      evidence.push({ fixturePreflight: "failed", error: error instanceof Error ? error.message : String(error) });
      await persist();
      throw error;
    }
  }
  const sessions = new Set<string>();
  // Use the production coordinator route, not a stubbed completion tool.
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await runRoutes.request("http://localhost/", {
      method: request.method,
      headers: new Headers(Object.entries(request.headers).flatMap<[string, string]>(([key, value]) =>
        value === undefined ? [] : [[key, Array.isArray(value) ? value.join(",") : value]])),
      body: Buffer.concat(chunks),
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Coordinator did not bind");
  process.env.PORT = String(address.port);
  try {
    for (const entry of lessons) {
      const lessonId: string = entry.name;
      const fixture = learner[lessonId];
      if (!fixture && !options?.turns) throw new Error(`Missing reviewed learner edits for ${lessonId}`);
      // Earlier lessons are prior progress, not taught again: solve, check
      // (which records completion) and advance through the production services.
      if (entry !== lessons.at(-1) && priorLessons === "seed-completion") {
        await writeLessonFile(root, trial.courseId, lessonId, "solution", fixture.solved);
        const { observation } = await checkLesson(root, trial.courseId, lessonId);
        assert.equal(observation.report.complete, true, "Prior lesson's solved fixture must pass actual checks");
        const next = await nextLesson(root, { checkpointCurrent: false });
        assert.equal(next.kata, lessons[lessons.indexOf(entry) + 1]?.name, "Prior progress must open the evaluated lesson");
        evidence.push({ lessonId, fastForward: true, observation });
        await persist();
        continue;
      }
      const lesson = await startLessonSession(root, lessonId);
      if (process.env.DOJOFOO_HANDOFF_MODEL) await setLessonModel(root, lessonId, process.env.DOJOFOO_HANDOFF_MODEL);
      const configured = await getLesson(root, lessonId);
      evidence.push({ lessonId, sessionId: lesson.sessionId, model: configured?.model,
        configuration: lesson.sessionId ? acpClient.configuration(lesson.sessionId) : [],
      });
      await writeFile(resolve(evidenceRoot, `${lessonId}-instructions.md`), senseiInstructions({
        mode: manifest.mode ?? "katas",
        dojo: await readFile(resolve(authoredRoot, "DOJO.md"), "utf8"),
        sensei: await readLessonSensei(authoredRoot, entry.template),
      }));
      if (!lesson.sessionId) throw new Error("Production lesson did not create a session");
      assert.equal(sessions.has(lesson.sessionId), false, "Each lesson needs an isolated Sensei session");
      sessions.add(lesson.sessionId);
      let reviewChosen = false;
      let prompts = 0;
      let teachingQuestionReplies = 0;
      const nextLessonId = lessons[lessons.indexOf(entry) + 1]?.name;
      let navigatedLesson: string | undefined;
      const dialogue: LearnerDialogue = [];
      let previousTurnStarted: number | undefined;
      async function turn(stage: string, run: (collect: (part: AcpStreamPart) => void, signal: AbortSignal) => Promise<void>, learnerMessage?: string) {
        const wait = previousTurnStarted === undefined ? 0 : turnIntervalMs - (Date.now() - previousTurnStarted);
        if (wait > 0) await delay(wait, undefined, { signal });
        signal.throwIfAborted();
        previousTurnStarted = Date.now();
        if (learnerMessage) dialogue.push({ role: "user", content: learnerMessage });
        const parts: AcpStreamPart[] = [];
        const answers: Promise<unknown>[] = [];
        const snapshot = (await getLesson(root!, lessonId))!;
        const before = snapshot.code;
        const contextBeforeTurn = dojoLessonContext(snapshot);
        const answerController = new AbortController();
        const turnSignal = AbortSignal.any([signal, answerController.signal, AbortSignal.timeout(120_000)]);
        let answerFailure: unknown;
        let recordedTextLength = 0;
        const recordText = () => {
          const text = parts.flatMap(part => part.type === "text-delta" ? [part.delta] : []).join("");
          const fresh = text.slice(recordedTextLength);
          if (fresh.trim()) dialogue.push({ role: "assistant", content: fresh });
          recordedTextLength = text.length;
        };
        try {
          await run(part => {
            parts.push(part);
            if (part.type !== "tool-input-available" || part.toolName !== "elicitation") return;
            const input = part.input as { questions: UserQuestion[] };
            const completion = input.questions.length > 0 && input.questions.every(question =>
              question.options.length > 0 && question.options.every(option =>
                ["review", "move on", "pause"].includes(option.title.toLowerCase())));
            const publicText = parts.flatMap(part => part.type === "text-delta" ? [part.delta] : []).join("");
            const publicDialogue: LearnerDialogue = [...dialogue, ...(publicText.trim() ? [{ role: "assistant" as const, content: publicText }] : [])];
            // The production client registers its pending answer after emitting
            // the UI event; match a browser responding on the next microtask.
            answers.push(Promise.resolve().then(async () => {
              let selections: Record<string, string[]>;
              if (completion) {
                selections = {};
                const wanted = reviewChosen ? (nextLessonId ? "move on" : "pause") : "review";
                for (const question of input.questions) {
                  const option = question.options.find(option => option.title.toLowerCase() === wanted);
                  if (!option) throw new TeachingFailure(`Completion prompt omitted ${wanted} during ${stage}`);
                  selections[question.id] = [option.title];
                }
                prompts++;
                reviewChosen = true;
              } else {
                if (!options?.respondToQuestion) throw new Error(`Evaluation learner cannot answer teaching questions during ${stage}; configure respondToQuestion`);
                if (teachingQuestionReplies >= maxTeachingQuestionReplies) throw new Error(`Evaluation learner reached its ${maxTeachingQuestionReplies}-question reply limit`);
                teachingQuestionReplies++;
                selections = await options.respondToQuestion(input.questions, publicDialogue, before, turnSignal);
                for (const question of input.questions) {
                  const values = selections[question.id];
                  if (!values?.length || values.some(value => !value.trim() || (!question.allowOther && !question.options.some(option => option.title === value)))) {
                    throw new Error(`Evaluation learner returned an invalid answer for ${question.id}`);
                  }
                }
              }
              turnSignal.throwIfAborted();
              recordText();
              dialogue.push({ role: "assistant", content: JSON.stringify({ questions: input.questions }) });
              dialogue.push({ role: "user", content: JSON.stringify({ answers: selections }) });
              evidence.push({ lessonId, duringStage: stage, questionKind: completion ? "completion" : "teaching", questions: input.questions, selections });
              const result = await answerSenseiQuestion(root!, lessonId, selections);
              if (result && "kata" in result) navigatedLesson = result.kata;
              if (completion) evidence.push({ lessonId, completionChoices: selections, navigatedLesson });
            }).catch(error => {
              answerFailure = error;
              answerController.abort(error);
            }));
          }, turnSignal);
          await Promise.all(answers);
          if (answerFailure) throw answerFailure;
          // Some runtimes stream provider failures as agent text. That is an
          // infrastructure failure, never teaching evidence for the judges.
          const providerError = parts.flatMap(part => part.type === "text-delta" ? [part.delta] : []).join("")
            .match(/\{"type":"error","status":\d+[^\n]*/u)?.[0];
          if (providerError) throw new Error(`Teaching runtime returned a provider error during ${stage}: ${providerError}`);
          if ((await getLesson(root!, lessonId))!.code !== before) throw new TeachingFailure("Sensei edited learner code");
          if (!isDeepStrictEqual(await readMaterial(installedCourse), protectedMaterial)) throw new TeachingFailure("Sensei changed installed material");
        } catch (error) {
          await Promise.all(answers);
          throw answerFailure ?? error;
        } finally {
          recordText();
          evidence.push({ lessonId, stage, learnerMessage, contextBeforeTurn, parts, sourceBefore: before, sourceAfter: (await getLesson(root!, lessonId))?.code });
          await persist();
        }
      }
      const say = (stage: string, message: string) => turn(stage, (collect, signal) => streamSensei(root!, lessonId, message, collect, signal), message);
      await turn("introduction", (collect, signal) => streamLessonIntroduction(root!, lessonId, collect, signal));
      if (options?.turns) {
        for (const [index, input] of options.turns.entries()) {
          if (input.code !== undefined) await writeLessonFile(root, trial.courseId, lessonId, "solution", input.code);
          await say(`focused-${index + 1}`, input.message);
        }
        continue;
      }
      if (learnerProfile === "confident") {
        await writeLessonFile(root, trial.courseId, lessonId, "solution", fixture.solved);
        const answer = await options!.respondToReview!(dialogue, fixture.solved, signal);
        if (!answer.trim()) throw new Error("Confident learner returned an empty answer");
        await say("quick-understanding", answer);
      } else {
      await say("uncertainty", fixture.uncertainty ?? scriptedLearner("uncertainty"));
      await say("unfamiliar-terminology", fixture.terminology ?? scriptedLearner("unfamiliar-terminology"));
      await say("misconception", fixture.misconception);
      await writeLessonFile(root, trial.courseId, lessonId, "solution", fixture.wrong);
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { observation } = await checkLesson(root, trial.courseId, lessonId);
        evidence.push({ lessonId, attempt, observation });
        assert.ok(observation.report.failed > 0, "Incorrect fixture must fail actual checks");
        assert.equal(observation.attempt, attempt);
        await turn(`failure-${attempt}`, (collect, signal) => streamCheckObservation(root!, lessonId, observation, collect, signal));
      }
      await say("frustration", scriptedLearner("frustration"));
      await say("independence", scriptedLearner("independence"));
      }
      await writeLessonFile(root, trial.courseId, lessonId, "solution", fixture.solved);
      const { observation } = await checkLesson(root, trial.courseId, lessonId);
      evidence.push({ lessonId, stage: "success", observation });
      assert.ok(observation.report.total > 0, "Success requires executable checks");
      assert.equal(observation.report.complete, true, "Solved fixture must pass actual checks");
      await turn("success", (collect, signal) => streamCheckObservation(root!, lessonId, observation, collect, signal));
      // Review is a dialogue. Allow the simulated learner to answer the actual
      // question before requiring a renewed completion choice. This is bounded,
      // uses public content only, and never tells Sensei what the rubric wants.
      if (options?.respondToReview && prompts === 1) {
        for (let reply = 0; prompts < 2 && reply < 2; reply++) {
          const answer = await options.respondToReview(dialogue, (await getLesson(root, lessonId))!.code, signal);
          if (!answer.trim()) throw new Error("Review learner returned an empty answer");
          await say(reply === 0 ? "review" : "review-answer-2", answer);
        }
      } else {
        await say("review", fixture.review);
      }
      // Review must return control to a working completion choice, not leave
      // the learner stranded after the first answered dialog.
      if (prompts < 2) throw new TeachingFailure("Review must return to a completion choice");
      if (nextLessonId && navigatedLesson !== nextLessonId) {
        throw new TeachingFailure("Move on must open the next lesson");
      }
    }
    evidence.push({ deterministicLifecycle: options?.turns ? "not-evaluated" : "passed" });
  } catch (error) {
    evidence.push({ deterministicLifecycle: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await persist();
    acpClient.shutdown();
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  }
  return evidenceRoot;
}
