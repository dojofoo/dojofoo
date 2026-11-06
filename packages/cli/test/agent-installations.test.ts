import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { discoverAgents, resolveAgentExecutable } from "@dojofoo/config/agent-installations";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

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

it("Cursor resolves cursor-agent even when another CLI's agent is first on PATH", () => {
  const home = mkdtempSync(join(tmpdir(), "dojo-cursor-agent-"));
  roots.push(home);
  const [first, second] = [join(home, "a"), join(home, "b")];
  mkdirSync(first);
  mkdirSync(second);
  writeFileSync(join(first, "agent"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(second, "cursor-agent"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  expect(resolveAgentExecutable("cursor", { environment: { PATH: `${first}:${second}` }, home })).toBe(join(second, "cursor-agent"));
});
