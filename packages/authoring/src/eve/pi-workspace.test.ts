import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPi } from "@ai-sdk/harness-pi";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { expect, it } from "vitest";
import { canonicalLocalPi } from "./local-pi";
// @ts-expect-error Shared inference fixture is JavaScript.
import { startLoopbackModel } from "../../../agent/experiments/model-provider/loopback-openai.mjs";

it.each([false, true])("Pi native read/write with a local symlink (canonical=%s)", async canonical => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-pi-path-")));
  const course = join(root, "authored");
  const mount = join(root, "runtime");
  await mkdir(course);
  await mkdir(mount);
  await symlink(course, join(mount, "course"));
  await writeFile(join(course, "DOJO.md"), "Course context.");
  const endpoint = await startLoopbackModel({ selectResponsesTool: (_input: unknown, requested: string[]) => [
    { name: "read", input: { file_path: "DOJO.md" } },
    { name: "write", input: { file_path: "SENSEI.md", content: "Authored guidance." } },
  ][requested.length] });
  const sandbox = await createLocalSandbox(mount);
  const adapter = createPi({ auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL } });
  const agent = new HarnessAgent({ harness: canonical ? canonicalLocalPi(adapter) : adapter,
    model: "openai/gpt-4o", instructions: "KYOSHI_RULE_SENTINEL: teach before testing recall.", sandboxConfig: { workDir: "course" } });
  try {
    const session = await agent.createSession({ sandboxSession: sandbox });
    await agent.generate({ session, prompt: "Read and write course guidance.", abortSignal: AbortSignal.timeout(30_000) });
    await session.stop();
    const evidence = JSON.stringify(endpoint.requests);
    expect(evidence).toContain("KYOSHI_RULE_SENTINEL");
    if (canonical) {
      expect(evidence).not.toContain("Pi path escapes");
      expect(evidence).toContain("Course context.");
      expect(await readFile(join(course, "SENSEI.md"), "utf8")).toBe("Authored guidance.");
    } else {
      expect(evidence).toContain("Pi path escapes");
    }
  } finally {
    await sandbox.stop();
    await endpoint.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
