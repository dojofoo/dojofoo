import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { readAuthoringFile, writeAuthoringFile } from "./files";
import { readAuthoringDraft } from "./service";
import { scaffoldAuthoringWorkspace } from "../scaffold";

it("respects author-owned ignore rules and excludes runtime files from draft/inspect and the file API", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-authoring-private-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  scaffoldAuthoringWorkspace({ root, style: "katas", name: "Private" });
  appendFileSync(join(root, ".gitignore"), "\n.npmrc\n");
  const paths = [".env", ".env.local", ".npmrc", "scripts/.env", "scripts/.dojo/runtime.json"];
  for (const path of paths) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "secret-value");
    expect(() => readAuthoringFile(root, path)).toThrow("Unsupported authoring file");
    expect(() => writeAuthoringFile(root, path, "replacement")).toThrow("Unsupported authoring file");
  }
  writeFileSync(join(root, ".env.example"), "EXAMPLE=\n");
  expect(JSON.stringify(readAuthoringDraft(root))).not.toContain("secret-value");
  expect(readAuthoringFile(root, ".env.example").content).toBe("EXAMPLE=\n");
  symlinkSync(join(root, ".env"), join(root, "public.md"));
  expect(() => readAuthoringFile(root, "public.md")).toThrow("Unsupported authoring file");
  expect(() => writeAuthoringFile(root, "public.md", "replacement")).toThrow("Unsupported authoring file");
});
