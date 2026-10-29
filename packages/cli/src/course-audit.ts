import { createInterface } from "node:readline/promises";
import { CLI } from "./config";
import { apiOrigin, telemetryDisabled } from "./telemetry";

/*
 * The security checks the course API keeps on a GitHub course (Dojo's own, Cisco's skill-scanner's), read before it's
 * installed: a fail stops the install, a warn asks first (--yes answers for you). A course the API hasn't audited, or
 * an API that doesn't answer, installs as before. Like the install events, the lookup is skipped when telemetry is
 * off, and when giget may be reading a private repository (GIGET_AUTH), so its name stays on this machine.
 */

interface CourseAuditResponse {
  status: "trial" | "enabled";
  audits: Array<{
    provider: string;
    status: "pass" | "warn" | "fail";
    riskLevel: string;
    summary: string;
    findings: Array<{ message: string; path?: string; line?: number }>;
  }>;
}

async function readAudits(repository: string): Promise<CourseAuditResponse | null> {
  if (telemetryDisabled() || process.env.GIGET_AUTH) return null;
  try {
    const response = await fetch(`${apiOrigin()}/api/v1/courses/audit/${repository}`, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) return null;
    const body = await response.json() as Partial<CourseAuditResponse>;
    return Array.isArray(body.audits) ? body as CourseAuditResponse : null;
  } catch {
    return null;
  }
}

function report(repository: string, audits: CourseAuditResponse["audits"]) {
  const width = Math.max(...audits.map(({ provider }) => provider.length));
  return audits.flatMap((audit) => [
    `  ${audit.provider.padEnd(width)}  ${audit.status}  ${audit.summary}`,
    ...audit.findings.map((finding) => `  ${" ".repeat(width)}    ${finding.path ? `${finding.path}${finding.line ? `:${finding.line}` : ""}: ` : ""}${finding.message}`),
  ]).concat(`  Details: ${apiOrigin()}/api/v1/courses/audit/${repository}`).join("\n");
}

export async function checkCourseAudits(repository: string, options: { yes: boolean }): Promise<void> {
  const result = await readAudits(repository);
  if (!result || result.audits.length === 0) return;
  const { audits } = result;
  if (result.status === "trial") console.log(`${repository} is a trial course: it isn't in the marketplace yet.`);

  if (audits.some((audit) => audit.status === "fail")) {
    throw new Error(`${repository} failed its security checks, so ${CLI} won't install it.\n\n${report(repository, audits)}`);
  }
  if (audits.every((audit) => audit.status === "pass")) {
    console.log(`Security checks: ${audits.map((audit) => `${audit.provider} ${audit.status}`).join(", ")}`);
    return;
  }

  console.log(`${repository} has security warnings:\n\n${report(repository, audits)}\n`);
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
