import { execSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { DojoManifest, ResolvedKata } from "./config";

export interface TestResult {
  name: string;
  suite: string[];
  filePath?: string;
  status: "passed" | "failed" | "skipped";
  failureMessages: string[];
  durationMs?: number;
}

export interface TestRun {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
  durationMs?: number;
  coverage?: {
    lines: { covered: number; total: number; percentage: number };
    lineHits: Record<string, number>;
  };
  error: string | null;
}

export interface RunnerAdapter {
  prepareCommand(cmd: string, options: { coverage: boolean }): string;
  parseOutput(stdout: string, stderr: string, exitCode: number, workspacePath: string): TestRun;
}

// --- Vitest adapter ---

interface VitestJson {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests?: number;
  startTime?: number;
  testResults: Array<{
    name?: string;
    startTime?: number;
    endTime?: number;
    assertionResults: Array<{
      title: string;
      fullName?: string;
      ancestorTitles?: string[];
      status: string;
      failureMessages: string[];
      duration?: number;
    }>;
  }>;
  coverageMap?: Record<string, {
    statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
    s: Record<string, number>;
    fnMap?: Record<string, {
      loc: { start: { line: number }; end: { line: number } };
    }>;
    f?: Record<string, number>;
  }>;
}

export function parseVitestJson(raw: string, workspacePath: string): TestRun {
  const json: VitestJson = JSON.parse(raw);
  const tests: TestResult[] = [];
  for (const suite of json.testResults) {
    for (const t of suite.assertionResults) {
      tests.push({
        name: t.title,
        suite: t.ancestorTitles ?? [],
        ...(suite.name ? { filePath: suite.name } : {}),
        status: t.status === "passed"
          ? "passed"
          : ["pending", "skipped", "todo"].includes(t.status) ? "skipped" : "failed",
        failureMessages: t.failureMessages,
        ...(typeof t.duration === "number" ? { durationMs: t.duration } : {}),
      });
    }
  }
  const endTime = Math.max(...json.testResults.map((suite) => suite.endTime ?? json.startTime ?? 0));
  const durationMs = json.startTime === undefined || endTime < json.startTime
    ? undefined
    : endTime - json.startTime;
  const coverage = normalizeCoverage(json.coverageMap, workspacePath);
  return {
    total: json.numTotalTests,
    passed: json.numPassedTests,
    failed: json.numFailedTests,
    skipped: json.numPendingTests ?? tests.filter((test) => test.status === "skipped").length,
    tests,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(coverage ? { coverage } : {}),
    error: null,
  };
}

function normalizeCoverage(
  coverageMap: VitestJson["coverageMap"],
  workspacePath: string,
): TestRun["coverage"] | undefined {
  if (!coverageMap) return undefined;
  const target = canonicalPath(workspacePath);
  const entry = Object.entries(coverageMap).find(([path]) => canonicalPath(path) === target);
  if (!entry) return undefined;
  const [, file] = entry;
  const lineHits: Record<string, number> = {};
  for (const [statementId, location] of Object.entries(file.statementMap)) {
    const line = String(location.start.line);
    lineHits[line] = Math.max(lineHits[line] ?? 0, file.s[statementId] ?? 0);
  }
  const hits = Object.values(lineHits);
  for (const [functionId, location] of Object.entries(file.fnMap ?? {})) {
    const count = file.f?.[functionId] ?? 0;
    for (let line = location.loc.start.line; line <= location.loc.end.line; line += 1) {
      lineHits[String(line)] = Math.max(lineHits[String(line)] ?? 0, count);
    }
  }
  const covered = hits.filter((count) => count > 0).length;
  const total = hits.length;
  return {
    lines: { covered, total, percentage: total === 0 ? 0 : Math.round((covered / total) * 100) },
    lineHits,
  };
}

function canonicalPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

const vitestAdapter: RunnerAdapter = {
  prepareCommand(cmd: string, options) {
    return `${cmd} --reporter=json${options.coverage ? " --coverage.enabled --coverage.reportOnFailure --coverage.reporter=json --coverage.allowExternal" : ""}`;
  },
  parseOutput(stdout: string, _stderr: string, exitCode: number, workspacePath: string): TestRun {
    // vitest exits non-zero when tests fail — stdout still has JSON
    try {
      return parseVitestJson(stdout, workspacePath);
    } catch {
      if (exitCode !== 0) {
        return {
          total: 0, passed: 0, failed: 0, skipped: 0, tests: [],
          error: _stderr || "Test execution failed",
        };
      }
      return { total: 0, passed: 0, failed: 0, skipped: 0, tests: [], error: "Failed to parse vitest output" };
    }
  },
};

// --- Exit-code adapter ---

const exitCodeAdapter: RunnerAdapter = {
  prepareCommand(cmd: string) {
    return cmd;
  },
  parseOutput(stdout: string, stderr: string, exitCode: number): TestRun {
    if (exitCode === 0) {
      return {
        total: 1, passed: 1, failed: 0, skipped: 0,
        tests: [{ name: "all tests", suite: [], status: "passed", failureMessages: [] }],
        error: null,
      };
    }
    return {
      total: 1, passed: 0, failed: 1, skipped: 0,
      tests: [{ name: "all tests", suite: [], status: "failed", failureMessages: [stderr || stdout || "Tests failed"] }],
      error: null,
    };
  },
};

function getAdapter(manifest: DojoManifest): RunnerAdapter {
  const adapterName = manifest.runner?.adapter ?? "vitest";
  return adapterName === "exit-code" ? exitCodeAdapter : vitestAdapter;
}

export function runTests(
  kata: ResolvedKata,
  catalog: DojoManifest,
  dojoDir: string,
): TestRun {
  const adapter = getAdapter(catalog);
  const testRelPath = relative(dojoDir, kata.testPath);
  const testTemplate = kata.test ?? catalog.test;
  const testCmd = testTemplate.replace("{template}", testRelPath);
  const cmd = adapter.prepareCommand(testCmd, { coverage: catalog.runner?.coverage === true });

  try {
    const output = execSync(cmd, {
      cwd: dojoDir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    });
    return adapter.parseOutput(output.toString(), "", 0, kata.workspacePath);
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    const stdout = e.stdout?.toString() ?? "";
    const stderr = e.stderr?.toString() ?? "";
    const exitCode = e.status ?? 1;

    const result = adapter.parseOutput(stdout, stderr, exitCode, kata.workspacePath);
    if (result.error === null && result.total === 0 && stdout === "" && stderr !== "") {
      return { total: 0, passed: 0, failed: 0, skipped: 0, tests: [], error: stderr || "Test execution failed" };
    }
    return result;
  }
}
