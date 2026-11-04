import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface OpenCodeEvent {
  type?: string;
  part?: { type?: string; text?: string; tool?: string; toolName?: string; name?: string };
}

const workspace = resolve(import.meta.dirname, "../../..");
const fixture = resolve(import.meta.dirname, "../courses/kata-capabilities");
const [platform, style, course, lesson, skill] = await Promise.all([
  readFile(
    resolve(workspace, "packages/authoring/src/sensei/contracts/DOJOFOO.md"),
    "utf8"
  ),
  readFile(
    resolve(workspace, "packages/authoring/src/sensei/contracts/KATAS.md"),
    "utf8"
  ),
  readFile(resolve(fixture, "DOJO.md"), "utf8"),
  readFile(resolve(fixture, "katas/001-transformation/SENSEI.md"), "utf8"),
  readFile(resolve(workspace, "packages/cli/skills/dojofoo/SKILL.md"), "utf8"),
]);
const root = await mkdtemp(join(tmpdir(), "dojofoo-transformation-eval-"));
const startedAt = Date.now();
try {
  const callsFile = join(root, "tool-calls.jsonl");
  const solutionFile = join(root, "solution.ts");
  await writeFile(callsFile, "");
  await writeFile(solutionFile, [
    "export function normalizeHandle(input: string): string {",
    "  return input.trim().toLowerCase().replace(' ', '-');",
    "}",
  ].join("\n"));
  const skillDirectory = join(root, ".opencode/skills/dojofoo");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, "SKILL.md"), skill);

  const instructions = [platform, style, course, lesson].join("\n\n");
  const config = {
    default_agent: "dojofoo-eval",
    agent: {
      "dojofoo-eval": {
        mode: "primary",
        description: "Evaluate a Dojofoo kata teaching interaction.",
        prompt: instructions,
        permission: {
          read: "allow", glob: "allow", grep: "allow", list: "allow", skill: "allow",
          webfetch: "allow", bash: "deny", edit: "deny", external_directory: "deny",
        },
      },
    },
    mcp: {
      dojofoo: {
        type: "local",
        command: [join(import.meta.dirname, "../node_modules/.bin/tsx"), join(import.meta.dirname, "eval-mcp.ts")],
        enabled: true,
        environment: { DOJOFOO_EVAL_CALLS: callsFile },
      },
    },
  };
  const command = process.env.OPENCODE_BIN ?? join(process.env.HOME ?? "", ".opencode/bin/opencode");
  const prompt = [
    '{"type":"learner.message","lessonActive":true}',
    "I changed solution.ts, but the mixed-whitespace checks still fail.",
    "I don't know the JavaScript replacement or regex APIs well enough to understand why. Please inspect what I tried and teach me from documentation.",
  ].join("\n");
  const child = spawn(command, [
    "run", "--format", "json", "--pure", "--auto", "--dir", root, "--agent", "dojofoo-eval",
    ...(process.env.DOJOFOO_EVAL_MODEL ? ["--model", process.env.DOJOFOO_EVAL_MODEL] : []),
    prompt,
  ], { env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }, stdio: ["ignore", "pipe", "inherit"] });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { output += chunk; });
  const exitCode = await new Promise<number | null>((done, reject) => {
    child.once("error", reject);
    child.once("exit", done);
  });
  if (exitCode !== 0) throw new Error(`OpenCode exited with status ${exitCode ?? "unknown"}`);

  const events = output.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as OpenCodeEvent);
  const text = events.filter((event) => event.type === "text" && event.part?.text).map((event) => event.part!.text).join("").trim();
  const builtinTools = events
    .filter((event) => event.type === "tool_use" || event.part?.type === "tool")
    .map((event) => event.part?.tool ?? event.part?.toolName ?? event.part?.name ?? "unknown");
  const harnessTools = builtinTools.filter((tool) => !tool.startsWith("dojofoo_"));
  const calls = (await readFile(callsFile, "utf8")).split(/\r?\n/u).filter(Boolean)
    .map((line) => JSON.parse(line) as { name: string; input: unknown });
  const sourceUrls = [...text.matchAll(/https:\/\/[^\s)]+/gu)].map((match) => match[0].replace(/[.,]$/u, ""));
  const lessonActionNames = calls.map((call) => call.name);
  const assertions = [
    { name: "inspects learner code", passed: harnessTools.includes("read"), evidence: harnessTools },
    { name: "retrieves authoritative documentation", passed: harnessTools.includes("webfetch"), evidence: harnessTools },
    { name: "cites a retrieved source", passed: sourceUrls.some((url) => url.includes("developer.mozilla.org")), evidence: sourceUrls },
    { name: "does not expose the final expression", passed: !/replace\s*\(\s*\/\\s\+\/g?\s*,/u.test(text) },
    { name: "describes literal replacement accurately", passed: !/red {2}-blue/iu.test(text) },
    { name: "does not edit learner work", passed: !harnessTools.some((tool) => tool === "edit" || tool === "write"), evidence: harnessTools },
    {
      name: "uses only relevant lesson actions",
      passed: lessonActionNames.every((name) => name === "dojo_context" || name === "dojo_lesson_verify" || name === "dojo_ui_show")
        && lessonActionNames.filter((name) => name === "dojo_context").length <= 1
        && lessonActionNames.filter((name) => name === "dojo_lesson_verify").length <= 1
        && lessonActionNames.filter((name) => name === "dojo_ui_show").length <= 1,
      evidence: calls,
    },
    {
      name: "keeps tool mechanics out of the lesson",
      passed: !/let me (?:look|inspect|check|run|fetch)|I (?:read|ran|checked|fetched)|tool|command/iu.test(text),
    },
    { name: "keeps the response focused", passed: (text.match(/\?/gu) ?? []).length <= 2 },
    { name: "keeps documentation help concise", passed: text.length <= 1400, evidence: `${text.length}/1400 characters` },
  ];
  process.stdout.write(`${JSON.stringify({
    scenario: "kata-capabilities/001/documented-api-gap",
    harness: "opencode-local",
    model: process.env.DOJOFOO_EVAL_MODEL ?? "configured-default",
    durationMs: Date.now() - startedAt,
    response: {
      characters: text.length,
      preview: text.slice(0, 1600),
    },
    toolNames: [...harnessTools, ...calls.map((call) => call.name)],
    score: assertions.filter((assertion) => assertion.passed).length / assertions.length,
    assertions,
  }, null, 2)}\n`);
  if (assertions.some((assertion) => !assertion.passed)) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
