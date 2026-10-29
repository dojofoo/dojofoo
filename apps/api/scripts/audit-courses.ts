import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Course } from "../src/app";
import { ciscoFindings, verdict, type CiscoScanReport } from "../src/course-audit";
import {
  LibsqlCourseAuditStore,
  LibsqlCourseStore,
  libsqlConnectionFromEnv,
} from "../src/libsql-event-store";

/*
 * Cisco AI Defense's skill-scanner over every course version it hasn't audited yet, its results stored beside Dojo's
 * own checks. It runs without keys: its static and YARA rules, behavioral dataflow analysis, and OSV.dev for known
 * vulnerable dependencies (exact npm and PyPI pins). The whole repository is scanned, as cloned at the version the
 * course registered – the snapshot leaves out skills and commands the CLI links into the learner's agents.
 * Needs DATABASE_URL (with TURSO_AUTH_TOKEN), git and uv. `--limit N` caps the scans per run (default 20).
 */

const scanner = ["--from", "cisco-ai-skill-scanner==2.3.1", "skill-scanner"];
const run = promisify(execFile);

const database = libsqlConnectionFromEnv(process.env);
if (!database) throw new Error("DATABASE_URL is required.");
const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag === -1 ? 20 : Number(process.argv[limitFlag + 1]);
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit takes a positive integer.");

const courses = await LibsqlCourseStore.create(database);
const audits = await LibsqlCourseAuditStore.create(database);

const pending: Course[] = [];
for (const course of await courses.list()) {
  if (course.sourceType !== "github" || !course.hash) continue;
  const cisco = (await audits.list(course.id)).find((audit) => audit.provider === "cisco");
  if (!cisco || cisco.hash !== course.hash) pending.push(course);
}

let failures = 0;
let audited = 0;
for (const course of pending.slice(0, limit)) {
  const root = await mkdtemp(join(tmpdir(), "dojo-audit-"));
  const directory = join(root, course.slug);
  try {
    await run("git", ["clone", "--depth", "1", "--quiet", `https://github.com/${course.repository}.git`, directory]);
    // The registered hash is the default branch's commit (GitHub's tree lookup by branch answers with it); a newer
    // push waits for the install that registers it
    const { stdout: commit } = await run("git", ["rev-parse", "HEAD"], { cwd: directory });
    if (commit.trim() !== course.hash) {
      console.log(`${course.id}: changed since it registered, skipped until its next install`);
      continue;
    }
    await rm(join(directory, ".git"), { recursive: true, force: true });
    // The scanner reads a skill: a course without a SKILL.md gets one that says what it is
    if (!existsSync(join(directory, "SKILL.md"))) {
      await writeFile(join(directory, "SKILL.md"), [
        "---",
        `name: ${JSON.stringify(course.slug)}`,
        `description: ${JSON.stringify(course.description)}`,
        "---",
        "",
        `# ${course.name}`,
        "",
        "A Dojo coding course. The learner's coding agent teaches it from DOJO.md and each kata's KATA.md and SENSEI.md;",
        "installing it runs the learner's package manager on package.json, mise on mise.toml, and prepare.sh.",
        "",
      ].join("\n"));
    }
    const report = join(root, "report.json");
    await run("uvx", [...scanner, "scan", directory, "--lenient", "--use-behavioral", "--use-osv", "--format", "json", "--output", report], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 10 * 60_000,
    });
    const findings = ciscoFindings(JSON.parse(await readFile(report, "utf8")) as CiscoScanReport);
    const audit = { ...verdict(findings), findings };
    await audits.save({ courseId: course.id, provider: "cisco", hash: course.hash, ...audit, auditedAt: new Date().toISOString() });
    audited += 1;
    console.log(`${course.id}: ${audit.status} (${audit.riskLevel}) ${audit.summary}`);
  } catch (error) {
    failures += 1;
    console.error(`${course.id}: not audited, ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

console.log(`Audited ${audited} of ${pending.length} pending courses.`);
if (failures > 0) process.exitCode = 1;
