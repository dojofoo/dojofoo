import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readAgentModel, resolveAgent, writeAgent, writeAgentModel } from "@dojofoo/config/runtime";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A workspace, a state home and an install home with no coding agents, wherever the test runs. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dojo-agent-selection-"));
  roots.push(root);
  for (const directory of ["workspace/.dojo", "state", "home"]) mkdirSync(join(root, directory), { recursive: true });
  const home = join(root, "home");
  // Windows search locations stay inside the fixture, so no CLI installed on this machine is found.
  const discovery = { home, platform: "win32" as const, environment: { PATH: "", APPDATA: join(home, "AppData"), LOCALAPPDATA: join(home, "Local") } };
  return {
    workspace: join(root, "workspace"),
    state: join(root, "state"),
    home,
    options: { environment: { DOJOFOO_HOME: join(root, "state") }, discovery },
  };
}

function install(home: string, command: string) {
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  writeFileSync(join(home, ".local/bin", command), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}

it("a workspace's saved agent wins over the onboarding default and installed CLIs", () => {
  const { workspace, state, home, options } = fixture();
  writeFileSync(join(state, "settings.json"), JSON.stringify({ agents: ["claude"] }));
  install(home, "grok");
  writeFileSync(join(workspace, ".dojo/runtimes.json"), JSON.stringify({ agent: "codex" }));
  expect(resolveAgent(workspace, options)).toBe("codex");
});

it("the onboarding default is the first offered agent in settings.json", () => {
  const { workspace, state, home, options } = fixture();
  install(home, "grok");
  writeFileSync(join(state, "settings.json"), JSON.stringify({ agents: ["pi", "cursor", "claude"] }));
  expect(resolveAgent(workspace, options)).toBe("cursor");
  writeFileSync(join(state, "settings.json"), JSON.stringify({ agent: "fx" }));
  expect(resolveAgent(workspace, options)).toBe("fx");
});

it("without a saved or onboarding choice, the first offered installed CLI is used, else OpenCode", () => {
  const { workspace, home, options } = fixture();
  expect(resolveAgent(workspace, options)).toBe("opencode");
  install(home, "pi");
  expect(resolveAgent(workspace, options)).toBe("opencode");
  install(home, "fx");
  install(home, "grok");
  expect(resolveAgent(workspace, options)).toBe("grok");
});

it("an agent that is not offered is skipped with one warning", () => {
  const { workspace, state, options } = fixture();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  writeFileSync(join(state, "settings.json"), JSON.stringify({ agents: ["codex"] }));
  writeFileSync(join(workspace, ".dojo/runtimes.json"), JSON.stringify({ agent: "pi" }));
  expect(resolveAgent(workspace, options)).toBe("codex");
  expect(resolveAgent(workspace, options)).toBe("codex");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain('"pi"');
});

it("reports a malformed runtimes.json instead of switching agents", () => {
  const { workspace, options } = fixture();
  const path = join(workspace, ".dojo/runtimes.json");
  writeFileSync(path, JSON.stringify({ agent: 123 }));
  expect(() => resolveAgent(workspace, options)).toThrow(`Invalid agent in ${path}`);
  writeFileSync(path, JSON.stringify(["codex"]));
  expect(() => resolveAgent(workspace, options)).toThrow(`Invalid agent in ${path}`);
});

it("old authoring and lesson keys are ignored with one warning", () => {
  const { workspace, options } = fixture();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  writeFileSync(join(workspace, ".dojo/runtimes.json"), JSON.stringify({ authoring: "pi", lesson: "codex" }));
  expect(resolveAgent(workspace, options)).toBe("opencode");
  expect(resolveAgent(workspace, options)).toBe("opencode");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain("authoring and lesson keys");
});

it("DOJOFOO_HARNESS and the other removed variables are ignored with one warning each", () => {
  const { workspace, options } = fixture();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  writeFileSync(join(workspace, ".dojo/runtimes.json"), JSON.stringify({ agent: "claude" }));
  const environment = { ...options.environment, DOJOFOO_HARNESS: "codex", DOJOFOO_LESSON_HARNESS: "codex",
    DOJOFOO_AUTHORING_HARNESS: "codex", DOJOFOO_MODEL: "gpt", DOJOFOO_LESSON_MODEL: "gpt", DOJOFOO_AUTHORING_MODEL: "" };
  expect(resolveAgent(workspace, { ...options, environment })).toBe("claude");
  expect(resolveAgent(workspace, { ...options, environment })).toBe("claude");
  const messages = warn.mock.calls.map(([message]) => String(message));
  expect(messages).toHaveLength(5);
  for (const name of ["DOJOFOO_HARNESS", "DOJOFOO_LESSON_HARNESS", "DOJOFOO_AUTHORING_HARNESS", "DOJOFOO_MODEL", "DOJOFOO_LESSON_MODEL"]) {
    expect(messages).toContain(`${name} is ignored: each workspace keeps its coding agent in .dojo/runtimes.json; choose it in the composer's agent menu.`);
  }
});

it("writeAgent keeps other keys, drops authoring and lesson, and refuses agents that are not offered", () => {
  const { workspace, options } = fixture();
  const path = join(workspace, ".dojo/runtimes.json");
  writeFileSync(path, JSON.stringify({ models: { codex: "gpt" }, authoring: "pi", lesson: "codex", agent: "claude" }));
  writeAgent(workspace, "codex");
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ models: { codex: "gpt" }, agent: "codex" });
  expect(resolveAgent(workspace, options)).toBe("codex");
  expect(() => writeAgent(workspace, "pi")).toThrow("Pi isn't available yet. Choose another coding agent.");
  expect(() => writeAgent(workspace, "nope" as "codex")).toThrow("Unsupported coding agent: nope");
  expect(JSON.parse(readFileSync(path, "utf8")).agent).toBe("codex");
  const fresh = join(workspace, "fresh");
  writeAgent(fresh, "opencode");
  expect(JSON.parse(readFileSync(join(fresh, ".dojo/runtimes.json"), "utf8"))).toEqual({ agent: "opencode" });
});

it("the workspace keeps one last model per agent next to its agent", () => {
  const { workspace, options } = fixture();
  const path = join(workspace, ".dojo/runtimes.json");
  writeFileSync(path, JSON.stringify({ agent: "codex", theme: "dark" }));
  expect(readAgentModel(workspace, "codex")).toBeUndefined();
  writeAgentModel(workspace, "codex", "gpt-5.5");
  writeAgentModel(workspace, "opencode", "openai/gpt-4o-mini");
  writeAgentModel(workspace, "codex", "gpt-5.4");
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ agent: "codex", theme: "dark", models: { codex: "gpt-5.4", opencode: "openai/gpt-4o-mini" } });
  expect(readAgentModel(workspace, "codex")).toBe("gpt-5.4");
  expect(readAgentModel(workspace, "opencode")).toBe("openai/gpt-4o-mini");
  expect(readAgentModel(workspace, "claude")).toBeUndefined();
  // Selecting another agent keeps the models
  writeAgent(workspace, "opencode", options);
  expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ agent: "opencode", models: { codex: "gpt-5.4" } });
});
