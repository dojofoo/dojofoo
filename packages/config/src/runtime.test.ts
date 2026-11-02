import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveRuntimeHarness } from "./runtime";
import { discoverAgents, resolveAgentExecutable } from "./agent-installations";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("resolves global, project, environment and role-specific overrides without mixing roles", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-runtime-"));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home);
  const env = { DOJOFOO_HOME: home };
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("opencode");
  writeFileSync(join(home, "runtimes.json"), JSON.stringify({ authoring: "pi", lesson: "codex" }));
  expect(resolveRuntimeHarness("authoring", root, env)).toBe("pi");
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("codex");
  mkdirSync(join(root, ".dojo"));
  writeFileSync(join(root, ".dojo/runtimes.json"), JSON.stringify({ lesson: "cursor" }));
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("cursor");
  expect(resolveRuntimeHarness("authoring", root, env)).toBe("pi");
  expect(resolveRuntimeHarness("lesson", root, { ...env, DOJOFOO_HARNESS: "grok" })).toBe("grok");
  expect(resolveRuntimeHarness("lesson", root, { ...env, DOJOFOO_HARNESS: "grok", DOJOFOO_LESSON_HARNESS: "fx" })).toBe("fx");
  writeFileSync(join(root, ".dojo/runtimes.json"), JSON.stringify({ lesson: "opencode" }));
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("opencode");
});

it("reports malformed settings rather than silently switching harness", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-runtime-"));
  roots.push(root);
  mkdirSync(join(root, ".dojo"));
  writeFileSync(join(root, ".dojo/runtimes.json"), JSON.stringify({ lesson: 123 }));
  expect(() => resolveRuntimeHarness("lesson", root, { DOJOFOO_HOME: root })).toThrow("Invalid lesson harness");
});

it("automatically discovers executable installations outside PATH without running agents", () => {
  const home = mkdtempSync(join(tmpdir(), "dojo-installed-agents-"));
  roots.push(home);
  const options = { home, environment: { PATH: "" } };
  expect(discoverAgents(options).find(agent => agent.id === "claude")?.found).toBe(false);
  for (const [directory, command] of [[".local/bin", "claude"], [".bun/bin", "pi"]]) {
    mkdirSync(join(home, directory), { recursive: true });
    writeFileSync(join(home, directory, command), "#!/bin/sh\nexit 23\n", { mode: 0o755 });
  }
  const installed = discoverAgents(options);
  expect(installed.find(agent => agent.id === "claude")).toMatchObject({ found: true, executable: join(home, ".local/bin/claude") });
  expect(installed.find(agent => agent.id === "pi")).toMatchObject({ found: true, executable: join(home, ".bun/bin/pi") });
  expect(resolveAgentExecutable("pi", options)).toBe(join(home, ".bun/bin/pi"));
});

it("uses executable overrides consistently for discovery and runtime resolution", () => {
  const home = mkdtempSync(join(tmpdir(), "dojo-agent-override-"));
  roots.push(home);
  const executable = join(home, "custom-codex");
  writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const options = { home, environment: { PATH: "", CODEX_PATH: executable } };
  expect(resolveAgentExecutable("codex", options)).toBe(executable);
  expect(discoverAgents(options).find(agent => agent.id === "codex")).toMatchObject({ found: true, executable });
  rmSync(executable);
  expect(resolveAgentExecutable("codex", options)).toBeNull();
});

it("uses the same selected harness for lessons and authoring without UI overrides", () => {
  const home = mkdtempSync(join(tmpdir(), "dojo-selected-agents-"));
  roots.push(home);
  writeFileSync(join(home, "settings.json"), JSON.stringify({ agents: ["claude", "pi", "codex"] }));
  const environment = { DOJOFOO_HOME: home };
  expect(resolveRuntimeHarness("lesson", home, environment)).toBe("claude");
  expect(resolveRuntimeHarness("authoring", home, environment)).toBe("claude");
  writeFileSync(join(home, "runtimes.json"), JSON.stringify({ authoring: "opencode" }));
  expect(resolveRuntimeHarness("authoring", home, environment)).toBe("opencode");
});
