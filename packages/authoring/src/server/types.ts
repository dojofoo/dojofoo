export type AuthoringTranscriptMessage = {
  role: "user" | "assistant";
  text: string;
  kind?: "message" | "commentary" | "reasoning" | "tool" | "checkpoint" | "lesson-fragment";
  startedAt?: number;
  completedAt?: number;
};

export const AUTHORING_BOOTSTRAP_MARKER = "[dojo:begin-authoring]";
export const AUTHORING_BOOTSTRAP_PROMPT = "Begin this authoring session. Inspect the draft, summarize its current readiness in one sentence, then ask the single smallest open discovery question in prose. Do not invoke a tool during this hidden bootstrap turn; structured elicitation becomes available after the visible chat starts.";
export const AUTHORING_EDITS_MARKER = "[dojo:author-edits]";

export function isAuthoringBootstrapMessage(message: AuthoringTranscriptMessage): boolean {
  return message.role === "user" && (
    message.text.startsWith(AUTHORING_BOOTSTRAP_MARKER)
    || message.text === AUTHORING_BOOTSTRAP_PROMPT
  );
}

export function authoringMessageText(message: AuthoringTranscriptMessage): string {
  if (message.role !== "user" || !message.text.startsWith(AUTHORING_EDITS_MARKER)) {
    return message.text;
  }
  const newline = message.text.indexOf("\n");
  return newline < 0 ? "" : message.text.slice(newline + 1);
}

export function messageWithAuthoringEdits(message: string, paths: string[]): string {
  if (paths.length === 0) return message;
  return `${AUTHORING_EDITS_MARKER} ${JSON.stringify(paths)}\n${message}`;
}

export type AuthoringStreamPart =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-input-start"; toolCallId: string; toolName: string; dynamic: true }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown; dynamic: true }
  | { type: "tool-output-available"; toolCallId: string; output: unknown; dynamic: true };

export type AuthoringAgentConfiguration = {
  root: string;
  runtimeKey: string;
  harness: string;
  instructions: string;
};

export interface AuthoringAgent {
  currentHarness(): string;
  start(configuration: AuthoringAgentConfiguration): Promise<string>;
  resume(sessionId: string, configuration: AuthoringAgentConfiguration): Promise<void>;
  history(sessionId: string): Promise<AuthoringTranscriptMessage[]>;
  send(
    sessionId: string,
    message: string,
    onPart: (part: AuthoringStreamPart) => void,
    options?: { signal?: AbortSignal; visible?: boolean }
  ): Promise<unknown>;
  /** Resolves when the backend accepts the answer, not when its next turn finishes. */
  answer(sessionId: string, answers: Record<string, string[]>): void | Promise<void>;
}
