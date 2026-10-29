import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { readAuthoringFile, saveAuthoringFile, writeAuthoringFile } from "./files";
import { readAuthoringDraft } from "./service";
import { scaffoldAuthoringWorkspace } from "../scaffold";
import { InMemoryFs } from "just-bash";

it("reads and writes the provided workspace filesystem without changing a local copy", async () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-filesystem-provider-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  scaffoldAuthoringWorkspace({ root, style: "katas", name: "Workspace files" });
  const local = readFileSync(join(root, "DOJO.md"), "utf8");
  const filesystem = new InMemoryFs({ "/DOJO.md": "# Workspace version\n" });
  expect(await readAuthoringFile(root, "DOJO.md", filesystem)).toEqual({ path: "DOJO.md", content: "# Workspace version\n" });
  await saveAuthoringFile(root, "DOJO.md", "# Updated workspace", filesystem);
  expect(await filesystem.readFile("/DOJO.md")).toBe("# Updated workspace\n");
  expect(readFileSync(join(root, "DOJO.md"), "utf8")).toBe(local);
});

it("respects author-owned ignore rules and excludes runtime files from draft/inspect and the file API", async () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-authoring-private-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  scaffoldAuthoringWorkspace({ root, style: "katas", name: "Private" });
  appendFileSync(join(root, ".gitignore"), "\n.npmrc\n");
  const paths = [".env", ".env.local", ".npmrc", "scripts/.env", "scripts/.dojo/runtime.json"];
  for (const path of paths) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "secret-value");
    await expect(readAuthoringFile(root, path)).rejects.toThrow("Unsupported authoring file");
    expect(() => writeAuthoringFile(root, path, "replacement")).toThrow("Unsupported authoring file");
  }
  writeFileSync(join(root, ".env.example"), "EXAMPLE=\n");
  expect(JSON.stringify(readAuthoringDraft(root))).not.toContain("secret-value");
  expect((await readAuthoringFile(root, ".env.example")).content).toBe("EXAMPLE=\n");
  symlinkSync(join(root, ".env"), join(root, "public.md"));
  await expect(readAuthoringFile(root, "public.md")).rejects.toThrow("Unsupported authoring file");
  expect(() => writeAuthoringFile(root, "public.md", "replacement")).toThrow("Unsupported authoring file");
});
