import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { HarnessAgent } from "@ai-sdk/harness/agent";
import { agentAdapter, createLocalSandbox } from "@dojofoo/agent/adapters";
import { readOnlyEnvironment, readOnlyHarnessSettings } from "@dojofoo/agent/persona";
import type { AgentId } from "@dojofoo/protocol";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** A multi-turn teaching conversation on one agent's read-only harness adapter, in a temporary folder of its own (decision 21). */
type Adapter = Awaited<ReturnType<typeof agentAdapter>>;
class LiveHarnessCourseDriver implements FullCourseDriver {
  private agent: HarnessAgent<Adapter> | null = null;
  private session: Awaited<ReturnType<HarnessAgent<Adapter>["createSession"]>> | null = null;
  private sandboxSession: Awaited<ReturnType<typeof createLocalSandbox>> | null = null;
  private source = "";
  private introduction = "";

  constructor(private readonly harness: AgentId, private readonly root: string) {}

  async begin(lesson: CourseLesson): Promise<void> {
    await this.shutdown();
    // The row's read-only built-ins and permission mode, as Sensei's harness model sets them (the adapters' tool keys differ per agent)
    this.agent = new HarnessAgent({
      id: `dojofoo-live-course-${this.harness}`,
      harness: await agentAdapter(this.harness, { mode: "read-only" }),
      ...(process.env.DOJOFOO_EVAL_MODEL ? { model: process.env.DOJOFOO_EVAL_MODEL } : {}),
      ...readOnlyHarnessSettings(this.harness, []),
      instructions: "You are a concise kata teacher. Teach one small step at a time. Do not provide a complete solution.",
    } as ConstructorParameters<typeof HarnessAgent<Adapter>>[0]);
    const directory = join(this.root, lesson.id);
    await mkdir(directory, { recursive: true });
    this.sandboxSession = await createLocalSandbox(directory, {
      environment: await readOnlyEnvironment(this.harness, process.env, { stateDirectory: join(this.root, "state"), eveSessionId: lesson.id }),
    });
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
    if (!this.agent || !this.session) throw new Error(`${this.harness} session was not started`);
    const result = await this.agent.generate({
      session: this.session,
      prompt: `Begin lesson ${lesson.id}. Give the learner one concrete first step without solution code.`,
    });
    this.introduction = result.text;
    return result.text;
  }

  async followUp(): Promise<string> {
    if (!this.agent || !this.session) throw new Error(`${this.harness} session was not started`);
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
    if (!this.introduction) throw new Error(`${this.harness} response vanished after the turn`);
  }

  async shutdown(): Promise<void> {
    try { await this.session?.destroy(); }
    finally {
      this.session = null;
      try { await this.sandboxSession?.stop(); }
      finally { this.sandboxSession = null; }
    }
  }
}

const results: unknown[] = [];
for (const harness of requested) {
  const root = await mkdtemp(join(tmpdir(), `dojo-live-${harness}-`));
  const driver = new LiveHarnessCourseDriver(harness, root);
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
    await rm(root, { recursive: true, force: true });
  }
}

process.stdout.write(`${JSON.stringify({ scenario: "starter-kata/full-course", results }, null, 2)}\n`);
