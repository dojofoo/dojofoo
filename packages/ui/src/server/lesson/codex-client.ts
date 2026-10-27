import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import type { HarnessAdapter, HarnessKind } from "../harness/adapter";
import { harnessAdapter } from "../harness/registry";
/** Host-authored turn starters from contracts/TURNS.md (`begin`, `checks-ran`);
 * never shown as learner messages. Kept free of Markdown imports so plain tsx
 * scripts can load this client; a unit test keeps it equal to TURNS.md. */
export const hiddenTurnTexts = ["Begin the lesson.", "Ran lesson checks."] as const;
const hiddenTurns = new Set<string>(hiddenTurnTexts);
import { runCoordinator, type RunQuestion } from "../run/coordinator";

export type TranscriptMessage = {
  role: "user" | "assistant";
  text: string;
  kind?: "message" | "commentary" | "reasoning" | "tool" | "checkpoint" | "lesson-fragment";
  startedAt?: number;
  completedAt?: number;
};

export type AcpStreamPart =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-input-start"; toolCallId: string; toolName: string; dynamic: true }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown; dynamic: true }
  | { type: "tool-output-available"; toolCallId: string; output: unknown; dynamic: true };

export type SessionModelConfiguration = {
  id: string;
  name: string;
  currentValue: string;
  options: Array<{ value: string; name: string; description?: string; group?: string }>;
};

export type UserQuestion = {
  id: string;
  title: string;
  options: Array<{ id: string; title: string; description?: string }>;
  allowOther: boolean;
  secret: boolean;
};

type PendingPermission =
  | { resolve: (response: acp.RequestPermissionResponse) => void; toolCallId: string; kind: "permission"; options: acp.RequestPermissionRequest["options"] }
  | { resolve: (response: acp.CreateElicitationResponse) => void; toolCallId: string; kind: "elicitation" }
  | { resolve: (answers: Record<string, string[]>) => void; toolCallId: string; kind: "run-question" };

type PromptOptions = {
  context?: Array<{ uri: string; mimeType: string; text: string }>;
  signal?: AbortSignal;
  visible?: boolean;
};

type RuntimeConfiguration = {
  root: string;
  runtimeKey: string;
  harness?: HarnessKind;
  developerInstructions: string;
  lessonContext?: () => Promise<unknown> | unknown;
  lessonFragment?: (fragmentId: string) => Promise<{ fragmentId: string }> | { fragmentId: string };
  learnerObservation?: (input: unknown) => Promise<unknown> | unknown;
  lessonTools?: boolean;
  toolProfile?: "lesson" | "authoring" | "none";
};

interface AcpRuntime {
  adapter: HarnessAdapter;
  child: ReturnType<typeof spawn> | null;
  connection: acp.ClientSideConnection | null;
  harness: HarnessKind;
  root: string;
  developerInstructions: string;
  lessonContext: () => Promise<unknown> | unknown;
  lessonFragment: (fragmentId: string) => Promise<{ fragmentId: string }> | { fragmentId: string };
  learnerObservation?: RuntimeConfiguration["learnerObservation"];
  capability: string;
  loadedSessions: Set<string>;
  loadingSessions: Map<string, Promise<void>>;
  ready: Promise<void> | null;
  promptCapabilities?: acp.PromptCapabilities;
}

type SessionBinding = { runtimeKey: string; root: string };

export function promptContextBlock(
  adapter: HarnessAdapter,
  capabilities: acp.PromptCapabilities | undefined,
  resource: { uri: string; mimeType: string; text: string },
): acp.ContentBlock {
  const text = adapter.encodeResource(resource);
  const canEmbed = capabilities?.embeddedContext === true
    && adapter.supportsVirtualResourceUris !== false;
  return canEmbed
    ? { type: "resource", resource: { uri: resource.uri, mimeType: resource.mimeType, text } }
    : { type: "text", text };
}


/**
 * Harness-neutral ACP client. Harnesses own their native sessions and history;
 * Dojofoo only projects their standard ACP event stream.
 */
export class AcpClient {
  private readonly inactivityTimeoutMs: number;
  private runtimes = new Map<string, AcpRuntime>();
  private sessions = new Map<string, SessionBinding>();
  private sessionConfigOptions = new Map<string, acp.SessionConfigOption[]>();
  private contextualizedSessions = new Set<string>();
  private transcripts = new Map<string, TranscriptMessage[]>();
  private callbacks = new Map<string, (part: AcpStreamPart) => void>();
  private permissions = new Map<string, PendingPermission>();
  private turnStartedAt = new Map<string, number>();
  private activeTurns = new Set<string>();
  private turnActivity = new Map<string, () => void>();
  private toolCalls = new Map<string, Map<string, {
    command?: string;
    input: unknown;
    transcriptIndex: number;
    output: string;
    title: string;
  }>>();
  private openParts = new Map<string, {
    text?: string;
    textBuffer?: string;
    textSuppressed?: boolean;
    reasoning?: string;
  }>();

  constructor(inactivityTimeoutMs = Number(process.env.DOJOFOO_AGENT_TIMEOUT_MS ?? 45_000)) {
    this.inactivityTimeoutMs = inactivityTimeoutMs;
  }

  shutdown(): void {
    for (const runtime of this.runtimes.values()) {
      runCoordinator.detach(runtime.capability);
      runtime.child?.kill();
      runtime.connection = null;
      runtime.child = null;
      runtime.ready = null;
      runtime.loadedSessions.clear();
      runtime.loadingSessions.clear();
    }
    this.runtimes.clear();
    this.sessionConfigOptions.clear();
    this.contextualizedSessions.clear();
  }

  async startThread(configuration: RuntimeConfiguration): Promise<string> {
    const connection = await this.ensureRuntime(configuration);
    const session = await connection.newSession({
      cwd: configuration.root,
      mcpServers: dojoMcpServers(configuration.root, this.runtime(configuration.runtimeKey).capability, toolProfile(configuration)),
    });
    const configured = await this.runtime(configuration.runtimeKey).adapter.configureSession(
      connection,
      session.sessionId,
      session.configOptions,
    );
    this.sessionConfigOptions.set(session.sessionId, configured ?? session.configOptions ?? []);
    this.sessions.set(session.sessionId, { root: configuration.root, runtimeKey: configuration.runtimeKey });
    this.contextualizedSessions.delete(session.sessionId);
    this.runtime(configuration.runtimeKey).loadedSessions.add(session.sessionId);
    this.transcripts.set(session.sessionId, []);
    return session.sessionId;
  }

  async resumeThread(threadId: string, configuration?: RuntimeConfiguration): Promise<void> {
    const resolvedConfiguration = configuration ?? {
      root: this.sessions.get(threadId)?.root ?? "",
      runtimeKey: `adopted:${threadId}`,
      harness: "codex",
      developerInstructions: "",
    };
    const connection = await this.ensureRuntime(resolvedConfiguration);
    const runtime = this.runtime(resolvedConfiguration.runtimeKey);
    let root = resolvedConfiguration.root || this.sessions.get(threadId)?.root;
    if (!root) {
      let cursor: string | null | undefined;
      do {
        const page = await connection.listSessions({ cursor });
        const session = page.sessions.find((candidate) => candidate.sessionId === threadId);
        if (session?.cwd) {
          root = session.cwd;
          break;
        }
        cursor = page.nextCursor;
      } while (cursor);
    }
    if (!root) throw new Error(`The workspace for ACP session ${threadId} is unknown`);
    this.sessions.set(threadId, { root, runtimeKey: resolvedConfiguration.runtimeKey });
    if (runtime.loadedSessions.has(threadId)) return;
    const inFlight = runtime.loadingSessions.get(threadId);
    if (inFlight) return inFlight;
    this.transcripts.set(threadId, []);
    const loading = connection.loadSession({
      sessionId: threadId,
      cwd: root,
      mcpServers: dojoMcpServers(root, runtime.capability, toolProfile(resolvedConfiguration)),
    }).then(async (response) => {
      const configured = await runtime.adapter.configureSession(connection, threadId, response.configOptions);
      this.sessionConfigOptions.set(threadId, configured ?? response.configOptions ?? []);
      runtime.loadedSessions.add(threadId);
    }).finally(() => {
      runtime.loadingSessions.delete(threadId);
    });
    runtime.loadingSessions.set(threadId, loading);
    await loading;
  }

  async send(
    threadId: string,
    text: string,
    onPart?: (part: AcpStreamPart) => void,
    options: PromptOptions = {},
  ): Promise<string> {
    if (this.activeTurns.has(threadId)) {
      throw new Error("The lesson agent is already responding. Wait for the current turn to finish or cancel it before sending another message.");
    }
    const session = this.sessions.get(threadId);
    if (!session) throw new Error(`The lesson runtime for ACP session ${threadId} is unknown`);
    const runtime = this.runtime(session.runtimeKey);
    const connection = await this.ensureRuntime({
      root: session.root,
      runtimeKey: session.runtimeKey,
      developerInstructions: runtime.developerInstructions,
    });
    // loadSession replays ACP chunks without a browser callback. They may
    // leave an open part ID behind, but that ID was never announced to the
    // next AI SDK stream. Close replay state before attaching a live writer.
    this.finishOpenParts(threadId);
    if (onPart) this.callbacks.set(threadId, onPart);
    this.activeTurns.add(threadId);
    const cancel = () => { void connection.cancel({ sessionId: threadId }); };
    options.signal?.addEventListener("abort", cancel, { once: true });
    const startedAt = Date.now();
    this.turnStartedAt.set(threadId, startedAt);
    if (options.visible !== false) this.transcript(threadId).push({ role: "user", text, startedAt, completedAt: startedAt });
    const responseStart = this.transcript(threadId).length;
    const contextBlock = (resource: { uri: string; mimeType: string; text: string }) =>
      promptContextBlock(runtime.adapter, runtime.promptCapabilities, resource);
    const includeInstructions = runtime.adapter?.contextualInstructions === true
      && !this.contextualizedSessions.has(threadId);
    if (includeInstructions) this.contextualizedSessions.add(threadId);
    const prompt: acp.ContentBlock[] = [
      ...(includeInstructions ? [contextBlock({
        uri: "dojo://sensei/instructions",
        mimeType: "text/markdown",
        text: runtime.developerInstructions,
      })] : []),
      ...(options.context ?? []).map(contextBlock),
      { type: "text", text },
    ];
    try {
      if (options.signal?.aborted) throw options.signal.reason;
      const response = await this.promptWithInactivityTimeout(connection, runtime.harness, threadId, prompt);
      runtime.adapter?.validatePromptResponse?.(response);
      if (options.visible !== false && !options.signal?.aborted && this.transcript(threadId).length === responseStart) {
        throw new Error(
          `${runtime.harness} completed the ACP turn without returning any output. `
          + "Its model provider may have rejected the request; check the harness model and authentication.",
        );
      }
      return this.transcript(threadId).filter((entry) => entry.role === "assistant" && entry.kind === "message").at(-1)?.text ?? "";
    } finally {
      options.signal?.removeEventListener("abort", cancel);
      this.activeTurns.delete(threadId);
      this.finishOpenParts(threadId);
      const completedAt = Date.now();
      for (const entry of this.transcript(threadId)) {
        if (entry.role === "assistant" && entry.startedAt === startedAt && entry.completedAt === undefined) {
          entry.completedAt = completedAt;
        }
      }
      this.turnStartedAt.delete(threadId);
      if (onPart && this.callbacks.get(threadId) === onPart) this.callbacks.delete(threadId);
    }
  }

  private async promptWithInactivityTimeout(
    connection: acp.ClientSideConnection,
    harness: HarnessKind,
    sessionId: string,
    prompt: acp.ContentBlock[],
  ): Promise<acp.PromptResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectTimeout!: (cause: Error) => void;
    const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
    const touch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (this.permissions.has(sessionId)) {
          touch();
          return;
        }
        void connection.cancel({ sessionId });
        rejectTimeout(new Error(
          `${harness} produced no ACP activity for ${Math.ceil(this.inactivityTimeoutMs / 1000)} seconds. `
          + "Its model provider may be unavailable, unauthenticated, or rate-limited.",
        ));
      }, this.inactivityTimeoutMs);
      timer.unref?.();
    };
    this.turnActivity.set(sessionId, touch);
    touch();
    try {
      return await Promise.race([connection.prompt({ sessionId, prompt }), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      this.turnActivity.delete(sessionId);
    }
  }

  async checkpoint(threadId: string): Promise<void> {
    await this.send(threadId, "/compact", undefined, { visible: false });
  }

  async history(threadId: string): Promise<TranscriptMessage[]> {
    return [...this.transcript(threadId)];
  }

  configuration(threadId: string): acp.SessionConfigOption[] {
    return structuredClone(this.sessionConfigOptions.get(threadId) ?? []);
  }

  modelConfiguration(threadId: string): SessionModelConfiguration | null {
    const configOptions = this.sessionConfigOptions.get(threadId) ?? [];
    const option = configOptions.find((candidate) => candidate.type === "select" && candidate.id === "model")
      ?? configOptions.find((candidate) => candidate.type === "select" && candidate.category === "model");
    if (!option || option.type !== "select") return null;
    const options = option.options.flatMap((candidate) => "options" in candidate
      ? candidate.options.map((value) => ({
          value: value.value,
          name: value.name,
          ...(value.description ? { description: value.description } : {}),
          group: candidate.name,
        }))
      : [{
          value: candidate.value,
          name: candidate.name,
          ...(candidate.description ? { description: candidate.description } : {}),
        }]);
    return { id: option.id, name: option.name, currentValue: option.currentValue, options };
  }

  async setModel(threadId: string, value: string): Promise<SessionModelConfiguration> {
    const session = this.sessions.get(threadId);
    if (!session) throw new Error(`The lesson runtime for ACP session ${threadId} is unknown`);
    const current = this.modelConfiguration(threadId);
    if (!current) throw new Error("This harness does not advertise an ACP model selector");
    if (!current.options.some((option) => option.value === value)) throw new Error(`Unknown harness model: ${value}`);
    const runtime = this.runtime(session.runtimeKey);
    const connection = await this.ensureRuntime({
      root: session.root,
      runtimeKey: session.runtimeKey,
      developerInstructions: runtime.developerInstructions,
    });
    const configured = await runtime.adapter.setModel(connection, threadId, value);
    if (configured) this.sessionConfigOptions.set(threadId, configured);
    else {
      const options = this.sessionConfigOptions.get(threadId) ?? [];
      this.sessionConfigOptions.set(threadId, options.map((option) =>
        option.type === "select" && option.id === current.id ? { ...option, currentValue: value } : option
      ));
    }
    const updated = this.modelConfiguration(threadId);
    if (!updated) throw new Error("The harness removed its ACP model selector");
    return updated;
  }

  answerUserInput(threadId: string, answers: Record<string, string[]>): void {
    const pending = this.permissions.get(threadId);
    if (!pending) throw new Error("The agent is not waiting for an answer");
    const values = Object.values(answers).flat();
    if (pending.kind === "run-question") {
      pending.resolve(answers);
    } else if (pending.kind === "elicitation") {
      pending.resolve({
        action: "accept",
        content: Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, value.length === 1 ? value[0] : value])),
      });
    } else {
      const selected = pending.options.find(option => option.optionId === values[0]);
      pending.resolve({ outcome: selected
        ? { outcome: "selected", optionId: selected.optionId }
        : { outcome: "cancelled" } });
    }
    this.callbacks.get(threadId)?.({
      type: "tool-output-available",
      toolCallId: pending.toolCallId,
      output: { answers },
      dynamic: true,
    });
    this.permissions.delete(threadId);
    this.turnActivity.get(threadId)?.();
  }

  private transcript(sessionId: string): TranscriptMessage[] {
    const transcript = this.transcripts.get(sessionId) ?? [];
    this.transcripts.set(sessionId, transcript);
    return transcript;
  }

  private runtime(runtimeKey: string): AcpRuntime {
    const runtime = this.runtimes.get(runtimeKey);
    if (!runtime) throw new Error(`Unknown lesson runtime: ${runtimeKey}`);
    return runtime;
  }

  private async ensureRuntime(configuration: RuntimeConfiguration): Promise<acp.ClientSideConnection> {
    let runtime = this.runtimes.get(configuration.runtimeKey);
    if (runtime && runtime.developerInstructions !== configuration.developerInstructions) {
      runtime.child?.kill();
      runCoordinator.detach(runtime.capability);
      runtime = undefined;
      this.runtimes.delete(configuration.runtimeKey);
    }
    if (!runtime) {
      runtime = {
        adapter: harnessAdapter(configuration.harness ?? "codex"),
        child: null,
        connection: null,
        harness: configuration.harness ?? "codex",
        root: configuration.root,
        developerInstructions: configuration.developerInstructions,
        lessonContext: configuration.lessonContext ?? (() => ({})),
        lessonFragment: configuration.lessonFragment ?? ((fragmentId) => ({ fragmentId })),
        learnerObservation: configuration.learnerObservation,
        capability: crypto.randomUUID(),
        loadedSessions: new Set(),
        loadingSessions: new Map(),
        ready: null,
        promptCapabilities: undefined,
      };
      this.runtimes.set(configuration.runtimeKey, runtime);
      runCoordinator.attach(runtime.capability, {
        ask: (question) => this.askRunQuestion(runtime!, question),
        context: () => runtime!.lessonContext(),
        show: (fragmentId) => runtime!.lessonFragment(fragmentId),
        observe: (input) => {
          if (!runtime!.learnerObservation) throw new Error("Learning notes are unavailable in this run");
          return runtime!.learnerObservation(input);
        },
      });
    } else {
      if (configuration.lessonContext) runtime.lessonContext = configuration.lessonContext;
      if (configuration.lessonFragment) runtime.lessonFragment = configuration.lessonFragment;
      if (configuration.learnerObservation) runtime.learnerObservation = configuration.learnerObservation;
    }
    if (!runtime.ready) runtime.ready = this.initialize(configuration.runtimeKey, runtime);
    await runtime.ready;
    if (!runtime.connection) throw new Error("ACP lesson runtime is unavailable");
    return runtime.connection;
  }

  private async initialize(runtimeKey: string, runtime: AcpRuntime): Promise<void> {
    const processConfiguration = runtime.adapter.process(runtime);
    const command = processConfiguration.command;
    const args = processConfiguration.args;
    const child = spawn(command, args, {
      cwd: runtime.root,
      stdio: ["pipe", "pipe", "pipe"],
      env: processConfiguration.environment,
    });
    runtime.child = child;
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("exit", (code) => {
      if (this.runtimes.get(runtimeKey) !== runtime) return;
      runtime.connection = null;
      runtime.child = null;
      runtime.ready = null;
      runtime.loadedSessions.clear();
      runtime.loadingSessions.clear();
      if (code && code !== 0) process.stderr.write(`${runtime.harness} ACP exited with status ${code}\n`);
    });
    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
    );
    const connection = new acp.ClientSideConnection(() => ({
      requestPermission: (request) => this.requestPermission(request),
      sessionUpdate: (notification) => this.sessionUpdate(notification),
      createElicitation: (request) => this.createElicitation(request),
    }), stream);
    runtime.connection = connection;
    const initialized = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: "dojofoo", title: "Dojofoo", version: "0.1.0" },
      clientCapabilities: { ...runtime.adapter?.clientCapabilities, elicitation: { form: {} } },
    });
    runtime.promptCapabilities = initialized.agentCapabilities?.promptCapabilities;
  }

  private requestPermission(request: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const sessionId = request.sessionId;
    this.finishOpenParts(sessionId);
    const toolCallId = crypto.randomUUID();
    const questions: UserQuestion[] = [{
      id: "decision",
      title: request.toolCall.title ?? "Allow this action?",
      options: request.options.map((option) => ({ id: option.optionId, title: option.name })),
      allowOther: false,
      secret: false,
    }];
    this.callbacks.get(sessionId)?.({
      type: "tool-input-start",
      toolCallId,
      toolName: "request_permission",
      dynamic: true,
    });
    this.callbacks.get(sessionId)?.({
      type: "tool-input-available",
      toolCallId,
      toolName: "request_permission",
      input: { questions },
      dynamic: true,
    });
    return new Promise((resolve) => {
      this.permissions.set(sessionId, { resolve, toolCallId, kind: "permission", options: request.options });
    });
  }

  private createElicitation(request: acp.CreateElicitationRequest): Promise<acp.CreateElicitationResponse> {
    if (!("sessionId" in request) || request.mode !== "form") return Promise.resolve({ action: "decline" });
    const form = request as acp.CreateElicitationRequest & {
      mode: "form";
      sessionId: string;
      toolCallId?: string | null;
      requestedSchema: acp.ElicitationSchema;
    };
    const sessionId = form.sessionId;
    this.finishOpenParts(sessionId);
    const properties = form.requestedSchema.properties ?? {};
    const questions: UserQuestion[] = Object.entries(properties).map(([id, property]) => {
      const choices = "oneOf" in property && Array.isArray(property.oneOf)
        ? property.oneOf.flatMap((choice) => "const" in choice ? [{
            id: String(choice.const),
            title: typeof choice.title === "string" ? choice.title : String(choice.const),
          }] : [])
        : [];
      return {
        id,
        title: typeof property.title === "string" ? property.title : request.message,
        options: choices,
        allowOther: choices.length === 0,
        secret: false,
      };
    });
    const toolCallId = form.toolCallId ?? crypto.randomUUID();
    this.callbacks.get(sessionId)?.({
      type: "tool-input-start",
      toolCallId,
      toolName: "elicitation",
      dynamic: true,
    });
    this.callbacks.get(sessionId)?.({
      type: "tool-input-available",
      toolCallId,
      toolName: "elicitation",
      input: { questions },
      dynamic: true,
    });
    return new Promise((resolve) => {
      this.permissions.set(sessionId, { resolve, toolCallId, kind: "elicitation" });
    });
  }

  private askRunQuestion(runtime: AcpRuntime, question: RunQuestion): Promise<Record<string, string[]>> {
    const sessionId = [...runtime.loadedSessions].find((candidate) => this.activeTurns.has(candidate));
    if (!sessionId) return Promise.reject(new Error("The lesson agent is not in an active turn"));
    this.finishOpenParts(sessionId);
    const toolCallId = question.requestId ?? crypto.randomUUID();
    this.callbacks.get(sessionId)?.({
      type: "tool-input-start",
      toolCallId,
      toolName: "elicitation",
      dynamic: true,
    });
    this.callbacks.get(sessionId)?.({
      type: "tool-input-available",
      toolCallId,
      toolName: "elicitation",
      input: {
        questions: [{
          id: "decision",
          title: question.title,
          options: question.options,
          allowOther: false,
          secret: false,
        }],
      },
      dynamic: true,
    });
    return new Promise((resolve) => {
      this.permissions.set(sessionId, { resolve, toolCallId, kind: "run-question" });
    });
  }

  private sessionUpdate(notification: acp.SessionNotification): void {
    const { sessionId, update } = notification;
    this.turnActivity.get(sessionId)?.();
    const callback = this.callbacks.get(sessionId);
    const open = this.openParts.get(sessionId) ?? {};
    if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
      const silent = "[dojo:silent]";
      if (!open.textSuppressed) {
        const buffered = `${open.textBuffer ?? ""}${update.content.text}`;
        if (buffered.startsWith(silent)) {
          open.textBuffer = "";
          open.textSuppressed = true;
        } else if (silent.startsWith(buffered)) {
          open.textBuffer = buffered;
        } else {
          const id = open.text ?? crypto.randomUUID();
          if (!open.text) callback?.({ type: "text-start", id });
          callback?.({ type: "text-delta", id, delta: buffered });
          this.appendTranscript(sessionId, "message", buffered);
          open.text = id;
          open.textBuffer = "";
        }
      }
    } else if (update.sessionUpdate === "config_option_update") {
      this.sessionConfigOptions.set(sessionId, update.configOptions);
    } else if (update.sessionUpdate === "agent_thought_chunk" && update.content.type === "text") {
      const id = open.reasoning ?? crypto.randomUUID();
      if (!open.reasoning) callback?.({ type: "reasoning-start", id });
      callback?.({ type: "reasoning-delta", id, delta: update.content.text });
      this.appendTranscript(sessionId, "reasoning", update.content.text);
      open.reasoning = id;
    } else if (update.sessionUpdate === "user_message_chunk") {
      if (update.content.type === "text") {
        for (const projected of projectUserText(update.content.text)) {
          this.appendProjection(sessionId, projected);
        }
      } else if (update.content.type === "resource" && "text" in update.content.resource) {
        const resource = update.content.resource;
        const resourceText = decodePromptResource(resource.text);
        for (const projected of projectDojoResource(resource.uri, resourceText)) {
          this.appendProjection(sessionId, projected);
        }
      }
    } else if (update.sessionUpdate === "tool_call") {
      this.finishOpenParts(sessionId);
      const command = toolCommand(update);
      const toolName = isLessonCheckCommand(command) || /(?:^|[._])dojo_lesson_verify$/u.test(update.title) ? "dojo_lesson_verify" : update.title;
      const input = update.rawInput ?? update;
      callback?.({ type: "tool-input-start", toolCallId: update.toolCallId, toolName, dynamic: true });
      callback?.({ type: "tool-input-available", toolCallId: update.toolCallId, toolName, input, dynamic: true });
      const transcript = this.transcript(sessionId);
      const transcriptIndex = transcript.push({
        role: "assistant",
        kind: "tool",
        text: JSON.stringify({ name: toolName, input, output: null }),
        startedAt: this.turnStartedAt.get(sessionId) ?? Date.now(),
      }) - 1;
      const calls = this.toolCalls.get(sessionId) ?? new Map();
      calls.set(update.toolCallId, { command, input, transcriptIndex, output: "", title: toolName });
      this.toolCalls.set(sessionId, calls);
      this.openParts.delete(sessionId);
      return;
    } else if (update.sessionUpdate === "tool_call_update") {
      const call = this.toolCalls.get(sessionId)?.get(update.toolCallId);
      if (call) call.output += toolOutputDelta(update);
      if (update.status === "completed" || update.status === "failed") {
        const rawOutput = toolRawOutput(update) || call?.output || "";
        const report = call?.title === "dojo_lesson_verify" ? findTestReport(update.rawOutput) ?? parseJsonObject(rawOutput) : null;
        const output = report ?? update;
        callback?.({ type: "tool-output-available", toolCallId: update.toolCallId, output, dynamic: true });
        if (call) {
          const entry = this.transcript(sessionId)[call.transcriptIndex];
          if (entry) {
            entry.text = JSON.stringify({ name: call.title, input: call.input, output });
            entry.completedAt = Date.now();
          }
          this.toolCalls.get(sessionId)?.delete(update.toolCallId);
        }
      }
    }
    this.openParts.set(sessionId, open);
  }

  private appendTranscript(sessionId: string, kind: "message" | "reasoning" | "user", text: string): void {
    const transcript = this.transcript(sessionId);
    const role = kind === "user" ? "user" : "assistant";
    const normalizedKind = kind === "user" ? "message" : kind;
    const previous = transcript.at(-1);
    const now = Date.now();
    if (previous?.role === role && previous.kind === normalizedKind) {
      previous.text += text;
      previous.completedAt = now;
    } else transcript.push({
      role,
      kind: normalizedKind,
      text,
      startedAt: role === "assistant" ? this.turnStartedAt.get(sessionId) ?? now : now,
      completedAt: now,
    });
  }

  private appendProjection(sessionId: string, projected: UserTextProjection): void {
    if (projected.kind === "tool") {
      this.transcript(sessionId).push({
        role: "assistant",
        kind: "tool",
        text: projected.text,
        startedAt: this.turnStartedAt.get(sessionId) ?? Date.now(),
      });
    } else if (projected.role === "assistant") this.appendTranscript(sessionId, "reasoning", projected.text);
    else this.appendTranscript(sessionId, "user", projected.text);
  }

  private finishOpenParts(sessionId: string): void {
    const callback = this.callbacks.get(sessionId);
    const open = this.openParts.get(sessionId);
    if (open?.textBuffer && !open.textSuppressed) {
      const id = open.text ?? crypto.randomUUID();
      if (!open.text) callback?.({ type: "text-start", id });
      callback?.({ type: "text-delta", id, delta: open.textBuffer });
      this.appendTranscript(sessionId, "message", open.textBuffer);
      open.text = id;
    }
    if (open?.text) callback?.({ type: "text-end", id: open.text });
    if (open?.reasoning) callback?.({ type: "reasoning-end", id: open.reasoning });
    this.openParts.delete(sessionId);
  }
}

const processClients = globalThis as typeof globalThis & { __dojofooAcpClient?: AcpClient };
const existingAcpClient = processClients.__dojofooAcpClient;
export const acpClient = existingAcpClient ?? new AcpClient();
if (!existingAcpClient) {
  processClients.__dojofooAcpClient = acpClient;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => acpClient.shutdown());
  }
  process.once("exit", () => acpClient.shutdown());
}

type UserTextProjection = { role: "user" | "assistant"; kind?: "reasoning" | "tool"; text: string };

const leakedResourcePrefix = /^(?:dojo|dojofoo):\/\/lessons\/[^\s]+\/checks\/latest(?=\S)/u;

const dojoContextPattern = /(?:^|\n)(?:(?:dojo|dojofoo):\/\/[^\n]+\n)?<context ref="((?:dojo|dojofoo):\/\/[^"]+)"[^>]*>\n?([\s\S]*?)\n?<\/context>/gu;

function projectUserText(text: string): UserTextProjection[] {
  const normalizedText = text.replace(leakedResourcePrefix, "");
  const resources: UserTextProjection[] = [];
  const visible = normalizedText.replace(dojoContextPattern, (_match, uri: string, content: string) => {
    resources.push(...projectDojoResource(uri, content));
    return "";
  }).trim();
  if (resources.length > 0 || visible !== text.trim()) {
    return [
      ...resources,
      ...(visible && !hiddenTurns.has(visible)
        ? [{ role: "user" as const, text: visible }]
        : []),
    ];
  }
  if (hiddenTurns.has(text)) return [];
  return [{ role: "user", text }];
}

function decodePromptResource(text: string): string {
  const match = text.match(/^<context ref="(?:dojo|dojofoo):\/\/[^"]+">\n?([\s\S]*?)\n?<\/context>$/u);
  return match?.[1] ?? text;
}

function projectDojoResource(uri: string, text: string): UserTextProjection[] {
  if (/^(?:dojo|dojofoo):\/\/sensei\/instructions$/u.test(uri)) return [];
  if (/^(?:dojo|dojofoo):\/\/courses\//u.test(uri) && uri.endsWith("/context")) return [];
  if (/^(?:dojo|dojofoo):\/\/lessons\//u.test(uri) && uri.endsWith("/checks/latest")) {
    return [{ role: "assistant", kind: "reasoning", text }];
  }
  if (/^(?:dojo|dojofoo):\/\/lessons\//u.test(uri) && uri.includes("/checks/")) {
    try {
      const output = JSON.parse(text) as { report?: unknown };
      return [{
        role: "assistant",
        kind: "tool",
        text: JSON.stringify({ name: "dojo_lesson_verify", input: {}, output: output.report ?? output }),
      }];
    } catch {
      return [];
    }
  }
  return [];
}

function toolCommand(update: acp.ToolCall): string | undefined {
  const raw = update.rawInput;
  if (raw && typeof raw === "object" && "command" in raw && typeof raw.command === "string") return raw.command;
  return update.kind === "execute" ? update.title : undefined;
}

function isLessonCheckCommand(command: string | undefined): boolean {
  return Boolean(command && /\bkata\b[\s\S]*--check\b[\s\S]*--reporter(?:=|\s+)json\b/u.test(command));
}

function toolRawOutput(update: acp.ToolCallUpdate): string {
  const raw = update.rawOutput;
  if (!raw || typeof raw !== "object") return "";
  return "formatted_output" in raw && typeof raw.formatted_output === "string" ? raw.formatted_output : "";
}

function toolOutputDelta(update: acp.ToolCallUpdate): string {
  const meta = update._meta;
  if (!meta || typeof meta !== "object") return "";
  for (const key of ["terminal_output", "terminal_output_delta", "mcp_output_delta"]) {
    const value = meta[key];
    if (value && typeof value === "object" && "data" in value && typeof value.data === "string") return value.data;
  }
  return "";
}

function parseJsonObject(output: string): unknown | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(output.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function findTestReport(value: unknown): unknown | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.passed === "number" && typeof record.total === "number" && Array.isArray(record.tests)) return record;
  for (const nested of Object.values(record)) {
    const report = findTestReport(nested);
    if (report) return report;
  }
  return null;
}

function toolProfile(configuration: RuntimeConfiguration): "lesson" | "authoring" | "none" {
  if (configuration.toolProfile) return configuration.toolProfile;
  return configuration.lessonTools === false ? "none" : "lesson";
}

function dojoMcpServers(root: string, capability: string, profile: "lesson" | "authoring" | "none"): acp.McpServer[] {
  if (profile === "none") return [];
  const serverEntry = process.argv[1];
  const bundledCli = serverEntry ? resolve(dirname(serverEntry), "..", "..", "index.js") : "";
  const cli = process.env.DOJO_CLI ?? (bundledCli && existsSync(bundledCli) ? bundledCli : undefined);
  if (!cli) return [];
  const entry = resolve(dirname(cli), "lesson-mcp.js");
  if (!existsSync(entry)) return [];
  return [{
    name: "dojofoo",
    command: process.execPath,
    args: [entry],
    env: [
      { name: "DOJO_PROJECT_ROOT", value: root },
      { name: "DOJO_CLI", value: cli },
      { name: "DOJO_SKIP_PREPARE", value: "1" },
      { name: "DOJOFOO_RUN_CAPABILITY", value: capability },
      { name: "DOJOFOO_COORDINATOR_URL", value: process.env.DOJO_UI_BASE_URL || `http://127.0.0.1:${process.env.PORT ?? "4567"}` },
      { name: "DOJOFOO_TOOL_PROFILE", value: profile },
    ],
  }];
}
