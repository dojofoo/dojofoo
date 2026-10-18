import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveRuntimeHarness } from "./runtime";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("resolves global, project, environment and role-specific overrides without mixing roles", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-runtime-"));
  roots.push(root);
  const home = join(root, "home");
  mkdirSync(home);
  const env = { DOJOFOO_HOME: home };
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("opencode");
  writeFileSync(join(home, "runtimes.json"), JSON.stringify({ authoring: "pi", lesson: "codex" }));
  expect(resolveRuntimeHarness("authoring", root, env)).toBe("pi");
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("codex");
  mkdirSync(join(root, ".dojo"));
  writeFileSync(join(root, ".dojo/runtimes.json"), JSON.stringify({ lesson: "cursor" }));
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("cursor");
  expect(resolveRuntimeHarness("authoring", root, env)).toBe("pi");
  expect(resolveRuntimeHarness("lesson", root, { ...env, DOJOFOO_HARNESS: "grok" })).toBe("grok");
  expect(resolveRuntimeHarness("lesson", root, { ...env, DOJOFOO_HARNESS: "grok", DOJOFOO_LESSON_HARNESS: "fx" })).toBe("fx");
  writeFileSync(join(root, ".dojo/runtimes.json"), JSON.stringify({ lesson: "opencode" }));
  expect(resolveRuntimeHarness("lesson", root, env)).toBe("opencode");
});

it("reports malformed settings rather than silently switching harness", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-runtime-"));
  roots.push(root);
  mkdirSync(join(root, ".dojo"));
  writeFileSync(join(root, ".dojo/runtimes.json"), JSON.stringify({ lesson: 123 }));
  expect(() => resolveRuntimeHarness("lesson", root, { DOJOFOO_HOME: root })).toThrow("Invalid lesson harness");
});
