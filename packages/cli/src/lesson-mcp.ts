import { execFileSync } from "node:child_process";
import { formatLessonContext, lessonCapabilities, uiCapabilities, type DojoLessonContext, type LearnerObservation } from "@dojofoo/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const root = process.env.DOJO_PROJECT_ROOT;
const cli = process.env.DOJO_CLI;
const profile = process.env.DOJOFOO_TOOL_PROFILE ?? "lesson";
if (!root || !cli) throw new Error("DOJO_PROJECT_ROOT and DOJO_CLI are required");

const server = new McpServer({ name: "dojofoo-lesson", version: "0.1.0" });

if (profile === "lesson") server.registerTool(lessonCapabilities.check.tool, {
  description: lessonCapabilities.check.description,
  inputSchema: {},
}, async () => {
  try {
    const output = execFileSync(process.execPath, [cli, "kata", "--check", "--reporter=json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DOJO_PROJECT_ROOT: root, DOJO_SKIP_PREPARE: "1" },
      timeout: 90_000,
    });
    const report = JSON.parse(output) as Record<string, unknown>;
    return { content: [{ type: "text", text: output }], structuredContent: report };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { content: [{ type: "text", text: message }], isError: true };
  }
});

if (profile === "lesson") server.registerTool(lessonCapabilities.context.tool, {
  description: lessonCapabilities.context.description,
  inputSchema: {},
}, async () => {
  try {
    const result = await runCommand(lessonCapabilities.context.method, {});
    const context = result.context;
    if (!context) throw new Error("The lesson coordinator returned no context");
    return {
      content: [{ type: "text", text: formatLessonContext(context) }],
      structuredContent: { ...context },
    };
  } catch (cause) {
    return { content: [{ type: "text", text: cause instanceof Error ? cause.message : String(cause) }], isError: true };
  }
});

if (profile === "lesson") server.registerTool(lessonCapabilities.observe.tool, {
  description: lessonCapabilities.observe.description,
  inputSchema: {
    category: z.enum(["uncertainty", "understanding", "misconception", "support", "transfer"]),
    interpretation: z.string().trim().min(1).max(240),
    status: z.enum(["active", "resolved"]),
    source: z.object({ sessionId: z.string(), messageId: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
    replaces: z.string().optional(),
  },
}, async (observation) => {
  const result = await runCommand(lessonCapabilities.observe.method, { observation });
  if (!result.observation) throw new Error("The learning note was not saved");
  return { content: [{ type: "text", text: JSON.stringify(result.observation) }], structuredContent: { observation: result.observation } };
});

server.registerTool(uiCapabilities.ask.tool, {
  description: uiCapabilities.ask.description,
  inputSchema: {
    title: z.string(),
    options: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional() })).min(2),
  },
}, async ({ title, options }) => {
  const result = await runCommand(uiCapabilities.ask.method, { title, options });
  if (!result.answers) throw new Error("The learner could not answer the prompt");
  return {
    content: [{ type: "text", text: JSON.stringify(result.answers) }],
    structuredContent: { answers: result.answers },
  };
});

if (profile === "lesson") server.registerTool(uiCapabilities.show.tool, {
  description: uiCapabilities.show.description,
  inputSchema: { fragmentId: z.string() },
}, async ({ fragmentId }) => {
  const result = await runCommand(uiCapabilities.show.method, { fragmentId });
  if (!result.fragmentId) throw new Error("The lesson fragment could not be shown");
  return {
    content: [{ type: "text", text: result.fragmentId }],
    structuredContent: { fragmentId: result.fragmentId },
  };
});

if (profile === "lesson") server.registerTool(lessonCapabilities.complete.tool, {
  description: lessonCapabilities.complete.description,
  inputSchema: {},
}, async () => {
  const result = await runCommand(uiCapabilities.ask.method, {
    title: "What would you like to do next?",
    options: ["Review", "Move on", "Pause"].map((choice) => ({ id: choice, title: choice })),
  });
  if (!result.answers) throw new Error("The learner could not answer the prompt");
  const decision = Object.values(result.answers).flat()[0];
  return {
    content: [{ type: "text", text: decision ?? "No choice was made." }],
    structuredContent: { decision },
  };
});

async function runCommand(method: string, params: unknown): Promise<{
  answers?: Record<string, string[]>;
  context?: DojoLessonContext;
  error?: string;
  fragmentId?: string;
  observation?: LearnerObservation;
}> {
  const coordinator = process.env.DOJOFOO_COORDINATOR_URL;
  const capability = process.env.DOJOFOO_RUN_CAPABILITY;
  if (!coordinator || !capability) throw new Error("The lesson run coordinator is unavailable");
  const response = await fetch(new URL("/api/run-command", coordinator), {
    method: "POST",
    headers: { authorization: `Bearer ${capability}`, "content-type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const result = await response.json() as {
    answers?: Record<string, string[]>;
    context?: DojoLessonContext;
    error?: string;
    fragmentId?: string;
    observation?: LearnerObservation;
  };
  if (!response.ok) throw new Error(result.error ?? "The lesson run command failed");
  return result;
}

await server.connect(new StdioServerTransport());
