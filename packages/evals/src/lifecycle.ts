import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { lifecyclePrompt, lifecycleSolution, scoreLifecycle, type LifecycleStage } from "./lifecycle-scenario";

interface OpenCodeEvent {
  type?: string;
  part?: { type?: string; text?: string; tool?: string; toolName?: string; name?: string };
}

const allStages: LifecycleStage[] = ["start", "novice", "stuck", "complete", "review", "resume"];
const requested = process.env.DOJOFOO_EVAL_STAGE;
if (requested && !allStages.includes(requested as LifecycleStage)) {
  throw new Error(`Unknown lifecycle stage: ${requested}`);
}
const stages = requested ? [requested as LifecycleStage] : allStages;
const workspace = resolve(import.meta.dirname, "../../..");
const fixture = resolve(import.meta.dirname, "../courses/kata-capabilities");
const [platform, style, course, lesson, skill] = await Promise.all([
  readFile(
    resolve(workspace, "packages/agents/src/sensei/contracts/DOJOFOO.md"),
    "utf8"
  ),
  readFile(
    resolve(workspace, "packages/agents/src/sensei/contracts/KATAS.md"),
    "utf8"
  ),
  readFile(resolve(fixture, "DOJO.md"), "utf8"),
  readFile(resolve(fixture, "katas/001-transformation/SENSEI.md"), "utf8"),
  readFile(resolve(workspace, "packages/cli/skills/dojofoo/SKILL.md"), "utf8"),
]);
const root = await mkdtemp(join(tmpdir(), "dojofoo-lifecycle-eval-"));

try {
  const callsFile = join(root, "tool-calls.jsonl");
  await writeFile(join(root, "solution.ts"), lifecycleSolution("stuck"));
  const skillDirectory = join(root, ".opencode/skills/dojofoo");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(skillDirectory, "SKILL.md"), skill);
  const config = {
    default_agent: "dojofoo-eval",
    agent: {
      "dojofoo-eval": {
        mode: "primary",
        description: "Evaluate the Dojofoo lesson lifecycle.",
        prompt: [platform, style, course, lesson].join("\n\n"),
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
        environment: { DOJOFOO_EVAL_CALLS: callsFile, DOJOFOO_EVAL_COMPLETION_DECISIONS: "Pause" },
      },
    },
  };
  const command = process.env.OPENCODE_BIN ?? join(process.env.HOME ?? "", ".opencode/bin/opencode");

  for (const stage of stages) {
    await writeFile(callsFile, "");
    await writeFile(join(root, "solution.ts"), lifecycleSolution(stage));
    config.mcp.dojofoo.environment.DOJOFOO_EVAL_COMPLETION_DECISIONS = stage === "review" ? "Review,Pause" : "Pause";
    const startedAt = Date.now();
    const child = spawn(command, [
      "run", "--format", "json", "--pure", "--auto", "--dir", root, "--agent", "dojofoo-eval",
      ...(process.env.DOJOFOO_EVAL_MODEL ? ["--model", process.env.DOJOFOO_EVAL_MODEL] : []),
      lifecyclePrompt(stage),
    ], {
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 90_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    const exitCode = await new Promise<number | null>((done, reject) => {
      child.once("error", reject);
      child.once("exit", done);
    });
    clearTimeout(timeout);
    if (exitCode !== 0) throw new Error(`OpenCode exited with status ${exitCode ?? "unknown"}`);

    const events = output.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as OpenCodeEvent);
    const text = events.filter((event) => event.type === "text" && event.part?.text)
      .map((event) => event.part!.text).join("").trim();
    const calls = (await readFile(callsFile, "utf8")).split(/\r?\n/u).filter(Boolean)
      .map((line) => JSON.parse(line) as { name: string });
    const tools = calls.map((call) => call.name);
    const assertions = scoreLifecycle(stage, text, tools);
    process.stdout.write(`${JSON.stringify({
      scenario: `kata-capabilities/001/lifecycle/${stage}`,
      harness: "opencode-local",
      model: process.env.DOJOFOO_EVAL_MODEL ?? "configured-default",
      durationMs: Date.now() - startedAt,
      response: text,
      toolNames: tools,
      score: assertions.filter((assertion) => assertion.passed).length / assertions.length,
      assertions,
    }, null, 2)}\n`);
    if (assertions.some((assertion) => !assertion.passed)) process.exitCode = 1;
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
