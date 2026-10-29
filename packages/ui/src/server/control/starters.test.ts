import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { installStarter } from "./starters";

it("finds bundled courses when the CLI is launched through a package-manager symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-starter-symlink-"));
  try {
    const distribution = join(root, "package/dist");
    const course = join(distribution, "starters/create-your-own-dojo");
    await mkdir(course, { recursive: true });
    await writeFile(join(course, "dojo.yaml"), "name: create-your-own-dojo\n");
    const entry = join(distribution, "index.cjs");
    await writeFile(entry, 'require("node:fs").accessSync(require("node:path").join(process.argv[3], "dojo.yaml"));\n');
    await mkdir(join(root, ".bin"));
    const executable = join(root, ".bin/dojofoo");
    await symlink(entry, executable);
    vi.stubEnv("DOJO_CLI", executable);
    await expect(installStarter(root, "create-your-own-dojo")).resolves.toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
