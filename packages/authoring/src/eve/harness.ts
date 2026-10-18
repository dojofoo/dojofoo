import { createCodex } from "@ai-sdk/harness-codex";
import { createLocalCursor } from "./local-cursor.ts";
import { createFx } from "@ai-sdk/harness-fx";
import { createGrokBuild } from "@ai-sdk/harness-grok-build";
import { createOpenCode } from "@ai-sdk/harness-opencode";
import { createPi, pi } from "@ai-sdk/harness-pi";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const harnesses = {
  codex: createCodex({ port: 0 }),
  cursor: createLocalCursor(),
  fx: createFx({ port: 0 }),
  grok: createGrokBuild({ port: 0 }),
  opencode: createOpenCode({ port: 0 }),
  pi,
} as const;

export type AuthoringHarness = keyof typeof harnesses;

/** Cursor uses its installed CLI/login; other adapters keep their native auth. */
export function authoringHarness(environment: NodeJS.ProcessEnv = process.env) {
  const name = environment.DOJOFOO_HARNESS || "opencode";
  if (!Object.hasOwn(harnesses, name)) {
    throw new Error(`Unsupported Dojofoo authoring harness: ${name}`);
  }
  // Custom providers (including credentials referenced by models.json) belong
  // to Pi's native setup. The adapter's default only discovers auth.json.
  if (name === "pi") {
    return createPi({
      agentDir: resolve(environment.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")),
    });
  }
  return harnesses[name as AuthoringHarness];
}
