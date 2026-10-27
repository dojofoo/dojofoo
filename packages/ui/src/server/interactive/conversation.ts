import { resolve } from "node:path";
import type { UIMessage } from "@tanstack/ai-client";
import { acpClient, type AcpStreamPart, type SessionModelConfiguration } from "../lesson/codex-client";
import { transcriptToUIMessages } from "../lesson/service";
import { dojofooHarness } from "../harness/registry";
import {
  getInteractiveLesson, readInteractiveConversation, writeInteractiveConversation,
  type InteractiveConversationBinding,
} from "./service";

export type InteractiveConversation = {
  sessionId: string | null;
  messages: UIMessage[];
  model: SessionModelConfiguration | null;
};

const instructions = `You are Sensei, the learner's tutor for an interactive Dojofoo course.
Use the current authored step, material and saved answer supplied with each turn.
Give short, practical guidance and help the learner reason before revealing an answer.
The learner advances and submits answers through the course controls. Do not claim to have changed progress.
This course has no kata code editor or test runner. Do not invent code files, checks, tool results or app capabilities.
Do not edit the installed tutorial or course source. If authoring is requested, explain the independent draft workflow.`;

function configuration(root: string, dojo: string, binding?: InteractiveConversationBinding) {
  return {
    root,
    runtimeKey: `interactive:${resolve(root)}:${dojo}`,
    harness: binding?.harness ?? dojofooHarness(),
    developerInstructions: instructions,
    toolProfile: "none" as const,
  };
}

async function resume(root: string, dojo: string, binding: InteractiveConversationBinding) {
  await acpClient.resumeThread(binding.sessionId, configuration(root, dojo, binding));
  if (binding.model && acpClient.modelConfiguration(binding.sessionId)?.currentValue !== binding.model) {
    await acpClient.setModel(binding.sessionId, binding.model);
  }
}

export async function getInteractiveConversation(root: string, dojo: string): Promise<InteractiveConversation> {
  getInteractiveLesson(root, dojo);
  const binding = readInteractiveConversation(root, dojo);
  if (!binding) return { sessionId: null, messages: [], model: null };
  await resume(root, dojo, binding);
  return {
    sessionId: binding.sessionId,
    messages: transcriptToUIMessages(await acpClient.history(binding.sessionId), binding.sessionId),
    model: acpClient.modelConfiguration(binding.sessionId),
  };
}

const starting = new Map<string, Promise<InteractiveConversationBinding>>();
async function session(root: string, dojo: string): Promise<InteractiveConversationBinding> {
  const saved = readInteractiveConversation(root, dojo);
  if (saved) { await resume(root, dojo, saved); return saved; }
  const config = configuration(root, dojo);
  const pending = starting.get(config.runtimeKey);
  if (pending) return pending;
  const creation = (async () => {
    const sessionId = await acpClient.startThread(config);
    const binding = { sessionId, harness: config.harness };
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
  const lesson = getInteractiveLesson(root, dojo);
  const binding = await session(root, dojo);
  await acpClient.send(binding.sessionId, message, onPart, {
    signal,
    context: [{
      uri: `dojo://courses/${encodeURIComponent(dojo)}/interactive/context`,
      mimeType: "application/json",
      text: JSON.stringify(lesson),
    }],
  });
}

export async function setInteractiveModel(root: string, dojo: string, value: string): Promise<SessionModelConfiguration> {
  getInteractiveLesson(root, dojo);
  const binding = readInteractiveConversation(root, dojo);
  if (!binding) throw new Error("Start a Sensei conversation before changing its model.");
  await resume(root, dojo, binding);
  const model = await acpClient.setModel(binding.sessionId, value);
  writeInteractiveConversation(root, dojo, { ...binding, model: value });
  return model;
}

export function answerInteractiveSensei(root: string, dojo: string, answers: Record<string, string[]>): void {
  getInteractiveLesson(root, dojo);
  const binding = readInteractiveConversation(root, dojo);
  if (!binding) throw new Error("No active Sensei conversation.");
  acpClient.answerUserInput(binding.sessionId, answers);
}
