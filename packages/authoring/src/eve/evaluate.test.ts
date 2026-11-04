import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { startHostPortFixture } from "@dojofoo/agent/host-port/fixture";
import type { EvaluationTrialStatus } from "@dojofoo/protocol";
import { createKyoshiEvaluationTool } from "./evaluate.ts";

type Tool = { execute(input: { lessonIds: string[] }, context: { callId: string; abortSignal: AbortSignal; session: { id: string } }): Promise<Record<string, unknown>> };
const closers: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of closers.splice(0)) await close(); });

/** A host port whose trial answers `statuses` in turn, the last one repeatedly */
async function evaluationPort(statuses: EvaluationTrialStatus[]) {
  let polls = 0;
  const port = await startHostPortFixture({ handlers: {
    "evaluation.start": () => ({ trialId: "trial-1" }),
    "evaluation.status": () => statuses[Math.min(polls++, statuses.length - 1)],
  } });
  closers.push(port.close);
  const tool = createKyoshiEvaluationTool(async () => ({ hostPort: { url: port.url, workspaceId: "draft", persona: "kyoshi", secret: "s" } }), { pollMs: 10 }) as unknown as Tool;
  const execute = (abortSignal = AbortSignal.timeout(5000)) => tool.execute({ lessonIds: ["first"] }, { callId: "call-1", abortSignal, session: { id: "kyoshi-1" } });
  return { port, execute };
}

const report = { version: 1, directory: "/evidence", materialHash: "hash", lessonIds: ["first"], status: "passed", stage: "teaching", startedAt: "s", completedAt: "e",
  decisions: { material: { outcome: "pass" } }, material: [{ judge: "judge-1", root: "/r", promptHash: "h", verdict: { overall: "pass" } }] };

it("starts through evaluation.start and polls evaluation.status to the report", async () => {
  const { port, execute } = await evaluationPort([{ status: "running" }, { status: "running" }, { status: "finished", result: { attempt: 1, remaining: 2, report } }]);
  expect(await execute()).toEqual({ attempt: 1, remaining: 2, status: "passed", stage: "teaching", reportDirectory: "/evidence", error: undefined,
    decisions: { material: { outcome: "pass" } }, material: [{ judge: "judge-1", verdict: { overall: "pass" } }], teaching: undefined });
  expect(port.calls.map(call => call.method)).toEqual(["evaluation.start", "evaluation.status", "evaluation.status", "evaluation.status"]);
  expect(port.calls[0]).toMatchObject({ persona: "kyoshi", sessionId: "kyoshi-1", idempotencyKey: "kyoshi-1:call-1", input: { lessonIds: ["first"] } });
  expect(port.calls[1]?.input).toEqual({ trialId: "trial-1" });
});

it("maps each failure code to Kyoshi's status", async () => {
  const expected = { not_enabled: "not-configured", invalid_request: "invalid-request", preflight_failed: "preflight-failed",
    allowance_exhausted: "allowance-exhausted", evaluation_running: "already-running", agent_not_offered: "agent-unavailable" } as const;
  for (const [code, status] of Object.entries(expected)) {
    const { execute } = await evaluationPort([{ status: "failed", error: `refused: ${code}`, code: code as keyof typeof expected }]);
    expect(await execute()).toEqual({ status, error: `refused: ${code}`, next: expect.any(String) });
  }
  const { execute } = await evaluationPort([{ status: "failed", error: "The trial crashed." }]);
  await expect(execute()).rejects.toThrow("The trial crashed.");
});

it("cancels the trial when the tool is aborted", async () => {
  const { port, execute } = await evaluationPort([{ status: "running" }]);
  const controller = new AbortController();
  const running = execute(controller.signal);
  await expect.poll(() => port.calls.filter(call => call.method === "evaluation.status").length).toBeGreaterThan(1);
  controller.abort();
  await expect(running).rejects.toThrow();
  expect(port.calls.at(-1)).toMatchObject({ method: "evaluation.cancel", input: { trialId: "trial-1" }, idempotencyKey: "kyoshi-1:call-1:cancel" });
});

it("answers not-configured without a host port", async () => {
  const tool = createKyoshiEvaluationTool(async () => ({})) as unknown as Tool;
  expect(await tool.execute({ lessonIds: ["first"] }, { callId: "c", abortSignal: AbortSignal.timeout(5000), session: { id: "k" } }))
    .toEqual({ status: "not-configured", error: "Evaluations run in the dojofoo UI.", next: expect.any(String) });
});

it("loads the evaluation tool in Eve's native Node runtime without a TS resolver", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--input-type=module", "--eval",
    'const tool = await import("@dojofoo/authoring/eve/evaluate"); process.stdout.write(typeof tool.createKyoshiEvaluationTool);',
  ], { env: { ...process.env, NODE_OPTIONS: "" }, timeout: 10_000 });
  expect(stdout).toBe("function");
});
