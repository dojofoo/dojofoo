import {
  createAuthoringRoutes,
  type AuthoringRouteDependencies,
} from "@dojofoo/authoring/server";
import { toServerSentEventsResponse } from "@tanstack/ai";
import type { HarnessKind } from "./harness/adapter";
import { dojofooHarness } from "./harness/registry";
import { streamAcpAsAgUi } from "./lesson/agui-stream";
import { acpClient } from "./lesson/codex-client";
import { resolveRequestWorkspace } from "./control/workspace";
import { mountEveAuthoring } from "./authoring-eve";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const agent: AuthoringRouteDependencies["agent"] = {
  currentHarness: dojofooHarness,
  start: ({ root, runtimeKey, harness, instructions }) => acpClient.startThread({
    root,
    runtimeKey,
    harness: harness as HarnessKind,
    developerInstructions: instructions,
    toolProfile: "authoring",
  }),
  resume: (sessionId, { root, runtimeKey, harness, instructions }) =>
    acpClient.resumeThread(sessionId, {
      root,
      runtimeKey,
      harness: harness as HarnessKind,
      developerInstructions: instructions,
      toolProfile: "authoring",
    }),
  history: (sessionId) => acpClient.history(sessionId),
  send: (sessionId, message, onPart, options) =>
    acpClient.send(sessionId, message, onPart, options),
  answer: (sessionId, answers) => acpClient.answerUserInput(sessionId, answers),
};

export const authoringRoutes = createAuthoringRoutes({
  agent,
  resolveWorkspace: resolveRequestWorkspace,
  stream: ({ execute, runId, threadId }) => toServerSentEventsResponse(
    streamAcpAsAgUi({ execute, runId, threadId })
  ),
});

const eveRoot = process.env.DOJO_EVE_ROOT;
export const closeAuthoringRuntime = mountEveAuthoring(authoringRoutes, {
  host: process.env.EVE_BASE_URL,
  runtime: eveRoot ? async () => {
    // Native Node loading keeps the application's runtime and workers outside
    // Vite's UI module graph, preserving their own package scope.
    const load = createRequire(resolve(eveRoot, "package.json"));
    const { createDevelopmentServer } = load("@dojofoo/agent/server") as typeof import("@dojofoo/agent/server");
    return createDevelopmentServer(eveRoot, { host: "127.0.0.1", port: 0 });
  } : () => {
    const load = createRequire(import.meta.url);
    const { acquireKyoshiRuntime } = load("@dojofoo/authoring/eve/runtime") as typeof import("@dojofoo/authoring/eve/runtime");
    return acquireKyoshiRuntime(resolveRequestWorkspace(new Request("http://localhost/")));
  },
  root: () => resolveRequestWorkspace(new Request("http://localhost/")),
  resolveWorkspace: resolveRequestWorkspace,
});
