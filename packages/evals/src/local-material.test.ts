import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import materialEval from "../authoring/evals/local-material.eval";
import { judgeMaterial } from "../authoring/evals/local-judges";
import { readMaterial } from "../authoring/evals/material";

vi.mock("../authoring/evals/local-judges", () => ({ judgeMaterial: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("captures course material without following root or lesson symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "kyoshi-material-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "outside.md"), "Not course material");
    await writeFile(join(root, "src/SENSEI.md"), "Teach this");
    await symlink(join(root, "outside.md"), join(root, "DOJO.md"));
    await symlink(join(root, "outside.md"), join(root, "src/linked.md"));
    expect(await readMaterial(root)).toEqual({ "src/SENSEI.md": "Teach this" });
    await mkdir(join(root, "other"));
    await symlink(join(root, "src"), join(root, "other/src"));
    expect(await readMaterial(join(root, "other"))).toEqual({});
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each(["failed", "waiting"])("never spends judge calls when the author is %s", async (status) => {
  const root = await mkdtemp(join(tmpdir(), "kyoshi-failed-author-"));
  try {
    await mkdir(join(root, ".dojo"));
    vi.stubEnv("DOJOFOO_EVAL_WORKSPACE", root);
    vi.stubEnv("DOJOFOO_EVAL_LOCAL_JUDGES", "1");
    const context = {
      send: vi.fn(async () => ({ status, events: [], expectOk() { if (status === "failed") throw new Error("Author 401"); } })),
      succeeded: vi.fn(),
      require: vi.fn(async () => { throw new Error("Author is parked"); }),
    };
    await expect(materialEval.test(context as unknown as Parameters<typeof materialEval.test>[0])).rejects.toThrow(status === "failed" ? "Author 401" : "Author is parked");
    expect(judgeMaterial).not.toHaveBeenCalled();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("grades a completed turn even when the conversation waits for the next user", async () => {
  const root = await mkdtemp(join(tmpdir(), "kyoshi-completed-author-"));
  try {
    await mkdir(join(root, ".dojo"));
    await mkdir(join(root, "src"));
    vi.stubEnv("DOJOFOO_EVAL_WORKSPACE", root);
    vi.stubEnv("DOJOFOO_EVAL_LOCAL_JUDGES", "1");
    vi.mocked(judgeMaterial).mockResolvedValue([]);
    const context = {
      send: vi.fn(async () => ({ status: "waiting", events: [{ type: "turn.completed" }, { type: "session.waiting" }], expectOk() {} })),
      succeeded: vi.fn(),
      require: vi.fn(async (completed: boolean) => { if (!completed) throw new Error("Author is parked"); }),
    };
    await materialEval.test(context as unknown as Parameters<typeof materialEval.test>[0]);
    expect(context.require).toHaveBeenCalledWith(true, expect.anything());
    expect(judgeMaterial).toHaveBeenCalledOnce();
  } finally { await rm(root, { recursive: true, force: true }); }
});
