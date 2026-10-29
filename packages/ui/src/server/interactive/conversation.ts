import { resolve } from "node:path";
import type { UIMessage } from "@tanstack/ai-client";
import { acpClient, type AcpStreamPart, type SessionModelConfiguration } from "../lesson/codex-client";
import { transcriptToUIMessages } from "../lesson/service";
import { resolveRuntimeHarness } from "@dojofoo/config/runtime";
import { readDojoMd } from "@dojofoo/config";
import { dojofooHarness, lessonHarnesses } from "../harness/registry";
import {
  getInteractiveLesson, readInteractiveConversation, writeInteractiveConversation,
  type InteractiveConversationBinding,
} from "./service";

export type InteractiveConversation = {
  sessionId: string | null;
  messages: UIMessage[];
  model: SessionModelConfiguration | null;
  harness?: string;
  harnesses?: typeof lessonHarnesses;
};

const instructions = `You are Sensei, the learner's tutor for an interactive Dojofoo course.
Use the current authored step, material and saved answer supplied with each turn.
Give short, practical guidance and help the learner reason before revealing an answer.
The learner advances and submits answers through the course controls. Do not claim to have changed progress.
This course has no kata code editor or test runner. Do not invent code files, checks, tool results or app capabilities.
Do not edit the installed tutorial or course source. If authoring is requested, explain the independent draft workflow.`;

// Native agents may keep an unused thread only in memory until its first prompt.
const runtimeOwner = crypto.randomUUID();

function configuration(root: string, dojo: string, binding?: Pick<InteractiveConversationBinding, "harness">) {
  const harness = binding?.harness ?? dojofooHarness({ DOJOFOO_HARNESS: resolveRuntimeHarness("lesson", root) });
  return {
    root,
    runtimeKey: `interactive:${resolve(root)}:${dojo}:${harness}`,
    harness,
    developerInstructions: instructions,
    toolProfile: "none" as const,
  };
}

async function resume(root: string, dojo: string, binding: InteractiveConversationBinding) {
  if (binding.pendingRuntime && binding.pendingRuntime !== runtimeOwner) throw new Error("This coding agent has no saved conversation yet. Select it again or send your first message.");
  await acpClient.resumeThread(binding.sessionId, configuration(root, dojo, binding));
  if (binding.model && acpClient.modelConfiguration(binding.sessionId)?.currentValue !== binding.model) {
    await acpClient.setModel(binding.sessionId, binding.model);
  }
}

export async function getInteractiveConversation(root: string, dojo: string): Promise<InteractiveConversation> {
  getInteractiveLesson(root, dojo);
  const binding = readInteractiveConversation(root, dojo);
  if (!binding || (binding.pendingRuntime && binding.pendingRuntime !== runtimeOwner)) return {
    sessionId: null, messages: [], model: null, harness: binding?.harness ?? resolveRuntimeHarness("lesson", root), harnesses: lessonHarnesses,
  };
  await resume(root, dojo, binding);
  return conversationSnapshot(binding);
}

async function conversationSnapshot(binding: InteractiveConversationBinding): Promise<InteractiveConversation> {
  return {
    harness: binding.harness, harnesses: lessonHarnesses,
    sessionId: binding.sessionId,
    messages: transcriptToUIMessages(await acpClient.history(binding.sessionId), binding.sessionId),
    model: acpClient.modelConfiguration(binding.sessionId),
  };
}

const selecting = new Map<string, { harness: string; promise: Promise<InteractiveConversation> }>();
const activeOperations = new Set<string>();
const scope = (root: string, dojo: string) => `interactive:${resolve(root)}:${dojo}`;

/** Selecting an agent never sends a turn or overwrites another agent's native session. */
export async function selectInteractiveHarness(root: string, dojo: string, value: string): Promise<InteractiveConversation> {
  if (!value.trim()) throw new Error("Select a supported coding agent.");
  const harness = dojofooHarness({ DOJOFOO_HARNESS: value });
  if (!lessonHarnesses.includes(harness)) throw new Error("Select a supported coding agent.");
  getInteractiveLesson(root, dojo);
  const key = scope(root, dojo);
  if (activeOperations.has(key)) throw new Error("The conversation is busy. Wait for the current turn or cancel it first.");
  const pending = selecting.get(key);
  if (pending) {
    if (pending.harness !== harness) throw new Error("The conversation is busy changing coding agents.");
    return pending.promise;
  }
  const promise = (async () => {
    let binding = readInteractiveConversation(root, dojo, harness);
    if (binding && (!binding.pendingRuntime || binding.pendingRuntime === runtimeOwner)) await resume(root, dojo, binding);
    else {
      const model = binding?.model;
      binding = { sessionId: await acpClient.startThread(configuration(root, dojo, { harness })), harness, pendingRuntime: runtimeOwner, ...(model ? { model } : {}) };
      if (model) await acpClient.setModel(binding.sessionId, model);
    }
    const snapshot = await conversationSnapshot(binding);
    writeInteractiveConversation(root, dojo, binding);
    return snapshot;
  })();
  selecting.set(key, { harness, promise });
  try { return await promise; }
  finally { selecting.delete(key); }
}

const starting = new Map<string, Promise<InteractiveConversationBinding>>();
async function session(root: string, dojo: string): Promise<InteractiveConversationBinding> {
  const saved = readInteractiveConversation(root, dojo);
  if (saved && (!saved.pendingRuntime || saved.pendingRuntime === runtimeOwner)) { await resume(root, dojo, saved); return saved; }
  const config = configuration(root, dojo, saved);
  const pending = starting.get(config.runtimeKey);
  if (pending) return pending;
  const creation = (async () => {
    const sessionId = await acpClient.startThread(config);
    const binding = { sessionId, harness: config.harness, ...(saved?.model ? { model: saved.model } : {}) };
    if (binding.model) await acpClient.setModel(sessionId, binding.model);
    writeInteractiveConversation(root, dojo, binding);
    return binding;
  })();
  starting.set(config.runtimeKey, creation);
  try { return await creation; }
  finally { starting.delete(config.runtimeKey); }
}

export async function streamInteractiveSensei(
  root: string, dojo: string, message: string, onPart: (part: AcpStreamPart) => void, signal?: AbortSignal,
): Promise<void> {
  const key = scope(root, dojo);
  if (selecting.has(key) || activeOperations.has(key)) throw new Error("The conversation is busy. Wait for the current operation to finish.");
  activeOperations.add(key);
  try {
    const lesson = getInteractiveLesson(root, dojo);
    const guidance = readDojoMd(root, dojo);
    const binding = await session(root, dojo);
    if (binding.pendingRuntime) {
      const submitted = { ...binding };
      delete submitted.pendingRuntime;
      // Preserve the ID even if transport fails after submission: never replay an uncertain turn.
      writeInteractiveConversation(root, dojo, submitted);
    }
    await acpClient.send(binding.sessionId, message, onPart, {
      signal,
      context: [{
        uri: `dojo://courses/${encodeURIComponent(dojo)}/interactive/context`,
        mimeType: "application/json",
        text: JSON.stringify(lesson),
      }, ...(guidance.trim() ? [{
        uri: `dojo://courses/${encodeURIComponent(dojo)}/interactive/guidance`,
        mimeType: "text/markdown", text: guidance,
      }] : [])],
    });
  } finally { activeOperations.delete(key); }
}

export async function setInteractiveModel(root: string, dojo: string, value: string): Promise<SessionModelConfiguration> {
  const key = scope(root, dojo);
  if (selecting.has(key) || activeOperations.has(key)) throw new Error("The conversation is busy. Wait for the current operation to finish.");
  activeOperations.add(key);
  try {
    getInteractiveLesson(root, dojo);
    const binding = readInteractiveConversation(root, dojo);
    if (!binding) throw new Error("Start a Sensei conversation before changing its model.");
    await resume(root, dojo, binding);
    const model = await acpClient.setModel(binding.sessionId, value);
    writeInteractiveConversation(root, dojo, { ...binding, model: value });
    return model;
  } finally { activeOperations.delete(key); }
}

export function answerInteractiveSensei(root: string, dojo: string, answers: Record<string, string[]>): void {
  getInteractiveLesson(root, dojo);
  const binding = readInteractiveConversation(root, dojo);
  if (!binding) throw new Error("No active Sensei conversation.");
  acpClient.answerUserInput(binding.sessionId, answers);
}
