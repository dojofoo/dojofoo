import { describe, expect, it, vi } from "vitest";
import { createLocalCursor } from "./local-cursor";

const fixture = vi.hoisted(() => ({
  options: undefined as unknown,
  binary: "/Applications/Cursor Agent/bin/agent",
  descriptor: { executablePath: "home/.local/bin/agent", privateHome: true, args: ["--disable-auto-update", "acp"], envKeys: ["CURSOR_API_KEY"] },
  start: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFileSync: () => fixture.binary }));
vi.mock("@ai-sdk/harness-cursor", () => ({ createCursor: (options: unknown) => {
  fixture.options = options;
  return { harnessId: "cursor", doStart: fixture.start, getBootstrap: async () => ({
    bootstrapDir: ".harness-bootstrap/cursor",
    files: [
      { path: ".harness-bootstrap/cursor/bridge.mjs", content: "official bridge" },
      { path: ".harness-bootstrap/cursor/implementation/implementation.json", content: JSON.stringify(fixture.descriptor) },
      { path: ".harness-bootstrap/cursor/implementation/install.sh", content: "curl https://cursor.com/install | bash" },
    ],
    commands: [{ command: "pnpm install --frozen-lockfile --store-dir .pnpm-store" }, { command: "bash implementation/install.sh" }],
  }) };
} }));

describe("local Cursor binding", () => {
  it("disables credential discovery and keeps the official runtime", async () => {
    const harness = createLocalCursor();
    expect(fixture.options).toEqual({ port: 0, auth: {} });
    expect(harness.doStart).toBe(fixture.start);
    const bootstrap = await harness.getBootstrap!({});
    const descriptor = bootstrap.files?.find(file => file.path.endsWith("implementation.json"));
    expect(JSON.parse(String(descriptor?.content))).toEqual({ ...fixture.descriptor, privateHome: false, envKeys: [] });
    expect(bootstrap.files?.find(file => file.path.endsWith("bridge.mjs"))?.content).toBe("official bridge");
    expect(bootstrap.files?.some(file => file.path.endsWith("install.sh"))).toBe(false);
    expect(bootstrap.commands?.[0]?.command).toContain("pnpm install");
    expect(bootstrap.commands?.[1]?.command).toContain("'/Applications/Cursor Agent/bin/agent'");
    expect(JSON.stringify(bootstrap)).not.toMatch(/curl|CURSOR_API_KEY|CURSOR_AUTH_TOKEN|security find/);
  });

  it("fails closed when the upstream bootstrap contract changes", async () => {
    const original = fixture.descriptor.executablePath;
    fixture.descriptor.executablePath = "new-upstream-layout";
    try { await expect(createLocalCursor().getBootstrap!({})).rejects.toThrow("Cursor bootstrap changed"); }
    finally { fixture.descriptor.executablePath = original; }
  });
});
