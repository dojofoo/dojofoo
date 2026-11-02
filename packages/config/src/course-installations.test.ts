import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { observeWorkspacePath } from "./local-state";
import { assertCourseWorkspace, findInstalledCourse } from "./course-installations";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("binds a course to one workspace and releases it when the installation is removed", () => {
  const home = mkdtempSync(join(tmpdir(), "dojo-course-owner-")); roots.push(home);
  const root = join(home, "first");
  const course = join(root, "courses", "how-to-run-a-dojo");
  mkdirSync(course, { recursive: true });
  writeFileSync(join(root, ".dojorc"), JSON.stringify({ currentDojo: "how-to-run-a-dojo", currentKata: null, editor: null }));
  writeFileSync(join(course, "dojo.yaml"), "mode: interactive\nname: how-to-run-a-dojo\nversion: 1.0.0\ndescription: Learn Dojo\nlessons: intro.json\n");
  writeFileSync(join(course, "intro.json"), JSON.stringify({ id: "intro", title: "How to run a dojo", steps: [] }));
  const options = { stateHome: home };
  observeWorkspacePath(root, options);
  expect(findInstalledCourse("how-to-run-a-dojo", options)).toMatchObject({ root, title: "How to run a dojo" });
  expect(() => assertCourseWorkspace(join(home, "second"), "how-to-run-a-dojo", options)).toThrow("Remove the existing installation first");
  expect(() => assertCourseWorkspace(root, "how-to-run-a-dojo", options)).not.toThrow();
  rmSync(course, { recursive: true });
  expect(() => assertCourseWorkspace(join(home, "second"), "how-to-run-a-dojo", options)).not.toThrow();
});
