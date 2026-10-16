import type { HarnessAdapter, HarnessKind } from "./adapter";
import { codexHarnessAdapter } from "./codex";
import { cursorHarnessAdapter, fxHarnessAdapter, grokHarnessAdapter } from "./native-acp";
import { opencodeHarnessAdapter } from "./opencode";

const adapters: Record<HarnessKind, HarnessAdapter> = {
  codex: codexHarnessAdapter,
  cursor: cursorHarnessAdapter,
  fx: fxHarnessAdapter,
  grok: grokHarnessAdapter,
  opencode: opencodeHarnessAdapter,
};

export function dojofooHarness(environment: NodeJS.ProcessEnv = process.env): HarnessKind {
  const override = environment.DOJOFOO_HARNESS;
  if (!override) return "opencode";
  if (override in adapters) return override as HarnessKind;
  if (override === "pi") {
    throw new Error("Pi is supported for authoring, but not by the ACP lesson runtime. Select Codex, OpenCode, Cursor, Grok, or FX for lesson trials.");
  }
  throw new Error(`Unsupported Dojofoo harness: ${override}`);
}

export function harnessAdapter(kind: HarnessKind): HarnessAdapter {
  return adapters[kind];
}
