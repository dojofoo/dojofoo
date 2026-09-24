import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodexHarnessAdapter } from "./codex";
import { configureOpenCodeSessionModel, createOpenCodeHarnessAdapter, opencodeExecutable } from "./opencode";
import { dojofooHarness, harnessAdapter } from "./registry";
import { promptContextBlock } from "../lesson/codex-client";

describe("ACP harness adapters", () => {
  it("preserves the installed executable when a fixture isolates the user home", () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-opencode-resolution-"));
    try {
      const home = join(root, "user");
      const binary = join(home, ".opencode/bin/opencode");
      mkdirSync(join(home, ".opencode/bin"), { recursive: true });
      writeFileSync(binary, "fixture executable");
      const selected = opencodeExecutable({}, home);
      expect(selected).toBe(binary);
      const adapter = createOpenCodeHarnessAdapter({ OPENCODE_BIN: selected }, join(root, "isolated"));
      expect(adapter.process({ root, developerInstructions: "Teach" }).command).toBe(binary);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("encapsulates Codex process configuration", () => {
    const adapter = createCodexHarnessAdapter({ PATH: "/bin", CODEX_CONFIG: JSON.stringify({ model: "gpt-5" }) });
    const process = adapter.process({ root: "/tmp/lesson", developerInstructions: "Teach this lesson" });

    expect(adapter.kind).toBe("codex");
    expect(process.args[0]).toContain("codex-acp");
    expect(JSON.parse(process.environment.CODEX_CONFIG ?? "{}")).toEqual(expect.objectContaining({
      model: "gpt-5",
      developer_instructions: "Teach this lesson",
    }));
    expect(adapter.encodeResource({ uri: "dojo://lesson", text: "private" })).toBe("private");
  });

  it("encapsulates OpenCode process, resource, and model configuration", async () => {
    const connection = { setSessionConfigOption: vi.fn().mockResolvedValue({}) };
    const adapter = createOpenCodeHarnessAdapter({
      OPENCODE_BIN: "/opt/opencode",
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "anthropic/claude" }),
    });

    expect(adapter.process({ root: "/tmp/lesson", developerInstructions: "Teach" })).toEqual(expect.objectContaining({
      command: "/opt/opencode",
      args: ["acp", "--cwd", "/tmp/lesson"],
    }));
    const environment = adapter.process({ root: "/tmp/lesson", developerInstructions: "Teach" }).environment;
    expect(JSON.parse(environment.OPENCODE_CONFIG_CONTENT ?? "{}")).toMatchObject({
      experimental: { mcp_timeout: 600_000 },
    });
    expect(adapter.encodeResource({ uri: "dojo://lesson", text: "private" }))
      .toBe('<context ref="dojo://lesson">\nprivate\n</context>');
    await adapter.configureSession(connection as never, "session-1");
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "session-1",
      configId: "model",
      value: "anthropic/claude",
    });
  });

  it("preserves an explicit OpenCode MCP timeout", () => {
    const adapter = createOpenCodeHarnessAdapter({
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ experimental: { mcp_timeout: 42_000 } }),
    });
    const environment = adapter.process({ root: "/tmp/lesson", developerInstructions: "Teach" }).environment;

    expect(JSON.parse(environment.OPENCODE_CONFIG_CONTENT ?? "{}")).toMatchObject({
      experimental: { mcp_timeout: 42_000 },
    });
  });

  it("selects registered harnesses and rejects unknown names", () => {
    expect(dojofooHarness({})).toBe("opencode");
    expect(harnessAdapter("codex").kind).toBe("codex");
    expect(harnessAdapter("cursor").process({ root: "/tmp/lesson", developerInstructions: "Teach" }).args)
      .toEqual(["--yolo", "--trust", "acp"]);
    expect(harnessAdapter("cursor").contextualInstructions).toBe(true);
    expect(harnessAdapter("grok").process({ root: "/tmp/lesson", developerInstructions: "Teach" }).args)
      .toEqual(["--rules", "Teach", "--permission-mode", "bypassPermissions", "agent", "stdio"]);
    expect(harnessAdapter("fx").process({ root: "/tmp/lesson", developerInstructions: "Teach" }).args)
      .toEqual(["acp"]);
    expect(harnessAdapter("fx").process({ root: "/tmp/lesson", developerInstructions: "Teach" }).environment.FX_PERMISSION_MODE)
      .toBe("yolo");
    expect(harnessAdapter("fx").contextualInstructions).toBe(true);
    expect(harnessAdapter("fx").supportsVirtualResourceUris).toBe(false);
    expect(() => dojofooHarness({ DOJOFOO_HARNESS: "unknown" })).toThrow("Unsupported Dojofoo harness");
  });

  it("negotiates embedded context and falls back for virtual URI incompatibilities", () => {
    const resource = { uri: "dojo://lesson", mimeType: "text/plain", text: "private" };

    expect(promptContextBlock(harnessAdapter("cursor"), { embeddedContext: false }, resource).type)
      .toBe("text");
    expect(promptContextBlock(harnessAdapter("grok"), { embeddedContext: true }, resource).type)
      .toBe("resource");
    expect(promptContextBlock(harnessAdapter("fx"), { embeddedContext: true }, resource).type)
      .toBe("text");
  });

  it("isolates model discovery for OpenCode versions without ACP config options", async () => {
    const connection = {
      setSessionConfigOption: vi.fn().mockRejectedValue(new Error("Method not found")),
      request: vi.fn().mockResolvedValue({}),
    };
    const adapter = createOpenCodeHarnessAdapter(
      { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "anthropic/claude" }) },
      "/tmp/home",
      () => ["opencode/free", "anthropic/claude"],
    );

    await expect(adapter.configureSession(connection as never, "session-1", [])).resolves.toEqual([
      expect.objectContaining({
        category: "model",
        currentValue: "anthropic/claude",
        options: [
          expect.objectContaining({ group: "opencode" }),
          expect.objectContaining({ group: "anthropic" }),
        ],
      }),
    ]);
  });

  it("preserves the actionable error when both OpenCode model operations fail", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = new Error("legacy model selection failed");
    const connection = {
      setSessionConfigOption: vi.fn().mockRejectedValue(new Error("Method not found")),
      request: vi.fn().mockRejectedValue(failure),
    } as unknown as import("@agentclientprotocol/sdk").ClientSideConnection;

    await expect(configureOpenCodeSessionModel(connection, "session-1", "openai/codex"))
      .rejects.toBe(failure);
    expect(warning).toHaveBeenCalledWith(
      "OpenCode rejected both ACP model configuration methods",
      failure,
    );
    warning.mockRestore();
  });
});
