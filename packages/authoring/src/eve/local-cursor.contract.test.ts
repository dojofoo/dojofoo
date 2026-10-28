import { expect, it, vi } from "vitest";
import { createLocalCursor } from "./local-cursor";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createCursor } from "@ai-sdk/harness-cursor";

vi.mock("@ai-sdk/harness-cursor", async importOriginal => {
  const actual = await importOriginal<typeof import("@ai-sdk/harness-cursor")>();
  return { ...actual, createCursor: vi.fn(actual.createCursor) };
});

vi.mock("node:child_process", async importOriginal => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  execFileSync: vi.fn(() => "/fixture/Cursor Agent/bin/agent"),
}));

it("binds the installed official Cursor bootstrap without copying credentials or running its installer", async () => {
  // The adapter itself is real. Only locating the user's executable is mocked.
  // Preparing the launcher does not launch a CLI or a model turn.
  const bootstrap = await createLocalCursor().getBootstrap!({});
  expect(createCursor).toHaveBeenLastCalledWith({ port: 0, auth: {} });
  const file = bootstrap.files?.find(item => item.path.endsWith("home/.local/bin/agent"));
  expect(file).toBeDefined();
  expect(bootstrap.commands?.some(item => item.command === "chmod 700 home/.local/bin/agent")).toBe(true);
  expect(bootstrap.commands?.some(item => item.command === "bash install.sh")).toBe(false);
  expect(bootstrap.files?.some(item => item.path.endsWith("install.sh"))).toBe(false);

  const root = await mkdtemp(join(tmpdir(), "dojo-cursor-launch-"));
  try {
    const installed = join(root, "Cursor Agent");
    await writeFile(installed, '#!/bin/sh\nprintf "%s\\n%s" "$HOME" "$1"\n', { mode: 0o700 });
    vi.mocked(execFileSync).mockReturnValueOnce(installed);
    const local = await createLocalCursor().getBootstrap!({});
    const launcher = join(root, "launcher");
    await writeFile(launcher, local.files!.find(item => item.path.endsWith("home/.local/bin/agent"))!.content);
    await chmod(launcher, 0o700);
    const { stdout } = await promisify(execFile)(launcher, ["argument with spaces"], {
      env: { ...process.env, HOME: join(root, "private-home") },
    });
    expect(stdout).toBe(`${homedir()}\nargument with spaces`);
  } finally { await rm(root, { recursive: true, force: true }); }
});
