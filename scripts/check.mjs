#!/usr/bin/env node
// The fast checks, a few at a time: what a pull request must pass, and what the pre-push hook runs. Agent runs and the
// browser suites are in .github/workflows/nightly.yml. Assumes the packages other packages import from dist are built
// (`pnpm build:check`); a task's output is printed only when it fails.
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";

/** Longest first. Every vitest starts a worker pool of its own: all at once, the CPU is oversubscribed and tests time out. */
const tasks = [
  "pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'",
  "pnpm --filter @dojofoo/harness exec vitest run",
  "pnpm --filter @dojofoo/agents test --exclude '**/*.live.test.ts'",
  "pnpm --filter @dojofoo/uix test",
  "pnpm --filter @dojofoo/ui types:check",
  "pnpm --filter @dojofoo/uix types:check",
  "pnpm --filter @dojofoo/web types:check",
  "pnpm lint:deps",
  "pnpm --filter @dojofoo/api openapi:check",
  "pnpm --filter @dojofoo/api test",
  "pnpm --filter dojofoo test",
  "pnpm --filter @dojofoo/protocol test",
  "pnpm lint:names",
];
const slots = Number(process.env.CHECK_CONCURRENCY) || Math.min(4, Math.max(2, Math.floor(availableParallelism() / 4)));

const run = command => new Promise(resolve => {
  const begin = Date.now();
  const child = spawn(command, { shell: true, env: { ...process.env, FORCE_COLOR: "1" } });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.on("close", code => resolve({ command, code, output, seconds: (Date.now() - begin) / 1000 }));
});

const started = Date.now();
const results = [];
let next = 0;
await Promise.all(Array.from({ length: slots }, async () => {
  while (next < tasks.length) {
    const index = next++;
    results[index] = await run(tasks[index]);
  }
}));

const failed = results.filter(result => result.code !== 0);
for (const result of failed) process.stdout.write(`\n── ${result.command} (exit ${result.code})\n${result.output}\n`);
for (const result of results) console.log(`${result.code === 0 ? "pass" : "FAIL"} ${result.seconds.toFixed(1).padStart(5)}s  ${result.command}`);
console.log(`${failed.length ? `${failed.length} failed` : "all passed"} in ${((Date.now() - started) / 1000).toFixed(1)}s, ${slots} at a time`);
process.exit(failed.length ? 1 : 0);
