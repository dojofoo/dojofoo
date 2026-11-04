import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { agentSourceHash } from "./artifact";

const skillEdit = vi.hoisted(() => ({ text: "" }));
vi.mock("node:fs/promises", async importOriginal => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    readFile: async (...args: Parameters<typeof fs.readFile>) => {
      const content = await fs.readFile(...args);
      return String(args[0]).endsWith("skills/lesson-design/SKILL.md") && skillEdit.text
        ? Buffer.concat([Buffer.from(content), Buffer.from(skillEdit.text)]) : content;
    },
  };
});

it("invalidates the release build when a bundled teaching skill changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-agent-skills-hash-"));
  try {
    await writeFile(join(root, "instructions.md"), "Teach patiently.");
    const original = await agentSourceHash(root);
    skillEdit.text = "\nUpdated teaching guidance.\n";
    expect(await agentSourceHash(root)).not.toBe(original);
  } finally {
    skillEdit.text = "";
    await rm(root, { recursive: true, force: true });
  }
});

it("invalidates prepared agents for source edits, while workspace settings and build output do not", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-agent-hash-"));
  try {
    await writeFile(join(root, "instructions.md"), "Teach patiently.");
    const original = await agentSourceHash(root);
    await mkdir(join(root, ".output"));
    await writeFile(join(root, ".output", "server.js"), "built");
    await writeFile(join(root, "runtime.json"), JSON.stringify({ courseRoot: "/another/course", model: "other" }));
    expect(await agentSourceHash(root)).toBe(original);
    await writeFile(join(root, "instructions.md"), "Teach with questions.");
    expect(await agentSourceHash(root)).not.toBe(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
