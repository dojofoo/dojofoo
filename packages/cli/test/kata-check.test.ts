import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { add } from "../src/commands/add";
import { kata } from "../src/commands/kata";
import { readCatalog, readDojoRc, resolveAllKatas, writeDojoRc } from "../src/config";

it("--course checks and records completion for that course and leaves currentDojo as it was", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "dojo-kata-course-"));
  const root = resolve(directory, "learning");
  mkdirSync(root);
  vi.stubEnv("DOJOFOO_HOME", resolve(directory, "private"));
  onTestFinished(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
  for (const id of ["first", "second"]) {
    const source = resolve(directory, id);
    const lesson = resolve(source, "lessons/start");
    mkdirSync(lesson, { recursive: true });
    writeFileSync(resolve(source, "dojo.yaml"), `name: ${id}\nversion: 1.0.0\ndescription: Practice\ntest: node {template}\nrunner:\n  adapter: exit-code\nkatas:\n  - name: start\n    template: lessons/start/kata.cjs\n`);
    writeFileSync(resolve(source, "DOJO.md"), "Teach the learner.");
    writeFileSync(resolve(lesson, "SENSEI.md"), "Help without giving the edit.");
    writeFileSync(resolve(lesson, "kata.cjs"), "exports.double = () => { throw Error('Not implemented'); };\n");
    writeFileSync(resolve(lesson, "kata.test.cjs"), "require('node:assert/strict').equal(require('./kata.cjs').double(3), 6);\n");
    await add(root, [source]);
  }
  const rc = readDojoRc(root);
  rc.currentDojo = "first";
  rc.currentKata = "start";
  writeDojoRc(root, rc);
  const second = resolveAllKatas(root, { ...readDojoRc(root), currentDojo: "second" }, readCatalog(root, "second"))[0]!;
  writeFileSync(second.workspacePath, "exports.double = value => value * 2;\n");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  onTestFinished(() => log.mockRestore());
  kata(root, ["start", "--check", "--course", "second", "--reporter=json"]);
  expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({ passed: 1, total: 1 });
  const after = readDojoRc(root);
  expect(after.currentDojo).toBe("first");
  expect(after.currentKata).toBe("start");
  expect(after.progress?.second?.completed).toEqual(["start"]);
  expect(after.progress?.first?.completed ?? []).toEqual([]);
});
