import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

type JsonRpcMessage = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type TranscriptMessage = {
  role: "user" | "assistant";
  text: string;
  kind?: "message" | "commentary" | "reasoning" | "tool" | "checkpoint";
};

export type AgentActivity = {
  status: "idle" | "thinking" | "waiting-for-user";
  reasoning: string;
  steps: Array<{
    id: string;
    label: string;
    description?: string;
    icon: "brain" | "message-circle" | "monitor" | "pencil" | "settings" | "search" | "image" | "check";
    status: "complete" | "active";
  }>;
  context: {
    usedTokens: number;
    maxTokens: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
  };
  questions: Array<{
    id: string;
    title: string;
    options: Array<{ id: string; title: string; description?: string }>;
    allowOther: boolean;
    secret: boolean;
  }> | null;
};

type UserInputRequest = {
  requestId: number | string;
  kind: "builtin" | "dynamic" | "approval";
  questions: NonNullable<AgentActivity["questions"]>;
};

type CompletedTurn = {
  status?: string;
  error?: { message?: string };
};

const emptyActivity = (): AgentActivity => ({
  status: "idle",
  reasoning: "",
  steps: [],
  context: {
    usedTokens: 0,
    maxTokens: 1,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
  },
  questions: null,
});

export class CodexClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private turnText = new Map<string, string>();
  private loadedThreads = new Set<string>();
  private threadRoots = new Map<string, string>();
  private threadConfigurations = new Map<string, string>();
  private activities = new Map<string, AgentActivity>();
  private userInputRequests = new Map<string, UserInputRequest>();
  private threadDeltaCallbacks = new Map<string, (delta: string) => void>();
  private reasoningActivity = new Map<string, { summary: string; content: string }>();
  private completedTurns = new Map<string, CompletedTurn>();
  private turnDone = new Map<
    string,
    {
      resolve: (text: string) => void;
      reject: (error: Error) => void;
      onDelta?: (delta: string) => void;
    }
  >();

  async startThread(root: string, developerInstructions: string): Promise<string> {
    await this.ensureReady();
    const result = (await this.request("thread/start", {
      cwd: root,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      developerInstructions,
      serviceName: "dojocho",
      dynamicTools: [
        {
          type: "function",
          name: "ask_senpai",
          description: "Ask the senpai one short multiple-choice question when their preferred kind of help is ambiguous.",
          inputSchema: choiceToolSchema(),
        },
        {
          type: "function",
          name: "ask_learner",
          description: "Compatibility alias for ask_senpai in sessions created before the domain rename.",
          inputSchema: choiceToolSchema(),
        },
      ],
    })) as { thread: { id: string } };
    this.loadedThreads.add(result.thread.id);
    this.threadRoots.set(result.thread.id, root);
    this.threadConfigurations.set(result.thread.id, `${root}\n${developerInstructions}`);
    return result.thread.id;
  }

  async resumeThread(
    threadId: string,
    configuration?: { root: string; developerInstructions: string },
  ): Promise<void> {
    await this.ensureReady();
    const signature = configuration
      ? `${configuration.root}\n${configuration.developerInstructions}`
      : this.threadConfigurations.get(threadId);
    if (this.loadedThreads.has(threadId) && (!signature || this.threadConfigurations.get(threadId) === signature)) return;
    await this.request("thread/resume", {
      threadId,
      ...(configuration ? {
        cwd: configuration.root,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        developerInstructions: configuration.developerInstructions,
      } : {}),
    });
    this.loadedThreads.add(threadId);
    if (configuration) {
      this.threadRoots.set(threadId, configuration.root);
      this.threadConfigurations.set(threadId, signature!);
    }
  }

  async send(threadId: string, text: string, onDelta?: (delta: string) => void): Promise<string> {
    await this.ensureReady();
    if (onDelta) this.threadDeltaCallbacks.set(threadId, onDelta);
    try {
      const result = (await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text, text_elements: [] }],
        approvalPolicy: "on-request",
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: [this.threadRoots.get(threadId)].filter((root): root is string => Boolean(root)),
          networkAccess: false,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        },
      })) as { turn: { id: string } };
      const key = `${threadId}:${result.turn.id}`;
      return await new Promise<string>((resolve, reject) => {
        if (!this.turnText.has(key)) this.turnText.set(key, "");
        this.turnDone.set(key, { resolve, reject, onDelta });
        const completed = this.completedTurns.get(key);
        if (completed) {
          this.completedTurns.delete(key);
          this.finishTurn(key, completed);
        }
      });
    } finally {
      if (onDelta && this.threadDeltaCallbacks.get(threadId) === onDelta) {
        this.threadDeltaCallbacks.delete(threadId);
      }
    }
  }

  async checkpoint(threadId: string): Promise<void> {
    await this.resumeThread(threadId);
    await this.request("thread/compact/start", { threadId });
  }

  async history(threadId: string): Promise<TranscriptMessage[]> {
    await this.ensureReady();
    const turns: Array<{ items: Array<Record<string, unknown>> }> = [];
    let cursor: string | null = null;
    do {
      const result = (await this.request("thread/turns/list", {
        threadId,
        cursor,
        limit: 100,
        sortDirection: "asc",
        itemsView: "full",
      })) as { data: Array<{ items: Array<Record<string, unknown>> }>; nextCursor: string | null };
      turns.push(...result.data);
      cursor = result.nextCursor;
    } while (cursor);

    return turns.flatMap((turn) =>
      turn.items.flatMap((item): TranscriptMessage[] => {
        if (
          item.type === "agentMessage" &&
          typeof item.text === "string" &&
          item.phase !== "commentary"
        ) {
          return [{
            role: "assistant",
            text: item.text,
            kind: item.phase === "commentary" ? "commentary" : "message",
          }];
        }
        if (item.type === "userMessage" && Array.isArray(item.content)) {
          const text = item.content
            .filter((part): part is { type: string; text?: string } => Boolean(part) && typeof part === "object" && "type" in part)
            .filter((part) => part.type === "text")
            .map((part) => part.text ?? "")
            .join("\n");
          const internal = text.startsWith("[dojo-internal]") ||
            text.startsWith("Introduce this lesson in your own words.") ||
            text.startsWith("The dojo CLI reports:");
          return text && !internal
            ? [{ role: "user", text, kind: "message" }]
            : [];
        }
        if (item.type === "reasoning") {
          const text = reasoningDescription(item);
          return text ? [{ role: "assistant", text, kind: "reasoning" }] : [];
        }
        if (item.type === "dynamicToolCall") {
          const args = item.arguments as Record<string, unknown> | undefined;
          const text = typeof args?.question === "string"
            ? `Asked senpai: ${args.question}`
            : `Used ${String(item.tool ?? "a lesson tool")}`;
          return [{ role: "assistant", text, kind: "tool" }];
        }
        if (item.type === "contextCompaction") {
          return [{ role: "assistant", text: "Lesson context checkpoint created.", kind: "checkpoint" }];
        }
        return [];
      }),
    );
  }

  activity(threadId: string): AgentActivity {
    return this.activities.get(threadId) ?? emptyActivity();
  }

  async waitForIdle(threadId: string, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.activity(threadId).status !== "idle") {
      if (Date.now() >= deadline) throw new Error("The sensei did not finish the lesson wrap-up in time");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  answerUserInput(threadId: string, answers: Record<string, string[]>): void {
    const pending = this.userInputRequests.get(threadId);
    if (!pending) throw new Error("The agent is not waiting for an answer");
    if (pending.kind === "dynamic") {
      this.respond(pending.requestId, {
        contentItems: [{ type: "inputText", text: JSON.stringify({ answers }) }],
        success: true,
      });
    } else if (pending.kind === "builtin") {
      this.respond(pending.requestId, {
        answers: Object.fromEntries(
          Object.entries(answers).map(([questionId, values]) => [questionId, { answers: values }]),
        ),
      });
    } else {
      const selected = Object.values(answers).flat();
      this.respond(pending.requestId, {
        decision: selected.includes("accept") ? "accept" : "decline",
      });
    }
    this.userInputRequests.delete(threadId);
    const activity = this.activity(threadId);
    this.activities.set(threadId, { ...activity, status: "thinking", questions: null });
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.initialize();
    return this.ready;
  }

  private async initialize(): Promise<void> {
    const child = spawn("codex", ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.process = child;
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("exit", (code) => {
      const error = new Error(`codex app-server exited with ${code ?? "unknown status"}`);
      for (const request of this.pending.values()) request.reject(error);
      for (const turn of this.turnDone.values()) turn.reject(error);
      this.pending.clear();
      this.turnDone.clear();
      this.loadedThreads.clear();
      this.threadRoots.clear();
      this.threadConfigurations.clear();
      this.process = null;
      this.ready = null;
    });

    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.onMessage(JSON.parse(line) as JsonRpcMessage));

    await this.request("initialize", {
      clientInfo: { name: "dojocho", title: "Dojocho", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  private onMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && !message.method) {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message ?? "Codex request failed"));
      else request.resolve(message.result);
      return;
    }

    if (message.id !== undefined && message.method) {
      if (message.method === "item/tool/requestUserInput") {
        const threadId = String(message.params?.threadId ?? "");
        const rawQuestions = Array.isArray(message.params?.questions)
          ? message.params.questions as Array<Record<string, unknown>>
          : [];
        const questions = rawQuestions.map((question) => ({
          id: String(question.id ?? ""),
          title: String(question.question ?? question.header ?? "Choose an answer"),
          options: Array.isArray(question.options)
            ? (question.options as Array<Record<string, unknown>>).map((option, index) => ({
                id: String(option.label ?? index),
                title: String(option.label ?? `Option ${index + 1}`),
                description: typeof option.description === "string" ? option.description : undefined,
              }))
            : [],
          allowOther: Boolean(question.isOther),
          secret: Boolean(question.isSecret),
        }));
        this.userInputRequests.set(threadId, { requestId: message.id, kind: "builtin", questions });
        const activity = this.activity(threadId);
        this.activities.set(threadId, {
          ...activity,
          status: "waiting-for-user",
          questions,
        });
        return;
      }
      if (message.method === "item/tool/call" && ["ask_senpai", "ask_learner"].includes(String(message.params?.tool))) {
        const params = message.params ?? {};
        const threadId = String(params.threadId ?? "");
        const input = params.arguments as Record<string, unknown> | undefined;
        const rawOptions = Array.isArray(input?.options)
          ? input.options as Array<Record<string, unknown>>
          : [];
        const questions: NonNullable<AgentActivity["questions"]> = [{
          id: "answer",
          title: String(input?.question ?? "Which kind of help would you like?"),
          options: rawOptions.map((option, index) => ({
            id: String(option.label ?? index),
            title: String(option.label ?? `Option ${index + 1}`),
            description: typeof option.description === "string" ? option.description : undefined,
          })),
          allowOther: Boolean(input?.allowOther),
          secret: false,
        }];
        this.userInputRequests.set(threadId, { requestId: message.id, kind: "dynamic", questions });
        this.activities.set(threadId, {
          ...this.activity(threadId),
          status: "waiting-for-user",
          questions,
        });
        return;
      }
      if (
        message.method === "item/commandExecution/requestApproval" ||
        message.method === "item/fileChange/requestApproval"
      ) {
        const threadId = String(message.params?.threadId ?? "");
        const command = typeof message.params?.command === "string"
          ? message.params.command
          : message.method === "item/fileChange/requestApproval"
            ? "Apply the proposed lesson workspace change"
            : "Run the requested command";
        const questions: NonNullable<AgentActivity["questions"]> = [{
          id: "decision",
          title: command,
          options: [
            { id: "accept", title: "Allow", description: "Allow this action once." },
            { id: "decline", title: "Decline", description: "Do not perform this action." },
          ],
          allowOther: false,
          secret: false,
        }];
        this.userInputRequests.set(threadId, { requestId: message.id, kind: "approval", questions });
        this.activities.set(threadId, {
          ...this.activity(threadId),
          status: "waiting-for-user",
          questions,
        });
        return;
      }
      this.respond(message.id, { decision: "decline" });
      return;
    }

    if (message.method === "turn/started") {
      const threadId = String(message.params?.threadId ?? "");
      this.activities.set(threadId, {
        ...this.activity(threadId),
        status: "thinking",
        reasoning: "",
        steps: [],
        questions: null,
      });
      return;
    }

    if (message.method === "item/started" || message.method === "item/completed") {
      const threadId = String(message.params?.threadId ?? "");
      const turnId = String(message.params?.turnId ?? "");
      const item = message.params?.item as Record<string, unknown> | undefined;
      if (
        message.method === "item/completed" &&
        item?.type === "agentMessage" &&
        typeof item.text === "string"
      ) {
        const key = `${threadId}:${turnId}`;
        if (!(this.turnText.get(key) ?? "")) {
          this.turnText.set(key, item.text);
          (this.turnDone.get(key)?.onDelta ?? this.threadDeltaCallbacks.get(threadId))?.(item.text);
        }
      }
      const id = String(item?.id ?? `${message.method}-${Date.now()}`);
      let step = activityStep(item);
      const activity = this.activity(threadId);
      const completedReasoning = message.method === "item/completed" && item?.type === "reasoning"
        ? reasoningDescription(item) || activity.reasoning
        : activity.reasoning;
      if (!step) return;
      const steps = activity.steps.filter((step) => step.id !== id);
      steps.push({
        id,
        ...step,
        status: message.method === "item/completed" ? "complete" : "active",
      });
      this.activities.set(threadId, { ...activity, reasoning: completedReasoning, steps: steps.slice(-6) });
      if (message.method === "item/completed" && item?.type === "reasoning") {
        this.reasoningActivity.delete(`${threadId}:${id}`);
      }
      return;
    }

    if (
      message.method === "item/reasoning/summaryTextDelta" ||
      message.method === "item/reasoning/textDelta"
    ) {
      const threadId = String(message.params?.threadId ?? "");
      const itemId = String(message.params?.itemId ?? "");
      const delta = String(message.params?.delta ?? "");
      const key = `${threadId}:${itemId}`;
      const reasoning = this.reasoningActivity.get(key) ?? { summary: "", content: "" };
      if (message.method === "item/reasoning/textDelta") reasoning.content += delta;
      else reasoning.summary += delta;
      this.reasoningActivity.set(key, reasoning);
      const activity = this.activity(threadId);
      const steps = activity.steps.filter((step) => step.id !== itemId);
      steps.push({
        id: itemId,
        label: "Thinking",
        icon: "brain",
        status: "active",
        description: reasoning.content || reasoning.summary,
      });
      this.activities.set(threadId, {
        ...activity,
        reasoning: reasoning.content || reasoning.summary,
        steps: steps.slice(-6),
      });
      return;
    }

    if (message.method === "thread/tokenUsage/updated") {
      const threadId = String(message.params?.threadId ?? "");
      const tokenUsage = message.params?.tokenUsage as Record<string, unknown> | undefined;
      const total = tokenUsage?.total as Record<string, unknown> | undefined;
      const maxTokens = Number(tokenUsage?.modelContextWindow ?? 0) || 1;
      const usedTokens = Number(total?.totalTokens ?? 0);
      const activity = this.activity(threadId);
      this.activities.set(threadId, {
        ...activity,
        context: {
          usedTokens,
          maxTokens,
          inputTokens: Number(total?.inputTokens ?? 0),
          outputTokens: Number(total?.outputTokens ?? 0),
          reasoningTokens: Number(total?.reasoningOutputTokens ?? 0),
          cachedTokens: Number(total?.cachedInputTokens ?? 0),
        },
      });
      return;
    }

    if (message.method === "item/agentMessage/delta") {
      const threadId = String(message.params?.threadId ?? "");
      const turnId = String(message.params?.turnId ?? "");
      const key = `${threadId}:${turnId}`;
      const delta = String(message.params?.delta ?? "");
      this.turnText.set(key, `${this.turnText.get(key) ?? ""}${delta}`);
      (this.turnDone.get(key)?.onDelta ?? this.threadDeltaCallbacks.get(threadId))?.(delta);
      return;
    }

    if (message.method === "turn/completed") {
      const threadId = String(message.params?.threadId ?? "");
      const turn = message.params?.turn as { id?: string; status?: string; error?: { message?: string } } | undefined;
      const key = `${threadId}:${String(turn?.id ?? "")}`;
      const activity = this.activity(threadId);
      this.activities.set(threadId, {
        ...activity,
        status: activity.questions ? "waiting-for-user" : "idle",
        steps: activity.steps.map((step) => ({ ...step, status: "complete" })),
      });
      this.finishTurn(key, turn ?? {});
    }
  }

  private finishTurn(key: string, turn: CompletedTurn): void {
    const done = this.turnDone.get(key);
    if (!done) {
      this.completedTurns.set(key, turn);
      return;
    }
    this.turnDone.delete(key);
    const text = this.turnText.get(key) ?? "";
    this.turnText.delete(key);
    if (turn.status === "failed") done.reject(new Error(turn.error?.message ?? "Codex turn failed"));
    else done.resolve(text.trim());
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ method, id, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.write({ method, params });
  }

  private respond(id: number | string, result: unknown): void {
    this.write({ id, result });
  }

  private write(message: unknown): void {
    if (!this.process) throw new Error("Codex app-server is not running");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

function activityStep(item?: Record<string, unknown>): Pick<AgentActivity["steps"][number], "label" | "description" | "icon"> | null {
  switch (item?.type) {
    case "reasoning": return { label: "Thinking", icon: "brain", ...(reasoningDescription(item) ? { description: reasoningDescription(item) } : {}) };
    case "agentMessage": return null;
    case "commandExecution": return { label: "Running a command", icon: "monitor", ...(typeof item.command === "string" ? { description: item.command } : {}) };
    case "fileChange": return { label: "Updating files", icon: "pencil", description: fileChangeDescription(item) };
    case "mcpToolCall": return { label: `Using ${[item.server, item.tool].filter(Boolean).join(".") || "a tool"}`, icon: "settings" };
    case "dynamicToolCall": {
      const tool = ["ask_senpai", "ask_learner"].includes(String(item.tool)) ? "ask_senpai" : String(item.tool ?? "a tool");
      return { label: `Tool: ${tool}`, icon: "settings" };
    }
    case "webSearch": return { label: "Searching the web", icon: "search" };
    case "imageView": return { label: "Inspecting an image", icon: "image" };
    case "contextCompaction": return { label: "Creating a lesson checkpoint", icon: "check" };
    default: return null;
  }
}

function choiceToolSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      question: { type: "string" },
      options: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            description: { type: "string" },
          },
          required: ["label"],
        },
      },
      allowOther: { type: "boolean" },
    },
    required: ["question", "options"],
  };
}

function reasoningDescription(item: Record<string, unknown>): string {
  const content = reasoningParts(item.content);
  return content || reasoningParts(item.summary);
}

function reasoningParts(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => typeof part === "string"
      ? part
      : part && typeof part === "object" && "text" in part && typeof part.text === "string"
        ? part.text
        : "")
    .filter(Boolean)
    .join("\n");
}

function fileChangeDescription(item: Record<string, unknown>): string {
  const changes = item.changes;
  if (!Array.isArray(changes)) return "Applying a workspace change";
  return changes
    .map((change) => change && typeof change === "object" && "path" in change ? String(change.path) : "")
    .filter(Boolean)
    .join(", ") || "Applying a workspace change";
}

const globalForCodex = globalThis as typeof globalThis & {
  __dojochoCodexClient?: CodexClient;
};

export const codexClient = globalForCodex.__dojochoCodexClient ??= new CodexClient();
