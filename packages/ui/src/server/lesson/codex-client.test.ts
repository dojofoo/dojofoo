import type { SessionNotification } from "@agentclientprotocol/sdk";
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { codexHarnessAdapter, codexRuntimeEnvironment } from "../harness/codex";
import { configureOpenCodeSessionModel, opencodeRuntimeEnvironment } from "../harness/opencode";
import { dojofooHarness } from "../harness/registry";
import { AcpClient, type AcpStreamPart } from "./codex-client";
import { runCoordinator } from "../run/coordinator";

vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

function receive(client: AcpClient, notification: SessionNotification) {
  (client as unknown as { sessionUpdate(value: SessionNotification): void }).sessionUpdate(notification);
}

async function visibleHistory(client: AcpClient, sessionId: string) {
  return (await client.history(sessionId)).map(({ role, kind, text }) => ({ role, kind, text }));
}

describe("AcpClient projection", () => {
  it("targets the public UI coordinator rather than Nitro's private worker port", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dojo-mcp-address-"));
    writeFileSync(join(directory, "lesson-mcp.js"), "// fixture");
    vi.stubEnv("DOJO_CLI", join(directory, "index.js"));
    vi.stubEnv("DOJO_UI_BASE_URL", "http://127.0.0.1:4594");
    vi.stubEnv("PORT", "58830");
    const newSession = vi.fn(async () => ({ sessionId: "public-ui" }));
    const client = new AcpClient();
    const internal = client as unknown as { ensureRuntime(config: unknown): Promise<unknown>; runtimes: Map<string, unknown> };
    internal.runtimes.set("public-ui", { capability: "test-only", loadedSessions: new Set(), loadingSessions: new Map(),
      adapter: { configureSession: async () => [] } });
    const connection = vi.spyOn(internal, "ensureRuntime").mockResolvedValue({ newSession });
    try {
      await client.startThread({ root: directory, runtimeKey: "public-ui", harness: "opencode", developerInstructions: "Teach" });
      expect(newSession).toHaveBeenCalledWith(expect.objectContaining({ mcpServers: [expect.objectContaining({
        env: expect.arrayContaining([{ name: "DOJOFOO_COORDINATOR_URL", value: "http://127.0.0.1:4594" }]),
      })] }));
    } finally {
      client.shutdown();
      connection.mockRestore();
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("registers form elicitation with the actual ACP SDK connection", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      stdin, stdout, stderr,
      kill: () => { stdin.end(); stdout.end(); stderr.end(); return true; },
    });
    const spawn = vi.mocked(childProcess.spawn).mockReturnValue(child as unknown as childProcess.ChildProcess);
    const initialized = vi.fn(() => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }));
    const agent = new AgentSideConnection(() => ({
      initialize: initialized,
      authenticate: async () => ({}),
      newSession: async () => ({ sessionId: "session-1" }),
      prompt: async () => ({ stopReason: "end_turn" as const }),
      cancel: async () => {},
    }), ndJsonStream(Writable.toWeb(stdout), Readable.toWeb(stdin) as unknown as ReadableStream<Uint8Array>));
    const client = new AcpClient();
    const internals = client as unknown as {
      initialize(key: string, runtime: unknown): Promise<void>;
      runtimes: Map<string, unknown>;
      callbacks: Map<string, (part: AcpStreamPart) => void>;
    };
    const runtime = { adapter: codexHarnessAdapter, root: "/tmp/offline-acp", harness: "codex", developerInstructions: "", loadedSessions: new Set(), loadingSessions: new Map() };
    internals.runtimes.set("offline", runtime);
    const shown = Promise.withResolvers<void>();
    internals.callbacks.set("session-1", part => {
      if (part.type === "tool-input-available") shown.resolve();
    });
    try {
      await internals.initialize("offline", runtime);
      expect(initialized).toHaveBeenCalledWith(expect.objectContaining({
        clientCapabilities: expect.objectContaining({
          elicitation: { form: {} },
          _meta: expect.objectContaining({ terminal_output_delta: true }),
        }),
      }));
      const answer = agent.createElicitation({
        sessionId: "session-1", mode: "form", message: "Review?",
        requestedSchema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] },
      });
      await shown.promise;
      client.answerUserInput("session-1", { reply: ["Yes"] });
      await expect(answer).resolves.toEqual({ action: "accept", content: { reply: "Yes" } });
    } finally {
      client.shutdown();
      spawn.mockRestore();
    }
  });
  it("binds learning observations to the active runtime and removes access on shutdown", async () => {
    const client = new AcpClient();
    const internal = client as unknown as {
      initialize(key: string): Promise<void>;
      ensureRuntime(config: { root: string; runtimeKey: string; harness: "codex"; developerInstructions: string; learnerObservation: (input: unknown) => unknown }): Promise<unknown>;
      runtimes: Map<string, { connection: unknown; capability: string }>;
    };
    const initialize = vi.spyOn(internal, "initialize").mockImplementation(async key => {
      internal.runtimes.get(key)!.connection = {};
    });
    const observe = vi.fn(input => ({ saved: input }));
    const config = { root: "/tmp/lesson", runtimeKey: "observation-test", harness: "codex" as const, developerInstructions: "Teach", learnerObservation: observe };
    try {
      await internal.ensureRuntime(config);
      const capability = internal.runtimes.get(config.runtimeKey)!.capability;
      await expect(runCoordinator.observe(capability, { interpretation: "Initial note" })).resolves.toEqual({ saved: { interpretation: "Initial note" } });
      const updated = vi.fn(() => ({ updated: true }));
      await internal.ensureRuntime({ ...config, learnerObservation: updated });
      await expect(runCoordinator.observe(capability, {})).resolves.toEqual({ updated: true });
      expect(observe).toHaveBeenCalledOnce();
      expect(updated).toHaveBeenCalledOnce();
      client.shutdown();
      await expect(runCoordinator.observe(capability, {})).rejects.toThrow("no longer active");
    } finally {
      client.shutdown();
      initialize.mockRestore();
    }
  });

  it("rejects typed Codex provider failures, including silent turns, without inventing teaching text", async () => {
    const client = new AcpClient();
    const runtime = {
      adapter: codexHarnessAdapter,
      connection: { cancel: vi.fn(), prompt: vi.fn().mockResolvedValue({
        stopReason: "end_turn",
        _meta: { jetbrains: { air: { version: 1, sessionFailure: {
          id: "turn:error", revision: 1, category: "limit", severity: "error",
          title: "exceeded retry limit, last status: 429 Too Many Requests", actions: ["retry"],
        } } } },
      }) },
      harness: "codex", root: "/tmp/lesson", developerInstructions: "Teach",
      loadedSessions: new Set(["session-1"]), loadingSessions: new Map(), ready: Promise.resolve(),
    };
    (client as unknown as { runtimes: Map<string, unknown> }).runtimes.set("lesson", runtime);
    (client as unknown as { sessions: Map<string, unknown> }).sessions.set("session-1", {
      runtimeKey: "lesson", root: "/tmp/lesson",
    });
    for (const visible of [true, false]) {
      await expect(client.send("session-1", "Continue", undefined, { visible })).rejects.toThrow("429 Too Many Requests");
    }
    expect((await client.history("session-1")).filter(entry => entry.role === "assistant")).toEqual([]);
    runtime.connection.prompt.mockImplementationOnce(async () => {
      receive(client, { sessionId: "session-1", update: {
        sessionUpdate: "agent_message_chunk", content: { type: "text", text: "HTTP 429 means too many requests." },
      } });
      return { stopReason: "end_turn" };
    });
    await expect(client.send("session-1", "Explain HTTP 429")).resolves.toBe("HTTP 429 means too many requests.");
  });

  it("projects and updates the ACP model configuration advertised by a harness", async () => {
    const client = new AcpClient();
    const options = [{
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "provider/fast",
      options: [{
        group: "provider",
        name: "Provider",
        options: [
          { value: "provider/fast", name: "Fast" },
          { value: "provider/deep", name: "Deep", description: "More reasoning" },
        ],
      }],
    }] satisfies import("@agentclientprotocol/sdk").SessionConfigOption[];
    const updated = structuredClone(options);
    if (updated[0]?.type === "select") updated[0].currentValue = "provider/deep";
    const setModel = vi.fn().mockResolvedValue(updated);
    const runtime = {
      adapter: { setModel },
      child: null,
      connection: {},
      harness: "opencode",
      root: "/tmp/lesson",
      developerInstructions: "Teach",
      loadedSessions: new Set(["session-1"]),
      loadingSessions: new Map<string, Promise<void>>(),
      ready: Promise.resolve(),
    };
    (client as unknown as { runtimes: Map<string, unknown> }).runtimes.set("lesson", runtime);
    (client as unknown as { sessions: Map<string, unknown> }).sessions.set("session-1", {
      runtimeKey: "lesson",
      root: "/tmp/lesson",
    });
    (client as unknown as { sessionConfigOptions: Map<string, unknown> })
      .sessionConfigOptions.set("session-1", options);

    const snapshot = client.configuration("session-1");
    expect(snapshot).toEqual(options);
    snapshot.splice(0);
    expect(client.configuration("session-1")).toEqual(options);
    expect(client.configuration("unknown")).toEqual([]);

    expect(client.modelConfiguration("session-1")).toEqual({
      id: "model",
      name: "Model",
      currentValue: "provider/fast",
      options: [
        { value: "provider/fast", name: "Fast", group: "Provider" },
        { value: "provider/deep", name: "Deep", description: "More reasoning", group: "Provider" },
      ],
    });
    await expect(client.setModel("session-1", "provider/deep")).resolves.toEqual(
      expect.objectContaining({ currentValue: "provider/deep" }),
    );
    expect(setModel).toHaveBeenCalledWith(runtime.connection, "session-1", "provider/deep");
  });

  it("prefers the canonical model selector when a harness also categorizes provider as model", () => {
    const client = new AcpClient();
    const options = [{
      id: "provider",
      name: "Provider",
      category: "model",
      type: "select",
      currentValue: "gateway",
      options: [{ value: "gateway", name: "Gateway" }],
    }, {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "zai/glm-5.3-flash",
      options: [{ value: "zai/glm-5.3-flash", name: "GLM 5.3 Flash" }],
    }] satisfies import("@agentclientprotocol/sdk").SessionConfigOption[];
    (client as unknown as { sessionConfigOptions: Map<string, unknown> })
      .sessionConfigOptions.set("session-1", options);

    expect(client.modelConfiguration("session-1")).toEqual({
      id: "model",
      name: "Model",
      currentValue: "zai/glm-5.3-flash",
      options: [{ value: "zai/glm-5.3-flash", name: "GLM 5.3 Flash" }],
    });
  });

  it("reports a visible ACP turn that completes without output", async () => {
    const client = new AcpClient();
    const runtime = {
      child: null,
      connection: { cancel: vi.fn(), prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }) },
      harness: "opencode",
      root: "/tmp/lesson",
      developerInstructions: "Teach",
      loadedSessions: new Set(["session-1"]),
      loadingSessions: new Map<string, Promise<void>>(),
      ready: Promise.resolve(),
    };
    (client as unknown as { runtimes: Map<string, unknown> }).runtimes.set("lesson", runtime);
    (client as unknown as { sessions: Map<string, unknown> }).sessions.set("session-1", {
      runtimeKey: "lesson",
      root: "/tmp/lesson",
    });

    await expect(client.send("session-1", "Hello")).rejects.toThrow(
      "opencode completed the ACP turn without returning any output",
    );
    await expect(client.send("session-1", "Background", undefined, { visible: false })).resolves.toBe("");
  });

  it("injects contextual native-harness instructions only once per session", async () => {
    const client = new AcpClient();
    const prompt = vi.fn().mockResolvedValue({ stopReason: "end_turn" });
    const runtime = {
      adapter: {
        contextualInstructions: true,
        encodeResource: ({ text }: { text: string }) => text,
      },
      child: null,
      connection: { cancel: vi.fn(), prompt },
      harness: "fx",
      root: "/tmp/lesson",
      developerInstructions: "Private lesson contract",
      loadedSessions: new Set(["session-1"]),
      loadingSessions: new Map<string, Promise<void>>(),
      ready: Promise.resolve(),
    };
    (client as unknown as { runtimes: Map<string, unknown> }).runtimes.set("lesson", runtime);
    (client as unknown as { sessions: Map<string, unknown> }).sessions.set("session-1", {
      runtimeKey: "lesson",
      root: "/tmp/lesson",
    });

    await client.send("session-1", "First", undefined, { visible: false });
    await client.send("session-1", "Second", undefined, { visible: false });

    expect(prompt.mock.calls[0]?.[0].prompt).toEqual([
      { type: "text", text: "Private lesson contract" },
      { type: "text", text: "First" },
    ]);
    expect(prompt.mock.calls[1]?.[0].prompt).toEqual([{ type: "text", text: "Second" }]);
  });

  it("cancels and reports a harness that produces no ACP activity", async () => {
    const client = new AcpClient(10);
    const cancel = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      child: null,
      connection: { cancel, prompt: vi.fn(() => new Promise(() => undefined)) },
      harness: "opencode",
      root: "/tmp/lesson",
      developerInstructions: "Teach",
      loadedSessions: new Set(["session-1"]),
      loadingSessions: new Map<string, Promise<void>>(),
      ready: Promise.resolve(),
    };
    (client as unknown as { runtimes: Map<string, unknown> }).runtimes.set("lesson", runtime);
    (client as unknown as { sessions: Map<string, unknown> }).sessions.set("session-1", {
      runtimeKey: "lesson",
      root: "/tmp/lesson",
    });

    await expect(client.send("session-1", "Hello")).rejects.toThrow(
      "opencode produced no ACP activity for 1 seconds",
    );
    expect(cancel).toHaveBeenCalledWith({ sessionId: "session-1" });
  });

  it("cancels an ACP turn when its browser request disconnects", async () => {
    const client = new AcpClient();
    const cancel = vi.fn().mockResolvedValue(undefined);
    let finishPrompt!: () => void;
    const prompt = vi.fn(() => new Promise<void>((resolve) => { finishPrompt = resolve; }));
    const runtime = {
      child: null,
      connection: { cancel, prompt },
      harness: "opencode",
      root: "/tmp/lesson",
      developerInstructions: "Teach",
      loadedSessions: new Set(["session-1"]),
      loadingSessions: new Map<string, Promise<void>>(),
      ready: Promise.resolve(),
    };
    (client as unknown as { runtimes: Map<string, unknown> }).runtimes.set("lesson", runtime);
    (client as unknown as { sessions: Map<string, unknown> }).sessions.set("session-1", {
      runtimeKey: "lesson",
      root: "/tmp/lesson",
    });
    const controller = new AbortController();

    const turn = client.send("session-1", "Hello", undefined, { signal: controller.signal });
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    controller.abort();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith({ sessionId: "session-1" }));
    finishPrompt();
    await turn;
  });

  it("uses OpenCode's legacy ACP model operation only when current session configuration is unavailable", async () => {
    const request = vi.fn().mockResolvedValue({});
    const connection = {
      setSessionConfigOption: vi.fn().mockRejectedValue(new Error("Method not found")),
      request,
    } as unknown as import("@agentclientprotocol/sdk").ClientSideConnection;

    await configureOpenCodeSessionModel(connection, "session-1", "openai/codex-mini-latest");

    expect(request).toHaveBeenCalledWith("session/set_model", {
      sessionId: "session-1",
      modelId: "openai/codex-mini-latest",
    });
  });

  it("deduplicates concurrent loads of the same native ACP session", async () => {
    const client = new AcpClient();
    let release!: () => void;
    const gate = new Promise<{ configOptions: [] }>((resolve) => { release = () => resolve({ configOptions: [] }); });
    const loadSession = vi.fn(() => gate);
    const configureSession = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      adapter: { configureSession },
      child: null,
      connection: { loadSession },
      harness: "codex",
      root: "/tmp/lesson",
      developerInstructions: "Teach",
      loadedSessions: new Set<string>(),
      loadingSessions: new Map<string, Promise<void>>(),
      ready: Promise.resolve(),
    };
    (client as unknown as { runtimes: Map<string, unknown> }).runtimes.set("lesson", runtime);

    const configuration = {
      root: "/tmp/lesson",
      runtimeKey: "lesson",
      harness: "codex" as const,
      developerInstructions: "Teach",
    };
    const first = client.resumeThread("session-1", configuration);
    const second = client.resumeThread("session-1", configuration);
    await vi.waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first, second]);

    expect(runtime.loadedSessions).toContain("session-1");
    expect(configureSession).toHaveBeenCalledOnce();
    expect(configureSession).toHaveBeenCalledWith(runtime.connection, "session-1", []);
  });

  it("uses OpenCode normally and keeps the environment variable as an override", () => {
    expect(dojofooHarness({})).toBe("opencode");
    expect(dojofooHarness({ DOJOFOO_HARNESS: "codex" })).toBe("codex");
    expect(() => dojofooHarness({ DOJOFOO_HARNESS: "unknown" })).toThrow("Unsupported Dojofoo harness");
  });
  it("retains the whole turn duration when ACP emits a late thought chunk", async () => {
    const client = new AcpClient();
    const clock = vi.spyOn(Date, "now");
    clock.mockReturnValue(1_000);
    (client as unknown as { turnStartedAt: Map<string, number> }).turnStartedAt.set("session-1", Date.now());
    clock.mockReturnValue(4_700);

    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Planning the next explanation" } },
    });

    expect(await client.history("session-1")).toEqual([
      expect.objectContaining({ startedAt: 1_000, completedAt: 4_700 }),
    ]);
    clock.mockRestore();
  });

  it("does not reuse an unannounced ACP replay part in the next live stream", () => {
    const client = new AcpClient();
    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Historical reply" } },
    });
    (client as unknown as { finishOpenParts(sessionId: string): void }).finishOpenParts("session-1");

    const parts: AcpStreamPart[] = [];
    (client as unknown as { callbacks: Map<string, (part: AcpStreamPart) => void> })
      .callbacks.set("session-1", (part) => parts.push(part));
    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Live reply" } },
    });
    (client as unknown as { finishOpenParts(sessionId: string): void }).finishOpenParts("session-1");

    expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end"]);
  });

  it("timestamps check tools projected from ACP context", async () => {
    const client = new AcpClient();
    (client as unknown as { turnStartedAt: Map<string, number> }).turnStartedAt.set("session-1", 2_000);
    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: "dojo://lessons/example/checks/check-1\n<context ref=\"dojo://lessons/example/checks/check-1\">\n{\"report\":{\"passed\":1,\"total\":1}}\n</context>",
        },
      },
    });

    expect(await client.history("session-1")).toEqual([
      expect.objectContaining({ kind: "tool", startedAt: 2_000 }),
    ]);
  });

  it("projects native ACP lesson resources through the same transcript rules", async () => {
    const client = new AcpClient();
    (client as unknown as { turnStartedAt: Map<string, number> }).turnStartedAt.set("session-1", 3_000);
    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "resource",
          resource: {
            uri: "dojo://lessons/example/checks/check-1",
            mimeType: "application/json",
            text: '{"report":{"passed":1,"total":2}}',
          },
        },
      },
    });
    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "resource",
          resource: {
            uri: "dojo://sensei/instructions",
            mimeType: "text/plain",
            text: "Hidden policy",
          },
        },
      },
    });

    expect(await client.history("session-1")).toEqual([
      expect.objectContaining({ kind: "tool", startedAt: 3_000 }),
    ]);
  });

  it("isolates native developer instructions and runs owned lesson runtimes in yolo mode", () => {
    const base = {
      CODEX_CONFIG: JSON.stringify({ model: "gpt-5", sandbox_mode: "workspace-write" }),
      PATH: "/usr/bin",
    };
    const first = codexRuntimeEnvironment("Teach lesson one", base);
    const second = codexRuntimeEnvironment("Teach lesson two", base);

    expect(JSON.parse(first.CODEX_CONFIG ?? "{}")).toEqual({
      model: "gpt-5",
      sandbox_mode: "danger-full-access",
      approval_policy: "never",
      developer_instructions: "Teach lesson one",
    });
    expect(JSON.parse(second.CODEX_CONFIG ?? "{}")).toEqual({
      model: "gpt-5",
      sandbox_mode: "danger-full-access",
      approval_policy: "never",
      developer_instructions: "Teach lesson two",
    });
    expect(first.INITIAL_AGENT_MODE).toBe("agent-full-access");
    expect(second.INITIAL_AGENT_MODE).toBe("agent-full-access");
    expect(base.CODEX_CONFIG).not.toBe(first.CODEX_CONFIG);
  });

  it("isolates lesson instructions in an OpenCode primary agent", () => {
    const environment = opencodeRuntimeEnvironment("Teach this lesson only", {
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "openai/gpt-5", agent: { review: { mode: "subagent" } } }),
    });
    const config = JSON.parse(environment.OPENCODE_CONFIG_CONTENT ?? "{}") as Record<string, any>;

    expect(config.model).toBe("openai/gpt-5");
    expect(config.default_agent).toBe("dojofoo");
    expect(config.agent.review).toEqual({ mode: "subagent" });
    expect(config.agent.dojofoo).toEqual(expect.objectContaining({
      mode: "primary",
      prompt: "Teach this lesson only",
    }));
  });

  it("projects standard ACP thought and message chunks without inventing lifecycle events", async () => {
    const client = new AcpClient();
    const parts: AcpStreamPart[] = [];
    (client as unknown as { callbacks: Map<string, (part: AcpStreamPart) => void> })
      .callbacks.set("session-1", (part) => parts.push(part));

    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Inspecting the failures" } },
    });
    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Check the method name." } },
    });

    expect(parts).toEqual([
      expect.objectContaining({ type: "reasoning-start" }),
      expect.objectContaining({ type: "reasoning-delta", delta: "Inspecting the failures" }),
      expect.objectContaining({ type: "text-start" }),
      expect.objectContaining({ type: "text-delta", delta: "Check the method name." }),
    ]);
    expect(await visibleHistory(client, "session-1")).toEqual([
      { role: "assistant", kind: "reasoning", text: "Inspecting the failures" },
      { role: "assistant", kind: "message", text: "Check the method name." },
    ]);
  });

  it("surfaces ACP permission requests through the existing question UI", async () => {
    const client = new AcpClient();
    const promise = (client as unknown as {
      requestPermission(value: Parameters<NonNullable<import("@agentclientprotocol/sdk").Client["requestPermission"]>>[0]): Promise<import("@agentclientprotocol/sdk").RequestPermissionResponse>;
    }).requestPermission({
      sessionId: "session-1",
      toolCall: { toolCallId: "tool-1", title: "Run tests" },
      options: [{ optionId: "allow_once", name: "Allow", kind: "allow_once" }],
    });

    client.answerUserInput("session-1", { decision: ["allow_once"] });
    await expect(promise).resolves.toEqual({ outcome: { outcome: "selected", optionId: "allow_once" } });
  });

  it("projects native Codex user input as an ACP elicitation for the question UI", async () => {
    const client = new AcpClient();
    const parts: AcpStreamPart[] = [];
    (client as unknown as { callbacks: Map<string, (part: AcpStreamPart) => void> })
      .callbacks.set("session-1", (part) => parts.push(part));
    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Choosing a completion prompt" } },
    });
    const promise = (client as unknown as {
      createElicitation(value: import("@agentclientprotocol/sdk").CreateElicitationRequest): Promise<import("@agentclientprotocol/sdk").CreateElicitationResponse>;
    }).createElicitation({
      sessionId: "session-1",
      toolCallId: "choice-1",
      mode: "form",
      message: "What would you like to do next?",
      requestedSchema: {
        type: "object",
        properties: {
          next: {
            type: "string",
            title: "Next step",
            oneOf: [
              { const: "Review", title: "Review" },
              { const: "Move on", title: "Move on" },
              { const: "Pause", title: "Pause" },
            ],
          },
        },
        required: ["next"],
      },
    });

    expect(parts.slice(-2)).toEqual([
      expect.objectContaining({
        type: "tool-input-start",
        toolCallId: "choice-1",
        toolName: "elicitation",
      }),
      expect.objectContaining({
        type: "tool-input-available",
        toolCallId: "choice-1",
        toolName: "elicitation",
        input: { questions: [expect.objectContaining({
          id: "next",
          options: [
            { id: "Review", title: "Review" },
            { id: "Move on", title: "Move on" },
            { id: "Pause", title: "Pause" },
          ],
        })] },
      }),
    ]);
    client.answerUserInput("session-1", { next: ["Move on"] });
    await expect(promise).resolves.toEqual({ action: "accept", content: { next: "Move on" } });
    expect(parts.at(-1)).toEqual(expect.objectContaining({
      type: "tool-output-available",
      toolCallId: "choice-1",
      output: { answers: { next: ["Move on"] } },
    }));
    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Continuing from the learner's choice" } },
    });
    expect(parts.filter((part) => part.type === "reasoning-start")).toHaveLength(2);
  });

  it("suppresses the internal silent sentinel while preserving completed thinking", async () => {
    const client = new AcpClient();
    const parts: AcpStreamPart[] = [];
    (client as unknown as { callbacks: Map<string, (part: AcpStreamPart) => void> })
      .callbacks.set("session-1", (part) => parts.push(part));

    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "No intervention is useful." } },
    });
    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "[dojo:" } },
    });
    receive(client, {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "silent]" } },
    });
    (client as unknown as { finishOpenParts(sessionId: string): void }).finishOpenParts("session-1");

    expect(parts.some((part) => part.type.startsWith("text-"))).toBe(false);
    expect(await visibleHistory(client, "session-1")).toEqual([
      { role: "assistant", kind: "reasoning", text: "No intervention is useful." },
    ]);
  });

  it("keeps private instructions hidden across legacy and current dojo URIs", async () => {
    const client = new AcpClient();

    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: "dojofoo://sensei/instructions\n<context ref=\"dojofoo://sensei/instructions\">\nHidden policy\n</context>\nWhat transformation remains?",
        },
      },
    });
    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: "dojo://lessons/normalize-handle/checks/latest\n<context ref=\"dojo://lessons/normalize-handle/checks/latest\">\nCurrent local test evidence: 2/4 passing.\n</context>",
        },
      },
    });

    expect(await visibleHistory(client, "session-1")).toEqual([
      { role: "user", kind: "message", text: "What transformation remains?" },
      { role: "assistant", kind: "reasoning", text: "Current local test evidence: 2/4 passing." },
    ]);
  });

  it("keeps wrapped ACP resources private after an agent replays them as plain text", async () => {
    const client = new AcpClient();

    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: "<context ref=\"dojo://sensei/instructions\">\nHidden policy\n</context>",
        },
      },
    });
    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "A visible learner message" },
      },
    });

    expect(await visibleHistory(client, "session-1")).toEqual([
      { role: "user", kind: "message", text: "A visible learner message" },
    ]);
  });

  it("removes a resource URI concatenated directly onto visible learner text", async () => {
    const client = new AcpClient();

    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "text",
          text: "dojo://lessons/001-normalize-handle/checks/latestUse the completion tool now.",
        },
      },
    });

    expect(await visibleHistory(client, "session-1")).toEqual([
      { role: "user", kind: "message", text: "Use the completion tool now." },
    ]);
  });

  it("does not project the private lesson introduction into chat history", async () => {
    const client = new AcpClient();

    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "resource",
          resource: {
            uri: "dojo://lessons/normalize-handle/introduction",
            mimeType: "text/plain",
            text: "Introduce this lesson without giving away the solution.",
          },
        },
      },
    });

    expect(await visibleHistory(client, "session-1")).toEqual([]);
  });

  it("does not project the private lesson bootstrap context into chat history", async () => {
    const client = new AcpClient();

    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: {
          type: "resource",
          resource: {
            uri: "dojo://courses/starter/lessons/normalize-handle/context",
            mimeType: "application/json",
            text: JSON.stringify({ phase: "resume", lesson: { id: "normalize-handle" } }),
          },
        },
      },
    });

    expect(await visibleHistory(client, "session-1")).toEqual([]);
  });

  it.each(["rawOutput", "terminal_output_delta"])("projects an agent-run JSON kata check from %s as the lesson-check tool", async outputChannel => {
    const client = new AcpClient();
    const parts: AcpStreamPart[] = [];
    (client as unknown as { callbacks: Map<string, (part: AcpStreamPart) => void> })
      .callbacks.set("session-1", (part) => parts.push(part));

    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "check-1",
        title: "node dojofoo kata --check --reporter=json",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "node dojofoo kata --check --reporter=json", cwd: "/tmp/dojo" },
        content: [],
      },
    });
    if (outputChannel === "terminal_output_delta") {
      for (const data of ['{"passed":2,"failed":', '2,"total":4,"tests":[]}']) {
        receive(client, {
          sessionId: "session-1",
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "check-1",
            _meta: { terminal_output_delta: { data, terminal_id: "check-1" } },
          },
        });
      }
    }
    receive(client, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "check-1",
        status: "completed",
        rawOutput: outputChannel === "rawOutput"
          ? { formatted_output: '{"passed":2,"failed":2,"total":4,"tests":[]}', exit_code: 1 }
          : { exit_code: 1 },
      },
    });

    expect(parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool-input-available", toolName: "dojo_lesson_verify" }),
      expect.objectContaining({ type: "tool-output-available", output: expect.objectContaining({ passed: 2, total: 4 }) }),
    ]));
    expect(await client.history("session-1")).toEqual([
      expect.objectContaining({
        role: "assistant",
        kind: "tool",
        text: expect.stringContaining('"name":"dojo_lesson_verify"'),
      }),
    ]);
  });
});
