import { createHash } from "node:crypto";
import { readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { CLI } from "./config";
import { apiOrigin } from "./telemetry";

/*
 * The security checks the course API keeps on a GitHub course (Dojo's own, Cisco's skill-scanner's), read for the
 * version just downloaded, before it's installed. A version is named by its Git tree hash, as the API names the
 * snapshots it registers; the API checks a version it hasn't seen first. A fail stops the install; a warn, or no check
 * of this version, asks first (--yes answers for you). When the API doesn't answer or has no checks for the course, the
 * course installs as before, saying so. The lookup isn't telemetry, so it runs with telemetry off: it sends only the
 * repository's name and the hash. It's skipped when giget may be reading a private repository (GIGET_AUTH), which the
 * API can't read.
 */

interface CourseAudit {
  provider: string;
  status: "pass" | "warn" | "fail";
  riskLevel: string;
  summary: string;
  /** The version the provider checked */
  hash?: string | null;
  findings: Array<{ message: string; path?: string; line?: number }>;
}

interface CourseAuditResponse {
  status: "trial" | "enabled";
  audits: CourseAudit[];
}

// Git's hash of the download as a tree: GitHub's tarball of a commit holds its files, executable bits and symlinks, so
// it hashes to the commit's tree
function treeHash(directory: string): string {
  return objectHash("tree", treeEntries(directory));
}

function treeEntries(directory: string): Buffer {
  const entries = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) return [{ mode: "120000", name: entry.name, hash: objectHash("blob", readlinkSync(path, { encoding: "buffer" })) }];
    if (entry.isDirectory()) {
      const subtree = treeEntries(path);
      // Git keeps no empty directories
      return subtree.length > 0 ? [{ mode: "40000", name: entry.name, hash: objectHash("tree", subtree) }] : [];
    }
    if (!entry.isFile()) return [];
    return [{ mode: statSync(path).mode & 0o100 ? "100755" : "100644", name: entry.name, hash: objectHash("blob", readFileSync(path)) }];
  });
  // Git's order: by name, a directory's as if it ended in "/"
  const key = ({ mode, name }: { mode: string; name: string }) => Buffer.from(mode === "40000" ? `${name}/` : name);
  return Buffer.concat(entries
    .sort((left, right) => Buffer.compare(key(left), key(right)))
    .flatMap(({ mode, name, hash }) => [Buffer.from(`${mode} ${name}\0`), Buffer.from(hash, "hex")]));
}

function objectHash(type: "blob" | "tree", body: Buffer) {
  return createHash("sha1").update(`${type} ${body.length}\0`).update(body).digest("hex");
}

/** The checks, or why there are none */
async function readAudits(repository: string, hash: string): Promise<CourseAuditResponse | string> {
  try {
    // A POST: for a version it hasn't checked, the API registers the course and checks it first
    const response = await fetch(`${apiOrigin()}/api/v1/courses/audit/${repository}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hash }),
      // Long enough for the API to fetch and check a new version, like an install's registration
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return "the course API has none for it";
    if (!response.ok) return `the course API answered ${response.status}`;
    const body = await response.json() as Partial<CourseAuditResponse>;
    return Array.isArray(body.audits) ? body as CourseAuditResponse : "the course API has none for it";
  } catch {
    return "the course API didn't answer";
  }
}

function report(repository: string, audits: CourseAudit[], hash: string) {
  const width = Math.max(...audits.map(({ provider }) => provider.length));
  return audits.flatMap((audit) => [
    `  ${audit.provider.padEnd(width)}  ${audit.status}  ${audit.summary}${audit.hash === hash ? "" : " (another version)"}`,
    ...audit.findings.map((finding) => `  ${" ".repeat(width)}    ${finding.path ? `${finding.path}${finding.line ? `:${finding.line}` : ""}: ` : ""}${finding.message}`),
  ]).concat(`  Details: ${apiOrigin()}/api/v1/courses/audit/${repository}`).join("\n");
}

export async function checkCourseAudits(repository: string, directory: string, options: { yes: boolean }): Promise<void> {
  if (process.env.GIGET_AUTH) return;
  const hash = treeHash(directory);
  const result = await readAudits(repository, hash);
  if (typeof result === "string") {
    console.log(`Security checks unavailable for ${repository}: ${result}.`);
    return;
  }
  const { audits } = result;
  if (result.status === "trial") console.log(`${repository} is a trial course: it isn't in the marketplace yet.`);

  // A check counts for the version it read
  const checked = audits.filter((audit) => audit.hash === hash);
  if (checked.some((audit) => audit.status === "fail")) {
    throw new Error(`${repository} failed its security checks, so ${CLI} won't install it.\n\n${report(repository, audits, hash)}`);
  }
  if (checked.length > 0 && audits.every((audit) => audit.status === "pass")) {
    console.log(`Security checks: ${checked.map((audit) => `${audit.provider} ${audit.status}`).join(", ")}`);
    return;
  }

  console.log(`${checked.length > 0 ? `${repository} has security warnings` : `${repository} hasn't been checked at the version just downloaded`}:\n\n${report(repository, audits, hash)}\n`);
  if (options.yes) return;
  if (!process.stdin.isTTY) throw new Error(`Install stopped. Run again with --yes to install ${repository} anyway.`);
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await readline.question("Install anyway? [y/N] ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") throw new Error("Install cancelled.");
  } finally {
    readline.close();
  }
}
