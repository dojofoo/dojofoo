import { createCodex } from "@ai-sdk/harness-codex";
import { createLocalCursor } from "./local-cursor.ts";
import { createFx } from "@ai-sdk/harness-fx";
import { createGrokBuild } from "@ai-sdk/harness-grok-build";
import { createOpenCode } from "@ai-sdk/harness-opencode";
import { pi } from "@ai-sdk/harness-pi";

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
  return harnesses[name as AuthoringHarness];
}
