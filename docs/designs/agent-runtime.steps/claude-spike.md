# Claude Code spike (step 3)

*   **For:** step 3 plan, commit 5. Claude Code is the only tier-A agent new to the loopback model, and tool use over the new Messages route, its alias resolution and its side requests were unverified (plan facts 3 and 12).
*   **Date:** 2026-11-04, on the step 3 machine (macOS, darwin-arm64, Node 26).
*   **Ran:** `@ai-sdk/harness-claude-code` 1.0.171 under `HarnessAgent`, with its own bridge (`@anthropic-ai/claude-agent-sdk` 0.3.290) and the bootstrapped `@anthropic-ai/claude-code` 2.1.290, against the commit-1 loopback model (`8233781`). No login and no real model: `ANTHROPIC_BASE_URL` was the loopback, `ANTHROPIC_API_KEY` was `fixture-only`, and the sandbox environment held only `PATH`, `TMPDIR`, `LANG`, a fresh `HOME`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` and `DISABLE_AUTOUPDATER=1`. The fresh `HOME` linked `.ai-sdk-harness` to a shared bootstrap home, as tier-A cases do.

## Findings

1.  **Host tool path.** The first request offers the host tool directly, as `mcp__harness-tools__dojo_conformance_echo`, and offers no `ToolSearch`. The loopback's suffix match calls it; the `ToolSearch` fallback is not needed.
2.  **It reaches `execute`.** `execute` ran exactly once with `{ value: "receipt" }`, the following request carried the `echoed` result, and the turn replied "Ready to teach.".
3.  **Wire models.** `sonnet` is sent as `claude-sonnet-5-5`, and `opus` (a fresh `HarnessAgent` on the same session) as `claude-opus-5-5`. The plan's patterns `/sonnet/` and `/opus/` hold.
4.  **Side requests.** None. Every request was `POST /v1/messages?beta=true` with `stream: true` and offered tools; no request had an empty tool list, and no `count_tokens` or `HEAD /api/hello` request arrived through the adapter.
5.  **`compact()`** resolves at once and sends no model request, neither within 15 s nor with the next turn. The adapter's `doCompact` only sends `/compact` as a user message on the bridge channel and returns (`src/claude-code-harness.ts:1714-1727`). The next turn ("Continue after native compaction.") kept the session, replied "Ready to teach." and still carried the earlier prompts, and no request carried `/compact`. So on this conversation nothing was compacted, and nothing failed. The tier-A expectation for Claude Code is therefore "resolves without a model request; the next turn keeps the session and reaches the loopback".
6.  **Offered built-ins.** The default offer, with no tool filter, was `Agent AskUserQuestion Bash CronCreate CronDelete CronList Edit EnterPlanMode EnterWorktree ExitPlanMode ExitWorktree ListAgents NotebookEdit Read ReportFindings ScheduleWakeup SendMessage Skill TaskStop WebFetch WebSearch Workflow Write` plus the host tool. There is no `Glob` or `Grep` tool in Claude Code 2.1.290's offer; step 4's read-only built-in list for Claude Code (`read`, `glob`, `grep`) should be checked against this.
7.  **Bootstrap reuse.** With `.ai-sdk-harness` linked into the fresh `HOME`, the first session took 11.1 s (bootstrap included) and later sessions 0.2 s, so a symlinked bootstrap directory is accepted.

## Script

Run from `packages/authoring` with `node --input-type=module < claude-spike.mjs`, after `pnpm build`.

```js
// Claude Code spike (step 3, commit 5): one host-tool turn, a model switch and compact() against the loopback model.
// Run from packages/authoring: node --input-type=module < claude-spike.mjs
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClaudeCode } from "@ai-sdk/harness-claude-code";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox, prepareHarnessEnvironment } from "@dojofoo/agent/experimental/local";
import { tool } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { startLoopbackModel } from "../agent/experiments/model-provider/loopback-openai.mjs";

const bootstrapHome = join(tmpdir(), "dojofoo-conformance-home", "claude");
await mkdir(join(bootstrapHome, ".ai-sdk-harness"), { recursive: true });
const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-claude-spike-")));
const home = join(root, "home");
await mkdir(join(root, "course"), { recursive: true });
await mkdir(home);
await writeFile(join(root, "course/lesson.md"), "# Lesson\n");
await symlink(join(bootstrapHome, ".ai-sdk-harness"), join(home, ".ai-sdk-harness"));
const target = "mcp__harness-tools__dojo_conformance_echo";
const endpoint = await startLoopbackModel({ toolRequest: { name: "dojo_conformance_echo", input: { value: "receipt" },
  discovery: { name: "ToolSearch", input: { query: `select:${target}`, max_results: 1 } } } });
const base = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: process.env.LANG, HOME: home };
const environment = { ...await prepareHarnessEnvironment(base), HOME: home,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1" };
const sandbox = await createLocalSandbox(root, { environment });
const harness = createClaudeCode({ port: 0, auth: { ANTHROPIC_API_KEY: "fixture-only", ANTHROPIC_BASE_URL: endpoint.anthropicBaseURL } });
const executions = [];
const tools = { dojo_conformance_echo: tool({ description: "Echo a value back to the conformance case.",
  inputSchema: z.object({ value: z.string() }), execute: async input => { executions.push(input); return { echoed: input.value }; } }) };
const log = (key, value) => console.log(key, JSON.stringify(value));
const summary = () => endpoint.requests.map((request, index) => ({ index, route: endpoint.routes[index], model: endpoint.requestedModels[index],
  tools: endpoint.toolLists[index], hasPrompt: ["Introduce the lesson.", "Continue with opus.", "Continue after native compaction."].filter(text => JSON.stringify(request).includes(text)) }));
try {
  const started = Date.now();
  const agent = new HarnessAgent({ harness, model: "sonnet", tools, sandboxConfig: { workDir: "course" } });
  const session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(300_000) });
  log("sessionReadyMs", Date.now() - started);
  const first = await agent.generate({ session, prompt: "Introduce the lesson.", abortSignal: AbortSignal.timeout(120_000) });
  log("firstText", first.text);
  log("executions", executions);
  log("requestedTools", endpoint.requestedTools);
  const firstMain = endpoint.toolLists.findIndex(list => list.length);
  log("firstMainRequestOffersTarget", endpoint.toolLists[firstMain]?.includes(target));
  log("firstMainRequestOffersToolSearch", endpoint.toolLists[firstMain]?.includes("ToolSearch"));
  log("echoedInLaterRequest", endpoint.requests.some(request => JSON.stringify(request).includes("echoed")));
  const switched = new HarnessAgent({ harness, model: "opus", tools, sandboxConfig: { workDir: "course" } });
  const second = await switched.generate({ session, prompt: "Continue with opus.", abortSignal: AbortSignal.timeout(120_000) });
  log("secondText", second.text);
  const compactBefore = endpoint.requests.length;
  try { await session.compact(); log("compact", { outcome: "resolved", newRequests: endpoint.requests.length - compactBefore }); }
  catch (error) { log("compact", { outcome: "rejected", name: error?.name, message: String(error?.message).slice(0, 300) }); }
  for (const deadline = Date.now() + 15_000; Date.now() < deadline && endpoint.requests.length === compactBefore;) await new Promise(resolve => setTimeout(resolve, 250));
  log("compactRequestsAfterWait", endpoint.requests.length - compactBefore);
  const afterCompact = await agent.generate({ session, prompt: "Continue after native compaction.", abortSignal: AbortSignal.timeout(120_000) });
  log("afterCompactText", afterCompact.text);
  log("afterCompactRequests", endpoint.requests.length - compactBefore);
  log("afterCompactCarriesHistory", JSON.stringify(endpoint.requests.at(-1)).includes("Introduce the lesson."));
  log("anyRequestCarriesCompactCommand", endpoint.requests.some(request => JSON.stringify(request).includes("/compact")));
  log("compactRequestBodies", endpoint.requests.slice(compactBefore).map((request, offset) => ({ tools: endpoint.toolLists[compactBefore + offset].length,
    text: JSON.stringify(request.messages ?? []).slice(-400), system: JSON.stringify(request.system ?? "").slice(0, 200) })));
  log("requests", summary());
  log("emptyToolRequests", summary().filter(entry => entry.tools.length === 0));
  log("paths", endpoint.paths);
  await session.stop();
} catch (error) {
  console.log("SPIKE_ERROR", error?.stack ?? error, error?.cause);
  console.log("requests", JSON.stringify(summary()));
  console.log("paths", JSON.stringify(endpoint.paths));
} finally {
  await sandbox.stop();
  await endpoint.close();
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}
```
