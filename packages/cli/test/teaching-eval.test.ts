import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const worker = process.env.DOJOFOO_TEST_EVAL_WORKER ?? resolve(import.meta.dirname, "../dist/teaching-eval.js");
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it("keeps filesystem-relative fixture adapters in their installed authoring package", async () => {
  // Inlining this helper also inlines official adapters. Their import.meta.url
  // then points into cli/dist, where their bridge/package.json does not exist.
  const bundle = await readFile(worker, "utf8");
  expect(bundle).toContain('import("@dojofoo/authoring/evaluation/learner-fixtures")');
  expect(bundle).toContain('import("@dojofoo/authoring/evaluation/learner-response")');
});

it("describes usage without loading a teaching harness", () => {
  const result = spawnSync(process.execPath, [worker, "--help"], { encoding: "utf8", timeout: 10_000 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("consumes usage");
});

it("requires an explicitly selected harness", () => {
  const result = spawnSync(process.execPath, [worker, "--run", "/not-used"], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, DOJOFOO_HARNESS: "" },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Select the teaching harness");
});

it("rejects unknown prior-lesson coverage before starting a model", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-eval-worker-test-")); roots.push(root);
  const result = spawnSync(process.execPath, [worker, "--evaluate", root], {
    encoding: "utf8", timeout: 15_000, env: {
      ...process.env, DOJOFOO_HARNESS: "codex", DOJOFOO_EVAL_PRIOR_LESSONS: "assume-passed",
    },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Prior-lesson evaluation must be teach or seed-completion");
  expect(result.stderr).not.toContain("ENOENT");
});

it.each(["--run", "--evaluate", "--evaluate-heldout"])("rejects an unsupported lesson harness before paid work in %s", async mode => {
  const root = await mkdtemp(join(tmpdir(), "dojo-eval-worker-test-")); roots.push(root);
  const result = spawnSync(process.execPath, [worker, mode, root], {
    encoding: "utf8", timeout: 15_000, env: { ...process.env, DOJOFOO_HARNESS: "not-a-lesson-harness" },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Unsupported Dojofoo harness: not-a-lesson-harness");
  expect(result.stderr).not.toContain("ENOENT");
});

it.each(["--run", "--evaluate", "--evaluate-heldout"])("loads %s and fails before inference on a missing manifest", async (mode) => {
  const root = await mkdtemp(join(tmpdir(), "dojo-eval-worker-test-")); roots.push(root);
  const result = spawnSync(process.execPath, [worker, mode, root], {
    encoding: "utf8", timeout: 15_000, env: { ...process.env, DOJOFOO_HARNESS: "codex" },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("ENOENT");
  expect(result.stderr).toContain("dojo.yaml");
  expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  expect(result.stderr).not.toContain("Dynamic require");
});

it("loads the official fixture harness dependencies before rejecting an empty curriculum without inference", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-eval-worker-test-")); roots.push(root);
  await writeFile(join(root, "dojo.yaml"), "katas: []");
  const result = spawnSync(process.execPath, [worker, "--evaluate", root], {
    encoding: "utf8", timeout: 15_000, env: {
      ...process.env, DOJOFOO_HARNESS: "codex",
      DOJOFOO_EVAL_FIXTURE_HARNESS: "pi", DOJOFOO_EVAL_FIXTURE_MODEL: "test-only-no-inference",
    },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Evaluate one lesson");
});

it.each([
  ["--evaluate", "missing-fixtures.json"],
  ["--evaluate-heldout", "Held-out evaluation requires fresh learner fixtures"],
])("rejects unsafe replay input for %s before spending inference", async (mode, message) => {
  const root = await mkdtemp(join(tmpdir(), "dojo-eval-worker-test-")); roots.push(root);
  await writeFile(join(root, "dojo.yaml"), "katas: []");
  const result = spawnSync(process.execPath, [worker, mode, root], {
    encoding: "utf8", timeout: 15_000, env: {
      ...process.env, DOJOFOO_HARNESS: "codex",
      DOJOFOO_EVAL_FIXTURE_HARNESS: "pi", DOJOFOO_EVAL_FIXTURE_MODEL: "test-only-no-inference",
      DOJOFOO_EVAL_FIXTURE_PATH: join(root, "missing-fixtures.json"),
    },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
});
