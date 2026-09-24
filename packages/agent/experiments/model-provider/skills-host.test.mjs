import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@dojofoo/agent/client";

const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
const { createDevelopmentServer } = await import(new URL("dist/src/internal/nitro/host/start-development-server.js", eveRoot));

test("Eve loads an authored skill through the harness provider and retains its session", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(process.cwd(), "hosted-skills-"));
  let server;
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "skill-host-fixture", private: true, type: "module" }));
    await copyFile(new URL("host-agent.fixture.ts", import.meta.url), join(root, "agent.ts"));
    await writeFile(join(root, "instructions.md"), "HOST_INSTRUCTIONS_LOADED: Use the course-outline skill when requested.\n");
    await mkdir(join(root, "tools"));
    await writeFile(join(root, "tools/root_only.ts"), 'import { defineTool } from "@dojofoo/agent/tools"; import read from "@dojofoo/agent/tools/read_file"; export default defineTool({ ...read, description: "Root-only lesson evidence lookup." });\n');
    await mkdir(join(root, "skills/course-outline"), { recursive: true });
    const skill = "---\nname: course-outline\ndescription: Shape one observable lesson outcome.\n---\n\nOUTLINE_SKILL_EVIDENCE: Ask who the learner is before choosing prerequisites.\n";
    await writeFile(join(root, "skills/course-outline/SKILL.md"), skill);
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject" });
    const { url } = await server.start();
    const client = new Client({ host: url });
    const created = await client.sessions.create({ message: "Load authoring skill", signal: AbortSignal.timeout(30_000) });
    const result = await created.response.result();
    assert.equal(result.status, "waiting", JSON.stringify(result));
    const reply = JSON.parse(result.message);
    const loaded = reply.history.filter(item => typeof item === "object" && item.tool === "load_skill");
    assert.equal(loaded.length, 1, JSON.stringify(result));
    assert.match(loaded[0].output, /OUTLINE_SKILL_EVIDENCE/);
    assert.ok(result.events.some(event => event.type === "action.result"), "Skill load must remain visible as a tool result");
    const continued = await (await created.session.send("Continue", { signal: AbortSignal.timeout(30_000) })).result();
    const next = JSON.parse(continued.message);
    assert.equal(next.sessionId, reply.sessionId);
    assert.equal(next.history.filter(item => typeof item === "object" && item.tool === "load_skill").length, 1);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
