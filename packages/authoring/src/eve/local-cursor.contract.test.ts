import { expect, it, vi } from "vitest";
import { createLocalCursor } from "./local-cursor";

vi.mock("node:child_process", async importOriginal => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  execFileSync: vi.fn(() => "/fixture/Cursor Agent/bin/agent"),
}));

it("binds the installed official Cursor bootstrap without copying credentials or running its installer", async () => {
  // The adapter itself is real. Only locating the user's executable is mocked.
  // Creating a bootstrap descriptor does not launch a CLI or a model turn.
  const bootstrap = await createLocalCursor().getBootstrap!({});
  const file = bootstrap.files?.find(item => item.path.endsWith("implementation.json"));
  expect(file).toBeDefined();
  expect(JSON.parse(String(file!.content))).toMatchObject({
    executablePath: "home/.local/bin/agent", privateHome: false, envKeys: [],
  });
  expect(bootstrap.commands?.some(item => item.command.includes("ln -sf '/fixture/Cursor Agent/bin/agent'"))).toBe(true);
  expect(bootstrap.commands?.some(item => item.command === "bash implementation/install.sh")).toBe(false);
  expect(bootstrap.files?.some(item => item.path.endsWith("implementation/install.sh"))).toBe(false);
});
