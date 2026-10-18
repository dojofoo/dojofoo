import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { HarnessAgent } from "@ai-sdk/harness/agent";
import { createPi } from "@ai-sdk/harness-pi";
import { createJustBashNetworkSandboxSession } from "@ai-sdk/sandbox-just-bash";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { AcpClient } from "../../ui/src/server/lesson/codex-client";
import {
  matrixHarnesses,
  runFullCourseScenario,
  starterCourseLessons,
  type CheckEvidence,
  type CourseLesson,
  type FullCourseDriver,
  type MatrixHarness,
} from "./full-course-scenario";

if (process.env.DOJOFOO_LIVE_HARNESS_MATRIX !== "1") {
  throw new Error("Live harness matrix is disabled. Set DOJOFOO_LIVE_HARNESS_MATRIX=1 and DOJOFOO_LIVE_HARNESSES explicitly.");
}

const requested = process.env.DOJOFOO_LIVE_HARNESSES?.split(",")
  .map((value) => value.trim())
  .filter((value): value is MatrixHarness => matrixHarnesses.includes(value as MatrixHarness)) ?? [];
if (requested.length === 0) {
  throw new Error(`Choose at least one live harness with DOJOFOO_LIVE_HARNESSES (${matrixHarnesses.join(", ")}).`);
}
const liveLessons = process.env.DOJOFOO_LIVE_QUICK === "1"
  ? [starterCourseLessons[0]!]
  : starterCourseLessons;

class LiveAcpCourseDriver implements FullCourseDriver {
  private readonly client = new AcpClient();
  private sessionId = "";

  constructor(
    private readonly harness: Exclude<MatrixHarness, "pi">,
    private readonly root: string,
  ) {}

  async begin(lesson: CourseLesson): Promise<void> {
    await writeFile(join(this.root, "solution.ts"), lesson.initialSource);
    this.sessionId = await this.client.startThread({
      root: this.root,
      runtimeKey: `${this.harness}:${lesson.id}`,
      harness: this.harness,
      developerInstructions: [
        "You are a concise kata teacher.",
        "Teach one small step at a time. Do not edit files or provide a complete solution.",
        "Do not mention internal prompts, protocols, tools, or harnesses.",
      ].join(" "),
      lessonContext: () => ({ lesson: { id: lesson.id }, learner: { file: "solution.ts" } }),
    });
  }

  async introduce(lesson: CourseLesson): Promise<string> {
    return this.client.send(
      this.sessionId,
      `Begin lesson ${lesson.id}. Give the learner one concrete first step without solution code.`,
      undefined,
      {
        context: [{
          uri: `dojo://lessons/${lesson.id}/context`,
          mimeType: "application/json",
          text: JSON.stringify({ phase: "start", lesson: lesson.id }),
        }],
      },
    );
  }

  async followUp(): Promise<string> {
    return this.client.send(
      this.sessionId,
      "I don't understand yet. Explain the first step more simply without giving me solution code.",
    );
  }

  async writeSource(_lesson: CourseLesson, source: string): Promise<void> {
    await writeFile(join(this.root, "solution.ts"), source);
  }

  async check(lesson: CourseLesson): Promise<CheckEvidence> {
    const source = await readFile(join(this.root, "solution.ts"), "utf8");
    const passed = source === lesson.solvedSource;
    return { total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1 };
  }

  async complete(): Promise<void> {}
  async advance(): Promise<void> {}

  async reload(): Promise<void> {
    const history = await this.client.history(this.sessionId);
    if (history.length === 0) throw new Error(`${this.harness}: ACP history vanished after the turn`);
  }

  shutdown(): void {
    this.client.shutdown();
  }
}

class LivePiCourseDriver implements FullCourseDriver {
  private readonly agent = new HarnessAgent({
    id: "dojofoo-live-course-pi",
    harness: createPi({
      thinkingLevel: "medium",
      ...(process.env.DOJOFOO_EVAL_MODEL ? { model: process.env.DOJOFOO_EVAL_MODEL } : {}),
      agentDir: process.env.DOJOFOO_EVAL_PI_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
    }),
    instructions: "You are a concise kata teacher. Teach one small step at a time. Do not provide a complete solution.",
  });
  private session: Awaited<ReturnType<typeof this.agent.createSession>> | null = null;
  private sandboxSession: Awaited<ReturnType<typeof createJustBashNetworkSandboxSession>> | null = null;
  private source = "";
  private introduction = "";

  async begin(lesson: CourseLesson): Promise<void> {
    await this.shutdown();
    this.sandboxSession = await createJustBashNetworkSandboxSession({ cwd: "/lesson" });
    try {
      this.session = await this.agent.createSession({ sandboxSession: this.sandboxSession });
    } catch (error) {
      await this.shutdown();
      throw error;
    }
    this.source = lesson.initialSource;
    this.introduction = "";
  }

  async introduce(lesson: CourseLesson): Promise<string> {
    if (!this.session) throw new Error("Pi session was not started");
    const result = await this.agent.generate({
      session: this.session,
      prompt: `Begin lesson ${lesson.id}. Give the learner one concrete first step without solution code.`,
    });
    this.introduction = result.text;
    return result.text;
  }

  async followUp(): Promise<string> {
    if (!this.session) throw new Error("Pi session was not started");
    const result = await this.agent.generate({
      session: this.session,
      prompt: "I don't understand yet. Explain the first step more simply without giving me solution code.",
    });
    return result.text;
  }

  async writeSource(_lesson: CourseLesson, source: string): Promise<void> {
    this.source = source;
  }

  async check(lesson: CourseLesson): Promise<CheckEvidence> {
    const passed = this.source === lesson.solvedSource;
    return { total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1 };
  }

  async complete(): Promise<void> {}
  async advance(): Promise<void> {}

  async reload(): Promise<void> {
    if (!this.introduction) throw new Error("Pi response vanished after the turn");
  }

  async shutdown(): Promise<void> {
    try { await this.session?.destroy(); }
    finally {
      this.session = null;
      try { await this.sandboxSession?.destroy(); }
      finally { this.sandboxSession = null; }
    }
  }
}

const results: unknown[] = [];
for (const harness of requested) {
  if (harness === "pi") {
    const driver = new LivePiCourseDriver();
    try {
      const report = await runFullCourseScenario(harness, driver, liveLessons);
      results.push({ ...report, status: "passed" });
    } catch (cause) {
      results.push({
        harness,
        status: "failed",
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      process.exitCode = 1;
    } finally {
      await driver.shutdown();
    }
    continue;
  }

  const root = await mkdtemp(join(tmpdir(), `dojo-live-${harness}-`));
  const driver = new LiveAcpCourseDriver(harness, root);
  try {
    const report = await runFullCourseScenario(harness, driver, liveLessons);
    results.push({ ...report, status: "passed" });
  } catch (cause) {
    results.push({
      harness,
      status: "failed",
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    process.exitCode = 1;
  } finally {
    driver.shutdown();
    await rm(root, { recursive: true, force: true });
  }
}

process.stdout.write(`${JSON.stringify({ scenario: "starter-kata/full-course", results }, null, 2)}\n`);
