import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import type { DojoManifest, ResolvedKata } from "../src/config";
import { runTests } from "../src/runner";

it("collects fresh Vitest 5 file reports for failing, passing and failed-to-start runs", () => {
  const scratch = mkdtempSync(join(tmpdir(), "dojo runner "));
  onTestFinished(() => rmSync(scratch, { recursive: true, force: true }));
  const vitest = fileURLToPath(new URL("../../../node_modules/vitest/vitest.mjs", import.meta.url));
  const root = join(scratch, "course");
  mkdirSync(root);
  const solution = join(root, "kata.mjs");
  const test = join(root, "kata.test.mjs");
  writeFileSync(test, 'import { answer } from "./kata.mjs";\ndescribe("tokens", () => { test("counts tokens", () => expect(answer()).toBe(42)); test.skip("optional", () => {}); });\n');
  const kata = { name: "first", template: "kata.mjs", workspacePath: solution, testPath: test } as ResolvedKata;
  const catalog = { test: `node "${vitest}" run --globals {template}` } as DojoManifest;
  writeFileSync(solution, "export const answer = () => 0;\n");
  const failed = runTests(kata, catalog, root);
  expect(failed).toMatchObject({ total: 2, passed: 0, failed: 1, skipped: 1, error: null });
  expect(failed.tests[0].failureMessages.join("\n")).toContain("expected");
  writeFileSync(solution, "export const answer = () => 42;\n");
  expect(runTests(kata, catalog, root)).toMatchObject({ total: 2, passed: 1, failed: 0, skipped: 1, error: null });
  const broken = runTests(kata, { ...catalog, test: 'node -e "process.exit(2)"' }, root);
  expect(broken.error).toBeTruthy();
  expect(broken.tests).toEqual([]);
});
