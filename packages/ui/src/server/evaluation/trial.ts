import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";
import { withPathLock, writeFileAtomic } from "@dojofoo/agent/file-guard";
import { dojoDir, readDojoMd } from "@dojofoo/config";
import { listWorkspaces } from "@dojofoo/config/local-state";
import { readAgentModel, resolveAgent } from "@dojofoo/config/runtime";
import type { LearnerDialogue, LearnerQuestion } from "@dojofoo/authoring/evaluation/learner";
import type { LearnerFixture } from "@dojofoo/authoring/evaluation/learner-fixtures";
import { readLessonMaterial, readMaterial } from "@dojofoo/authoring/evaluation/material";
import { scriptedLearner } from "@dojofoo/authoring/evaluation/prompts";
import { createLessonTrial } from "@dojofoo/authoring/service";
import { senseiSessionInstructions } from "@dojofoo/authoring/sensei/instructions";
import type { AgentId } from "@dojofoo/protocol";
import { takeNotices } from "../agent-session/guard-store";
import { launchToken } from "../launch-token";
import { loopbackOrigin } from "../loopback";
import { dojoLessonContext, lessonSource, readLesson, runLessonTests, solutionPath, type TestReport } from "../lesson/service";
import { httpChannel, type TrialChannel, type TrialTurn } from "./channel";
import { maxTeachingQuestionReplies, turnIntervalMs, turnTimeLimitMs } from "./limits";
import type { TrialRoles } from "./roles";

// TeachingFailure as evaluateAuthoredCourse sees it: evaluations.ts loads run.ts outside Vite's module graph, so this does too
const failures = () => createRequire(import.meta.url)("@dojofoo/authoring/evaluation/failure") as typeof import("@dojofoo/authoring/evaluation/failure");

const completionTitles = ["review", "move on", "pause"];

/** Each lesson's fixtures on the trial's install, before Sensei starts: `wrong` must fail a test and `solved` pass every test. The lesson
 *  file is written and restored inside its lock, or removed when it did not exist, so `advanceLesson` still scaffolds an unvisited
 *  lesson; nothing is recorded in .dojorc or web.json. */
async function verifyFixtures(root: string, courseId: string, fixtures: Record<string, LearnerFixture>, lessonIds: string[], signal: AbortSignal) {
  const reports: Array<{ lessonId: string; variant: "wrong" | "solved"; report: TestReport }> = [];
  for (const lessonId of lessonIds) {
    const fixture = fixtures[lessonId];
    if (!fixture) throw new Error(`Learner fixture preflight failed: ${lessonId}: no fixture was generated`);
    const path = solutionPath(root, courseId, lessonId);
    await withPathLock(path, async () => {
      const original = existsSync(path) ? await readFile(path) : undefined;
      await mkdir(dirname(path), { recursive: true });
      try {
        for (const variant of ["wrong", "solved"] as const) {
          signal.throwIfAborted();
          await writeFileAtomic(path, fixture[variant]);
          let report: TestReport;
          try { report = await runLessonTests(root, courseId, lessonId); }
          catch (error) { throw new Error(`Learner fixture preflight failed: ${lessonId}/${variant}: ${error instanceof Error ? error.message : String(error)}`); }
          reports.push({ lessonId, variant, report });
          if (report.total === 0) throw new Error(`Learner fixture preflight failed: ${lessonId}/${variant}: No executable tests`);
          if (variant === "wrong" && report.failed === 0) throw new Error(`Learner fixture preflight failed: ${lessonId}/wrong must fail an authored test`);
          if (variant === "solved" && (report.failed !== 0 || report.passed !== report.total)) {
            throw new Error(`Learner fixture preflight failed: ${lessonId}/solved must pass every authored test`);
          }
        }
      } finally {
        if (original === undefined) await unlink(path).catch(() => {});
        else await writeFileAtomic(path, original);
      }
    });
  }
  return reports;
}

/** One trial (D15): a throwaway learner install of the draft on its agent and model, the last requested lesson taught through the
 *  learner's own routes and an earlier one seeded as completed (step-7 plan, decision 3). The stages, questions, evidence and failure
 *  rules are the ACP worker's. Answers the trial's evidence folder. */
export async function runTrial(input: { draftRoot: string; lessonIds: string[]; signal: AbortSignal; roles: TrialRoles;
  /** <draft>/.dojo/handoffs/run-*, made by evaluations.run before evaluateAuthoredCourse and shared with the roles */
  evidenceRoot: string;
  /** Stops the trial's Sensei host; the AgentRuntime's stop, injected so this module does not import agent-api.ts */
  stopHost(workspaceId: string, agent: AgentId): Promise<void>;
  channel?: (trial: { workspaceId: string }) => TrialChannel }): Promise<string> {
  const { draftRoot, lessonIds, signal, roles, evidenceRoot } = input;
  const { TeachingFailure } = failures();
  signal.throwIfAborted();
  const interval = turnIntervalMs();
  const agent = resolveAgent(draftRoot);
  const model = readAgentModel(draftRoot, agent);
  const manifest = parse(await readFile(resolve(draftRoot, "dojo.yaml"), "utf8")) as { mode?: string };
  const evidencePath = resolve(evidenceRoot, "evidence.json");
  const evidence: unknown[] = [{ learnerProfile: "struggling", priorLessons: "seed-completion", maxTeachingQuestionReplies, harness: agent, model, turnIntervalMs: interval }];
  const persist = () => writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  const trial = createLessonTrial(draftRoot, lessonIds[0]!, { agent, ...(model ? { model } : {}), kind: "evaluation-trial" });
  const root = listWorkspaces().find(workspace => workspace.id === trial.workspaceId)?.path;
  if (!root) throw new Error("The evaluation trial did not register its workspace");
  const { courseId } = trial;
  evidence.push({ trialWorkspace: root });
  const channel = (input.channel ?? (({ workspaceId }) => httpChannel({ baseUrl: loopbackOrigin(), workspaceId, token: launchToken() })))({ workspaceId: trial.workspaceId });
  let sessionId: string | undefined;
  let failed = false;
  try {
    const installedCourse = dojoDir(root, courseId);
    const protectedMaterial = await readMaterial(installedCourse);
    await writeFile(resolve(evidenceRoot, "installed-material.json"), JSON.stringify(protectedMaterial, null, 2));
    const fixtures = await roles.fixtures(lessonIds, await readLessonMaterial(draftRoot, lessonIds), signal);
    try {
      evidence.push({ fixturePreflight: "passed", reports: await verifyFixtures(root, courseId, fixtures, lessonIds, signal) });
    } catch (error) {
      evidence.push({ fixturePreflight: "failed", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    // Earlier lessons are prior progress, not taught again: solved, checked (which records completion) and advanced, as a learner would
    for (const lessonId of lessonIds.slice(0, -1)) {
      await channel.save(courseId, lessonId, fixtures[lessonId]!.solved);
      const { observation } = await channel.check(courseId, lessonId, signal);
      if (!observation.report.complete) throw new Error("Prior lesson's solved fixture must pass actual checks");
      await channel.advance(courseId, lessonId);
      evidence.push({ lessonId, fastForward: true, observation });
      await persist();
    }
    const lessonId = lessonIds.at(-1)!;
    const fixture = fixtures[lessonId]!;
    const snapshot = async () => {
      const lesson = await readLesson(root, courseId, lessonId);
      if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
      return lesson;
    };
    const lesson = await snapshot();
    await writeFile(resolve(evidenceRoot, `${lessonId}-instructions.md`), senseiSessionInstructions({
      mode: manifest.mode === "interactive" ? "interactive" : "katas", guidance: readDojoMd(root, courseId),
      lesson: { source: lessonSource(root, courseId, lessonId), fragmentIds: Object.keys(lesson.fragments) },
    }));
    let completions = 0;
    let teachingQuestionReplies = 0;
    const dialogue: LearnerDialogue = [];
    let previousTurnStarted: number | undefined;
    const publicText = (parts: TrialTurn["parts"]) => parts.flatMap(part => part.type === "text-delta" ? [part.delta] : []).join("");
    /** One stage: the action's turn and every question it pauses on, answered and followed; then the turn's checks */
    async function turn(stage: string, action: (signal: AbortSignal) => Promise<TrialTurn>, learnerMessage?: string) {
      const wait = previousTurnStarted === undefined ? 0 : interval - (Date.now() - previousTurnStarted);
      if (wait > 0) await delay(wait, undefined, { signal });
      signal.throwIfAborted();
      previousTurnStarted = Date.now();
      if (learnerMessage) dialogue.push({ role: "user", content: learnerMessage });
      const before = await snapshot();
      const parts: TrialTurn["parts"] = [];
      let recorded = 0;
      const recordText = () => {
        const text = publicText(parts).slice(recorded);
        if (text.trim()) dialogue.push({ role: "assistant", content: text });
        recorded = publicText(parts).length;
      };
      // A turn, its questions and their answers are bounded as the worker bounded them
      const turnSignal = AbortSignal.any([signal, AbortSignal.timeout(turnTimeLimitMs)]);
      try {
        let current = await action(turnSignal);
        for (;;) {
          parts.push(...current.parts);
          if (current.budget) throw new Error("The trial reached its usage limit.");
          if (current.outcome === "failed") throw new Error(`Sensei's turn failed during ${stage}: ${current.error ?? "no error given"}`);
          if (current.outcome === "cancelled") throw signal.aborted ? signal.reason : new Error(`Sensei's turn was cancelled during ${stage}`);
          if (current.outcome !== "paused") break;
          const questions = current.questions ?? [];
          if (!questions.length) throw new Error(`Sensei's turn paused without a question during ${stage}`);
          const completion = questions.every(question => question.options.length > 0
            && question.options.every(option => completionTitles.includes(option.title.toLowerCase())));
          let selections: Record<string, string[]>;
          if (completion) {
            // The taught lesson is the request's last, so there is no next lesson to move on to (decision 41)
            const wanted = completions ? "pause" : "review";
            selections = {};
            for (const question of questions) {
              const option = question.options.find(option => option.title.toLowerCase() === wanted);
              if (!option) throw new TeachingFailure(`Completion prompt omitted ${wanted} during ${stage}`);
              selections[question.interactionId] = [option.title];
            }
            completions++;
          } else {
            if (teachingQuestionReplies >= maxTeachingQuestionReplies) throw new Error(`Evaluation learner reached its ${maxTeachingQuestionReplies}-question reply limit`);
            teachingQuestionReplies++;
            const asked: LearnerQuestion[] = questions.map(question => ({ id: question.interactionId, title: question.title,
              options: question.options.map(option => ({ title: option.title })), allowOther: question.allowOther }));
            const text = publicText(parts).slice(recorded);
            selections = await roles.answer(asked, [...dialogue, ...(text.trim() ? [{ role: "assistant" as const, content: text }] : [])], before.code, turnSignal);
            for (const question of questions) {
              const values = selections[question.interactionId];
              if (!values?.length || values.some(value => !value.trim() || (!question.allowOther && !question.options.some(option => option.title === value)))) {
                throw new Error(`Evaluation learner returned an invalid answer for ${question.interactionId}`);
              }
            }
          }
          recordText();
          dialogue.push({ role: "assistant", content: JSON.stringify({ questions }) });
          dialogue.push({ role: "user", content: JSON.stringify({ answers: selections }) });
          evidence.push({ lessonId, duringStage: stage, questionKind: completion ? "completion" : "teaching", questions, selections });
          if (completion) evidence.push({ lessonId, completionChoices: selections });
          current = await channel.answer(sessionId!, questions.map(question => {
            const value = selections[question.interactionId]![0]!;
            const option = question.options.find(option => option.title === value);
            return option ? { interactionId: question.interactionId, optionId: option.id } : { interactionId: question.interactionId, text: selections[question.interactionId]!.join("\n") };
          }), turnSignal);
        }
        // Some runtimes stream provider failures as agent text: an infrastructure failure, never teaching evidence for the judges
        const providerError = publicText(parts).match(/\{"type":"error","status":\d+[^\n]*/u)?.[0];
        if (providerError) throw new Error(`Teaching runtime returned a provider error during ${stage}: ${providerError}`);
        // The guard has restored the file already; its notice is the only trace of the write (decision 17)
        if ((await takeNotices(root!, courseId, lessonId)).length) throw new TeachingFailure("Sensei edited learner code");
        if (!isDeepStrictEqual(await readMaterial(installedCourse), protectedMaterial)) throw new TeachingFailure("Sensei changed installed material");
      } finally {
        recordText();
        evidence.push({ lessonId, stage, learnerMessage, contextBeforeTurn: dojoLessonContext(before), parts, sourceBefore: before.code,
          sourceAfter: (await readLesson(root!, courseId, lessonId))?.code });
        await persist();
      }
    }
    const say = (stage: string, message: string) => turn(stage, signal => channel.send(sessionId!, message, signal), message);
    await turn("introduction", async signal => {
      const opened = await channel.open(courseId, lessonId, signal);
      sessionId = opened.sessionId;
      evidence.push({ lessonId, sessionId, model });
      return opened.turn;
    });
    await say("uncertainty", fixture.uncertainty ?? scriptedLearner("uncertainty"));
    await say("unfamiliar-terminology", fixture.terminology ?? scriptedLearner("unfamiliar-terminology"));
    await say("misconception", fixture.misconception);
    await channel.save(courseId, lessonId, fixture.wrong);
    for (let attempt = 1; attempt <= 2; attempt++) {
      await turn(`failure-${attempt}`, async signal => {
        const { observation, turn } = await channel.check(courseId, lessonId, signal, sessionId);
        evidence.push({ lessonId, attempt, observation });
        if (!(observation.report.failed > 0)) throw new Error("Incorrect fixture must fail actual checks");
        if (observation.attempt !== attempt) throw new Error(`The incorrect fixture's check counted as attempt ${observation.attempt}, not ${attempt}`);
        return turn!;
      });
    }
    await say("frustration", scriptedLearner("frustration"));
    await say("independence", scriptedLearner("independence"));
    await channel.save(courseId, lessonId, fixture.solved);
    await turn("success", async signal => {
      const { observation, turn } = await channel.check(courseId, lessonId, signal, sessionId);
      evidence.push({ lessonId, stage: "success", observation });
      if (!(observation.report.total > 0)) throw new Error("Success requires executable checks");
      if (!observation.report.complete) throw new Error("Solved fixture must pass actual checks");
      return turn!;
    });
    // Review is a dialogue: the simulated learner answers the actual review, at most twice, before a renewed completion choice.
    // It uses public content only and never tells Sensei what the rubric wants.
    if (completions === 1) {
      for (let reply = 0; completions < 2 && reply < 2; reply++) {
        const answer = await roles.reply(dialogue, (await snapshot()).code, signal);
        await say(reply === 0 ? "review" : "review-answer-2", answer);
      }
    } else {
      await say("review", fixture.review);
    }
    // Review must return control to a working completion choice, not leave the learner stranded after the first answered question
    if (completions < 2) throw new TeachingFailure("Review must return to a completion choice");
    evidence.push({ deterministicLifecycle: "passed" });
  } catch (error) {
    failed = true;
    evidence.push({ deterministicLifecycle: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await persist();
    // An aborted or failed trial leaves no turn running; the trial's host stops either way (design, "Persona hosts")
    if (failed && sessionId) await channel.cancel(sessionId).catch(() => {});
    await input.stopHost(trial.workspaceId, agent).catch(error =>
      console.warn(`Could not stop the evaluation trial's host: ${error instanceof Error ? error.message : String(error)}`));
  }
  return evidenceRoot;
}
