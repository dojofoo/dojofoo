import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readMaterial } from "../authoring/evals/material";
import teaching from "../authoring/evals/teaching.eval";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("collects authored lesson evidence and ignores runtime, dependencies and links", async () => {
  const root = await mkdtemp(join(tmpdir(), "kyoshi-evidence-test-"));
  roots.push(root);
  await mkdir(join(root, "src/001-example/node_modules"), { recursive: true });
  await mkdir(join(root, "src/.runtime"));
  await writeFile(join(root, "dojo.yaml"), "mode: katas");
  await writeFile(join(root, "DOJO.md"), "Course guidance");
  await writeFile(join(root, "src/001-example/SENSEI.md"), "Actual teaching instructions");
  await writeFile(join(root, "src/001-example/node_modules/private.ts"), "exclude");
  await writeFile(join(root, "src/.runtime/private.ts"), "exclude");
  await symlink(root, join(root, "src/loop"));
  expect(await readMaterial(root)).toEqual({
    "dojo.yaml": "mode: katas", "DOJO.md": "Course guidance",
    "src/001-example/SENSEI.md": "Actual teaching instructions",
  });
});

it("fails on missing workspace instead of scoring empty evidence", async () => {
  await expect(readMaterial("/does-not-exist/kyoshi-eval")).rejects.toThrow();
});

it("uses the official Eve eval definition, with no paid call during discovery", () => {
  expect(teaching._tag).toBe("EveEval");
  expect(teaching.tags).toContain("pedagogy");
  expect(teaching.test).toBeTypeOf("function");
});

it("judges file snapshots before and after revision, not just the final response", async () => {
  const root = await mkdtemp(join(tmpdir(), "kyoshi-eval-flow-"));
  roots.push(root);
  await mkdir(join(root, "src/001-example"), { recursive: true });
  await writeFile(join(root, "dojo.yaml"), "name: Test\nmode: katas\nkatas: []\n");
  vi.stubEnv("DOJOFOO_EVAL_WORKSPACE", root);
  let turns = 0;
  const gate = vi.fn();
  const closedQA = vi.fn((_criteria: string, _options: unknown) => ({ label: () => ({ gate }) }));
  const context = {
    send: vi.fn(async () => {
      turns += 1;
      await writeFile(join(root, "src/001-example/SENSEI.md"), turns === 1 ? "Before" : "Revised");
      return { expectOk() {} };
    }),
    succeeded: vi.fn(), check: vi.fn(), transcript: "Agent claims success",
    judge: { autoevals: { closedQA } },
  };
  await teaching.test(context as unknown as Parameters<typeof teaching.test>[0]);
  expect(context.send).toHaveBeenCalledTimes(2);
  expect(closedQA).toHaveBeenCalledTimes(3);
  expect(closedQA.mock.calls[0]?.[1]).toMatchObject({ on: { files: { "src/001-example/SENSEI.md": "Before" } } });
  expect(closedQA.mock.calls[2]?.[1]).toMatchObject({ on: {
    before: { "src/001-example/SENSEI.md": "Before" },
    after: { "src/001-example/SENSEI.md": "Revised" },
  } });
  expect(gate.mock.calls).toEqual([[0.8], [0.8], [0.8]]);
});
