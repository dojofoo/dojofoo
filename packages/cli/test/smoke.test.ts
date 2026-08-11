import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, chmodSync, lstatSync, readlinkSync, readdirSync } from "node:fs";
import { rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

import { setup, setupAgents, configuredAgents, AGENTS, type AgentName } from "../src/commands/setup";
import { intro } from "../src/commands/intro";
import { kata } from "../src/commands/kata";
import { journalPath, appendNote, readLearnings } from "../src/journal";
import { runLifecycleScript } from "../src/commands/add";
import { remove } from "../src/commands/remove";
import { track } from "../src/commands/track";

// --- Helpers ---

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "dojo-test-"));
}

function writeRc(root: string, rc: object): void {
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify(rc));
}

function readRc(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, ".dojorc"), "utf8"));
}

function writeDojoMd(root: string, dojo: string, content: string): void {
  const dir = dojo
    ? resolve(root, ".dojos", dojo)
    : resolve(root, ".dojos");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "DOJO.md"), content);
}

function writeDojoJson(root: string, dojo: string, manifest: object): void {
  const dir = resolve(root, ".dojos", dojo);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "dojo.json"), JSON.stringify(manifest));
}

function writeSenseiMd(root: string, dojo: string, kataDir: string, content: string): void {
  const dir = resolve(root, ".dojos", dojo, kataDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "SENSEI.md"), content);
}

function writeWorkspaceFile(root: string, kataName: string, filename: string): void {
  const dir = resolve(root, "katas", kataName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, filename), "// scaffold");
}

function captureLog(fn: () => void): string {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    fn();
    return spy.mock.calls.map((c) => c.join(" ")).join("\n");
  } finally {
    spy.mockRestore();
  }
}

// --- Tests ---

describe("dojo setup", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("outputs AskUserQuestion prompt when no flags given and no agent env var present", () => {
    // Clear any agent-identifying env vars so detection falls back to the prompt
    const envKeys = Object.values(AGENTS).flatMap((cfg) => cfg.envVars);
    for (const key of envKeys) vi.stubEnv(key, "");

    try {
      const output = captureLog(() => setup(root, []));
      expect(output).toContain("AskUserQuestion");
      expect(output).toContain("Claude Code");
      expect(output).toContain("Gemini CLI");
      expect(output).toContain("Pi");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("setupAgents", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const allAgents = Object.keys(AGENTS) as AgentName[];

  it.each(allAgents)("%s: layout, symlinks, and settings match AGENTS config", (agent) => {
    setupAgents(root, [agent]);
    const cfg = AGENTS[agent];

    // Per-agent directories
    expect(existsSync(resolve(root, cfg.dir, cfg.commandsDir))).toBe(true);
    expect(existsSync(resolve(root, cfg.dir, "skills"))).toBe(true);

    // settings.json presence tracks hasSettings
    expect(existsSync(resolve(root, cfg.dir, "settings.json"))).toBe(cfg.hasSettings);

    // Each command is a symlink → canonical .agents/commands/<name>.md
    for (const name of ["dojo", "kata"] as const) {
      const link = resolve(root, cfg.dir, cfg.commandsDir, `${name}.md`);
      const canonical = resolve(root, ".agents/commands", `${name}.md`);

      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(resolve(resolve(root, cfg.dir, cfg.commandsDir), readlinkSync(link))).toBe(canonical);
      expect(existsSync(canonical)).toBe(true);
    }
  });

  it("writes canonical commands once at .agents/commands/", () => {
    setupAgents(root, ["claude"]);
    expect(existsSync(resolve(root, ".agents/commands/dojo.md"))).toBe(true);
    expect(existsSync(resolve(root, ".agents/commands/kata.md"))).toBe(true);
    const kataCommand = readFileSync(resolve(root, ".agents/commands/kata.md"), "utf8");
    expect(kataCommand).toContain("npx dojofoo status");
    expect(kataCommand).not.toContain("`dojo status`");
  });

  it("all configured agents serve identical kata content via symlink", () => {
    setupAgents(root, allAgents);

    const contents = allAgents.map((a) => {
      const cfg = AGENTS[a];
      return readFileSync(resolve(root, cfg.dir, cfg.commandsDir, "kata.md"), "utf8");
    });

    expect(new Set(contents).size).toBe(1);
  });

  it("only configures specified agents", () => {
    setupAgents(root, ["opencode", "codex"]);

    expect(existsSync(resolve(root, ".opencode/commands"))).toBe(true);
    expect(existsSync(resolve(root, ".codex/commands"))).toBe(true);
    expect(existsSync(resolve(root, ".claude"))).toBe(false);
    expect(existsSync(resolve(root, ".pi"))).toBe(false);
  });

  it("settings.json does not include legacy Agent(sensei) permission", () => {
    setupAgents(root, ["claude"]);
    const settings = JSON.parse(readFileSync(resolve(root, ".claude/settings.json"), "utf8"));
    expect(settings.permissions.allow).not.toContain("Agent(sensei)");
    expect(settings.permissions.allow).toContain("Bash(npx dojofoo *)");
  });
});

describe("configuredAgents", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("returns empty array when no agent dirs exist", () => {
    expect(configuredAgents(root)).toEqual([]);
  });

  it("detects agents whose directories exist", () => {
    mkdirSync(resolve(root, ".claude"), { recursive: true });
    mkdirSync(resolve(root, ".gemini"), { recursive: true });

    const agents = configuredAgents(root);
    expect(agents).toContain("claude");
    expect(agents).toContain("gemini");
    expect(agents).not.toContain("opencode");
    expect(agents).not.toContain("codex");
  });
});

describe("dojo intro", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("shows fallback when no dojo is active and no DOJO.md exists", () => {
    writeRc(root, { currentDojo: "", currentKata: null, editor: null });

    const output = captureLog(() => intro(root, []));
    expect(output).toContain("No dojo active");
    expect(output).toContain("add");
  });

  it("shows root DOJO.md when no dojo is active but DOJO.md exists", () => {
    writeRc(root, { currentDojo: "", currentKata: null, editor: null });
    writeDojoMd(root, "", "# Welcome to the Dojo");

    const output = captureLog(() => intro(root, []));
    expect(output).toContain("Welcome to the Dojo");
  });

  it("shows dojo-specific DOJO.md when a dojo is active", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: null, editor: null });
    writeDojoMd(root, "my-dojo", "# My Dojo Guide");

    const output = captureLog(() => intro(root, []));
    expect(output).toContain("My Dojo Guide");
  });

  it("shows 'no DOJO.md' when dojo has none", () => {
    writeRc(root, { currentDojo: "bare-dojo", currentKata: null, editor: null });
    mkdirSync(resolve(root, ".dojos/bare-dojo"), { recursive: true });

    const output = captureLog(() => intro(root, []));
    expect(output).toContain('has no DOJO.md');
  });

  it("offers switching when multiple dojos are installed", () => {
    writeRc(root, { currentDojo: "dojo-a", currentKata: null, editor: null });
    writeDojoMd(root, "dojo-a", "# Dojo A");
    mkdirSync(resolve(root, ".dojos/dojo-b"), { recursive: true });

    const output = captureLog(() => intro(root, []));
    expect(output).toContain("dojo-b");
    expect(output).toContain("AskUserQuestion");
  });

  it("does not mark dojo as introduced without --done", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: null, editor: null });
    writeDojoMd(root, "my-dojo", "# My Dojo");

    captureLog(() => intro(root, []));

    const rc = readRc(root);
    const progress = rc.progress as Record<string, Record<string, unknown>> | undefined;
    expect(progress?.["my-dojo"]?.introduced).toBeFalsy();
  });

  it("marks dojo as introduced with --done", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: null, editor: null });
    writeDojoMd(root, "my-dojo", "# My Dojo");

    captureLog(() => intro(root, ["--done"]));

    const rc = readRc(root);
    const progress = (rc.progress as Record<string, Record<string, unknown>>)["my-dojo"];
    expect(progress.introduced).toBe(true);
  });
});

describe("dojo kata intro", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("shows error when no dojo is active", () => {
    writeRc(root, { currentDojo: "", currentKata: null, editor: null });

    const output = captureLog(() => kata(root, ["intro"]));
    expect(output).toContain("No dojo active");
  });

  it("shows prompt when no kata in progress", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: null, editor: null });
    writeDojoJson(root, "my-dojo", {
      name: "my-dojo",
      version: "1.0.0",
      description: "test",
      test: "echo test",
      katas: [],
    });

    const output = captureLog(() => kata(root, ["intro"]));
    expect(output).toContain("No kata in progress");
  });

  it("shows SENSEI.md when kata is active", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", {
      name: "my-dojo",
      version: "1.0.0",
      description: "test",
      test: "echo test",
      katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
    });
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Welcome, Student\n\nYour first kata.");
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    const output = captureLog(() => kata(root, ["intro"]));
    expect(output).toContain("Welcome, Student");
  });

  it("shows fallback when SENSEI.md is missing", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", {
      name: "my-dojo",
      version: "1.0.0",
      description: "test",
      test: "echo test",
      katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
    });
    mkdirSync(resolve(root, ".dojos/my-dojo/katas/001-basics"), { recursive: true });
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    const output = captureLog(() => kata(root, ["intro"]));
    expect(output).toContain("No SENSEI.md found");
  });

  it("does not mark kata as introduced without --done", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", {
      name: "my-dojo",
      version: "1.0.0",
      description: "test",
      test: "echo test",
      katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
    });
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Welcome");
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    captureLog(() => kata(root, ["intro"]));

    const rc = readRc(root);
    const progress = rc.progress as Record<string, Record<string, unknown>> | undefined;
    expect(progress?.["my-dojo"]?.kataIntros).toBeFalsy();
  });

  it("marks kata as introduced with --done", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", {
      name: "my-dojo",
      version: "1.0.0",
      description: "test",
      test: "echo test",
      katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
    });
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Welcome");
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    captureLog(() => kata(root, ["intro", "--done"]));

    const rc = readRc(root);
    const progress = (rc.progress as Record<string, Record<string, unknown>>)["my-dojo"];
    expect(progress.kataIntros).toContain("001-basics");
  });
});

describe("dojo kata smart mode (intro tracking)", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const MANIFEST = {
    name: "my-dojo",
    version: "1.0.0",
    description: "test",
    test: "echo test",
    katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
  };

  it("shows SENSEI.md directly when dojo not yet introduced", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", MANIFEST);
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    const output = captureLog(() => kata(root, []));
    expect(output).toContain("No SENSEI.md found for 001-basics.");
  });

  it("shows SENSEI.md directly when dojo introduced but kata not", () => {
    writeRc(root, {
      currentDojo: "my-dojo",
      currentKata: "001-basics",
      editor: null,
      progress: { "my-dojo": { completed: [], lastActive: null, introduced: true } },
    });
    writeDojoJson(root, "my-dojo", MANIFEST);
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Sensei says hello");
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    const output = captureLog(() => kata(root, []));
    expect(output).toContain("Sensei says hello");
  });

  it("shows SENSEI.md when both dojo and kata are introduced", () => {
    writeRc(root, {
      currentDojo: "my-dojo",
      currentKata: "001-basics",
      editor: null,
      progress: { "my-dojo": { completed: [], lastActive: null, introduced: true, kataIntros: ["001-basics"] } },
    });
    writeDojoJson(root, "my-dojo", MANIFEST);
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Continue working");
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    const output = captureLog(() => kata(root, []));
    expect(output).toContain("Continue working");
  });
});

describe("dojo kata --note", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("creates JOURNAL.md with header and kata heading", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    mkdirSync(resolve(root, ".dojos/my-dojo"), { recursive: true });

    const output = captureLog(() => kata(root, ["--note", "Learned about types"]));
    expect(output).toContain("Noted for 001-basics");

    const journal = readFileSync(journalPath(root, "my-dojo"), "utf8");
    expect(journal).toContain("# Learning Journal");
    expect(journal).toContain("## 001-basics");
    expect(journal).toContain("- Learned about types");
  });

  it("appends multiple notes under same kata heading", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    mkdirSync(resolve(root, ".dojos/my-dojo"), { recursive: true });

    captureLog(() => kata(root, ["--note", "First observation"]));
    captureLog(() => kata(root, ["--note", "Second observation"]));

    const journal = readFileSync(journalPath(root, "my-dojo"), "utf8");
    const headingCount = journal.split("## 001-basics").length - 1;
    expect(headingCount).toBe(1);
    expect(journal).toContain("- First observation");
    expect(journal).toContain("- Second observation");
  });

  it("creates separate sections for different katas", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    mkdirSync(resolve(root, ".dojos/my-dojo"), { recursive: true });

    captureLog(() => kata(root, ["--note", "Basics note"]));

    // Switch kata
    writeRc(root, { currentDojo: "my-dojo", currentKata: "002-validation", editor: null });
    captureLog(() => kata(root, ["--note", "Validation note"]));

    const journal = readFileSync(journalPath(root, "my-dojo"), "utf8");
    expect(journal).toContain("## 001-basics");
    expect(journal).toContain("## 002-validation");
    expect(journal).toContain("- Basics note");
    expect(journal).toContain("- Validation note");
  });

  it("throws when no dojo active", () => {
    writeRc(root, { currentDojo: "", currentKata: null, editor: null });

    expect(() => kata(root, ["--note", "test"])).toThrow("No dojo active");
  });

  it("throws when no kata active", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: null, editor: null });

    expect(() => kata(root, ["--note", "test"])).toThrow("No kata in progress");
  });

  it("throws when note text missing", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });

    expect(() => kata(root, ["--note"])).toThrow("Usage:");
  });
});

describe("dojo kata --check reporting", () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", {
      name: "my-dojo",
      version: "1.0.0",
      description: "test",
      runner: { adapter: "exit-code" },
      test: "true",
      katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
    });
    writeWorkspaceFile(root, "001-basics", "solution.ts");
  });

  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("emits the normalized test report without agent prompts as JSON", () => {
    const output = captureLog(() => kata(root, ["--check", "--reporter=json"]));
    expect(JSON.parse(output)).toEqual({
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      tests: [{ name: "all tests", suite: [], status: "passed", failureMessages: [] }],
      error: null,
    });
    expect(output).not.toContain("<dojo:prompt>");
  });
});

describe("dojo:learnings emission", () => {
  let root: string;

  const MANIFEST = {
    name: "my-dojo",
    version: "1.0.0",
    description: "test",
    test: "echo test",
    katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
  };

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("emits <dojo:learnings> in smart mode when journal has content", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", MANIFEST);
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Sensei content");
    writeWorkspaceFile(root, "001-basics", "solution.ts");
    appendNote(root, "my-dojo", "001-basics", "Prior observation");

    const output = captureLog(() => kata(root, []));
    expect(output).toContain("<dojo:learnings>");
    expect(output).toContain("Prior observation");
  });

  it("does NOT emit <dojo:learnings> when journal is empty", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", MANIFEST);
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Sensei content");
    writeWorkspaceFile(root, "001-basics", "solution.ts");

    const output = captureLog(() => kata(root, []));
    expect(output).not.toContain("<dojo:learnings>");
  });

  it("emits <dojo:learnings> in kata intro flow", () => {
    writeRc(root, { currentDojo: "my-dojo", currentKata: "001-basics", editor: null });
    writeDojoJson(root, "my-dojo", MANIFEST);
    writeSenseiMd(root, "my-dojo", "katas/001-basics", "# Welcome");
    writeWorkspaceFile(root, "001-basics", "solution.ts");
    appendNote(root, "my-dojo", "001-basics", "Intro observation");

    const output = captureLog(() => kata(root, ["intro"]));
    expect(output).toContain("<dojo:learnings>");
    expect(output).toContain("Intro observation");
  });
});

describe("dojo track", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });

  it("records a Pi session log as a normalized cassette", () => {
    const source = resolve(root, "session.jsonl");
    writeFileSync(source, [
      JSON.stringify({ type: "session", id: "abc" }),
      JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "Start kata" }] } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "hidden" }, { type: "toolCall", name: "bash", arguments: { command: "dojo kata --start" } }] } }),
      JSON.stringify({ type: "message", message: { role: "toolResult", content: [{ type: "text", text: "Kata scaffolded" }] } }),
    ].join("\n"));

    vi.stubEnv("PI_CODING_AGENT", "1");
    const output = captureLog(() => track(root, ["--source", source]));
    expect(output).toContain("Recorded 3 entries");
    expect(output).toContain(".dojo/cassettes/");

    const dir = resolve(root, ".dojo/cassettes");
    const file = readdirSync(dir).find((name) => name.endsWith(".jsonl"));
    expect(file).toBeTruthy();

    const cassette = JSON.parse(readFileSync(resolve(dir, file!), "utf8"));
    expect(cassette[0]).toEqual({ role: "user", content: "Start kata" });
    expect(cassette[1].content).toEqual([{ type: "toolCall", name: "bash", command: "dojo kata --start" }]);
    expect(cassette[2]).toEqual({ role: "toolResult", content: "Kata scaffolded" });
  });

  it("lists recorded cassettes", () => {
    mkdirSync(resolve(root, ".dojo/cassettes"), { recursive: true });
    writeFileSync(resolve(root, ".dojo/cassettes/example.jsonl"), "[]\n");

    const output = captureLog(() => track(root, ["--list"]));
    expect(output).toContain(".dojo/cassettes/example.jsonl");
  });

  it("records on kata start and refreshes the same cassette on check", () => {
    const source = resolve(root, "session.jsonl");
    const firstMessage = JSON.stringify({
      type: "message",
      message: { role: "user", content: [{ type: "text", text: "Start next kata" }] },
    });
    writeFileSync(source, `${firstMessage}\n`);
    vi.stubEnv("DOJOCHO_SESSION_LOG", source);

    writeRc(root, { currentDojo: "my-dojo", currentKata: null, editor: null });
    writeDojoJson(root, "my-dojo", {
      name: "my-dojo",
      version: "1.0.0",
      description: "test",
      runner: { adapter: "exit-code" },
      test: "true",
      katas: [{ template: "katas/001-basics/solution.ts", name: "001-basics" }],
    });
    mkdirSync(resolve(root, ".dojos/my-dojo/katas/001-basics"), { recursive: true });
    writeFileSync(resolve(root, ".dojos/my-dojo/katas/001-basics/solution.ts"), "// template");

    captureLog(() => kata(root, ["--start"]));

    const dir = resolve(root, ".dojo/cassettes");
    const filesAfterStart = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
    expect(filesAfterStart).toHaveLength(1);
    expect(JSON.parse(readFileSync(resolve(dir, filesAfterStart[0]), "utf8"))).toHaveLength(1);

    const secondMessage = JSON.stringify({
      type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "Check progress" }] },
    });
    writeFileSync(source, `${firstMessage}\n${secondMessage}\n`);

    captureLog(() => kata(root, ["--check"]));

    const filesAfterCheck = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
    expect(filesAfterCheck).toEqual(filesAfterStart);
    expect(JSON.parse(readFileSync(resolve(dir, filesAfterStart[0]), "utf8"))).toHaveLength(2);
  });
});

describe("lifecycle scripts", () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("runs prepare.sh if present", () => {
    const dojoPath = resolve(root, ".dojos", "test-dojo");
    mkdirSync(dojoPath, { recursive: true });

    const script = `#!/usr/bin/env bash\ntouch "$PROJECT_ROOT/prepare-marker"`;
    writeFileSync(resolve(dojoPath, "prepare.sh"), script);
    chmodSync(resolve(dojoPath, "prepare.sh"), 0o755);

    runLifecycleScript(root, dojoPath, "prepare.sh");

    expect(existsSync(resolve(root, "prepare-marker"))).toBe(true);
  });

  it("runs teardown.sh if present", () => {
    const dojoPath = resolve(root, ".dojos", "test-dojo");
    mkdirSync(dojoPath, { recursive: true });

    const script = `#!/usr/bin/env bash\ntouch "$PROJECT_ROOT/teardown-marker"`;
    writeFileSync(resolve(dojoPath, "teardown.sh"), script);
    chmodSync(resolve(dojoPath, "teardown.sh"), 0o755);

    runLifecycleScript(root, dojoPath, "teardown.sh");

    expect(existsSync(resolve(root, "teardown-marker"))).toBe(true);
  });

  it("is a no-op when script is missing", () => {
    const dojoPath = resolve(root, ".dojos", "test-dojo");
    mkdirSync(dojoPath, { recursive: true });

    // Should not throw
    runLifecycleScript(root, dojoPath, "prepare.sh");
    runLifecycleScript(root, dojoPath, "teardown.sh");
  });

  it("prints warning but does not throw on script failure", () => {
    const dojoPath = resolve(root, ".dojos", "test-dojo");
    mkdirSync(dojoPath, { recursive: true });

    const script = `#!/usr/bin/env bash\nexit 1`;
    writeFileSync(resolve(dojoPath, "prepare.sh"), script);
    chmodSync(resolve(dojoPath, "prepare.sh"), 0o755);

    const output = captureLog(() => runLifecycleScript(root, dojoPath, "prepare.sh"));
    expect(output).toContain("Warning: prepare.sh exited with errors.");
  });

  it("dojo remove runs teardown.sh before deletion", () => {
    const dojoPath = resolve(root, ".dojos", "test-dojo");
    mkdirSync(dojoPath, { recursive: true });
    writeFileSync(resolve(dojoPath, "dojo.json"), JSON.stringify({ name: "test-dojo", version: "1.0.0", description: "test", test: "echo ok", katas: [] }));
    writeRc(root, { currentDojo: "test-dojo", currentKata: null, editor: null });

    const script = `#!/usr/bin/env bash\ntouch "$PROJECT_ROOT/teardown-ran"`;
    writeFileSync(resolve(dojoPath, "teardown.sh"), script);
    chmodSync(resolve(dojoPath, "teardown.sh"), 0o755);

    remove(root, ["test-dojo"]);

    expect(existsSync(resolve(root, "teardown-ran"))).toBe(true);
    expect(existsSync(dojoPath)).toBe(false);
  });
});
