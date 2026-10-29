import { execFileSync } from "node:child_process";

/*
 * Production follows the release: merging to main builds a staged production deployment (the project doesn't assign
 * dojo.foo on its own), and the release run that tags a commit promotes that commit's deployment. Usage:
 * `node scripts/vercel/promote-release.mjs <commit-sha>` with VERCEL_TOKEN set. Waits for the build when it's still
 * running, then checks the domain answers.
 */

const PROJECT = process.env.VERCEL_PROJECT ?? "dojofoo";
const SCOPE = process.env.VERCEL_SCOPE ?? "tomsiwiks-projects";
const DOMAIN = process.env.VERCEL_DOMAIN ?? "https://dojo.foo";
const TIMEOUT = 25 * 60_000;

function vercel(args) {
  return execFileSync("npx", ["--yes", "vercel@63.1.2", ...args, "--scope", SCOPE], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

const sha = process.argv[2];
if (!/^[0-9a-f]{40}$/u.test(sha ?? "")) throw new Error("Usage: node scripts/vercel/promote-release.mjs <commit-sha>");

const started = Date.now();
let deployment;
while (!deployment) {
  const { deployments } = JSON.parse(vercel(["ls", PROJECT, "-m", `githubCommitSha=${sha}`, "--environment", "production", "--json"]));
  // The newest build of the commit; a redeploy replaces an older one
  const latest = deployments.sort((left, right) => right.createdAt - left.createdAt)[0];
  if (latest?.state === "READY") deployment = latest;
  else if (latest?.state === "ERROR" || latest?.state === "CANCELED") throw new Error(`${latest.url} ended ${latest.state}; nothing promoted.`);
  else if (Date.now() - started > TIMEOUT) throw new Error(`No ready production deployment of ${sha} after ${TIMEOUT / 60_000} minutes.`);
  else wait(20_000);
}

vercel(["promote", `https://${deployment.url}`, "--yes", "--timeout", "5m"]);
const response = await fetch(`${DOMAIN}/api/v1/health`);
if (!response.ok) throw new Error(`${DOMAIN} answered ${response.status} after promoting ${deployment.url}.`);
process.stdout.write(`Promoted ${deployment.url} (${sha.slice(0, 7)}) to ${DOMAIN}\n`);
