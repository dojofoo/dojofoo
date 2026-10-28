import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { agentSourceHash } from "./artifact";

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
