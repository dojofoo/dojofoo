import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, it } from "vitest";
import { runCoordinator } from "../../ui/src/server/run/coordinator";
import { runRoutes } from "../../ui/src/server/run/routes";
import { dojoLessonContext, getLesson, saveLearnerObservation } from "../../ui/src/server/lesson/service";

it("round-trips grounded learner notes through the packaged MCP server without a model", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-learner-notes-wire-"));
  const capability = randomUUID();
  const text = "I am not sure what a callback is.";
  const source = { sessionId: "fixture-session", messageId: "fixture-message", sha256: createHash("sha256").update(text).digest("hex") };
  const lesson = join(root, ".dojos/course/src/first");
  await mkdir(lesson, { recursive: true });
  await mkdir(join(root, ".dojo"));
  await writeFile(join(root, ".dojorc"), JSON.stringify({ currentDojo: "course", currentKata: "first", progress: {} }));
  await writeFile(join(root, ".dojos/course/dojo.yaml"), JSON.stringify({ name: "Fixture", version: "1.0.0", description: "MCP round-trip fixture", test: "node --test", katas: [{ name: "first", template: "src/first/kata.ts" }] }));
  await writeFile(join(root, ".dojos/course/DOJO.md"), "Course guidance");
  await writeFile(join(lesson, "SENSEI.md"), "# Callback lesson");
  await writeFile(join(lesson, "kata.ts"), "export const value = 0;");
  await writeFile(join(root, ".dojo/web.json"), JSON.stringify({ version: 4, threads: {}, results: {}, checkpoints: {}, observations: {}, learnerEvidence: {
    "course/first": [{ kind: "transcript-excerpt", role: "user", text, truncated: false, source: { ...source, lessonId: "first" } }],
  } }));
  runCoordinator.attach(capability, {
    ask: async () => { throw new Error("No question expected"); },
    show: () => { throw new Error("No presentation expected"); },
    context: async () => dojoLessonContext((await getLesson(root, "first"))!),
    observe: input => saveLearnerObservation(root, "first", input),
  });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await runRoutes.request("http://localhost/", {
      method: request.method,
      headers: new Headers(Object.entries(request.headers).flatMap<[string, string]>(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(",") : value]])),
      body: Buffer.concat(chunks),
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind");
  const mcp = new Client({ name: "learner-notes-fixture", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [process.env.DOJOFOO_TEST_LESSON_MCP ?? resolve(import.meta.dirname, "../dist/lesson-mcp.js")],
    env: {
      PATH: process.env.PATH ?? "", DOJO_PROJECT_ROOT: root, DOJO_CLI: resolve(import.meta.dirname, "../dist/index.js"),
      DOJOFOO_TOOL_PROFILE: "lesson", DOJOFOO_COORDINATOR_URL: `http://127.0.0.1:${address.port}`, DOJOFOO_RUN_CAPABILITY: capability,
    },
    stderr: "pipe",
  });
  try {
    await mcp.connect(transport);
    expect((await mcp.listTools()).tools.map(tool => tool.name)).toContain("dojo_learner_observe");
    const arguments_ = { category: "uncertainty", interpretation: "Learner reports unfamiliarity with callbacks.", status: "active", source };
    const result = await mcp.callTool({ name: "dojo_learner_observe", arguments: arguments_ });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const saved = (result.structuredContent as { observation: { id: string } }).observation;
    expect(saved.id).toMatch(/^[a-f0-9]{64}$/u);
    const context = await mcp.callTool({ name: "dojo_context", arguments: {} });
    expect(context.isError, JSON.stringify(context)).not.toBe(true);
    expect(context.structuredContent).toMatchObject({ learner: { interpretations: [{ id: saved.id, interpretation: arguments_.interpretation, evidence: { text, role: "user" } }] } });
    const before = await readFile(join(root, ".dojo/web.json"), "utf8");
    const rejected = await mcp.callTool({ name: "dojo_learner_observe", arguments: { ...arguments_, source: { ...source, sha256: "f".repeat(64) } } });
    expect(rejected.isError).toBe(true);
    expect(await readFile(join(root, ".dojo/web.json"), "utf8")).toBe(before);
  } finally {
    await mcp.close();
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    runCoordinator.detach(capability);
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
