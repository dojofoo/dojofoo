import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";

// Extract concrete adapter types from official factories without invoking them.
type FactoryAdapter<Module> = {
  [Key in keyof Module]: Module[Key] extends (...args: never[]) => infer Result
    ? Result extends { specificationVersion: "harness-v1" } ? Result : never
    : never;
}[keyof Module];

type Adapters = {
  claudeCode: FactoryAdapter<typeof import("@ai-sdk/harness-claude-code")>;
  cline: FactoryAdapter<typeof import("@ai-sdk/harness-cline")>;
  codex: FactoryAdapter<typeof import("@ai-sdk/harness-codex")>;
  cursor: FactoryAdapter<typeof import("@ai-sdk/harness-cursor")>;
  deepagents: FactoryAdapter<typeof import("@ai-sdk/harness-deepagents")>;
  fx: FactoryAdapter<typeof import("@ai-sdk/harness-fx")>;
  copilot: FactoryAdapter<typeof import("@ai-sdk/harness-github-copilot")>;
  grok: FactoryAdapter<typeof import("@ai-sdk/harness-grok-build")>;
  opencode: FactoryAdapter<typeof import("@ai-sdk/harness-opencode")>;
  pi: FactoryAdapter<typeof import("@ai-sdk/harness-pi")>;
};

// `never` would otherwise silently satisfy the provider parameter.
const discovered: { [Key in keyof Adapters]: [Adapters[Key]] extends [never] ? never : true } = {
  claudeCode: true, cline: true, codex: true, cursor: true, deepagents: true,
  fx: true, copilot: true, grok: true, opencode: true, pi: true,
};
void discovered;
declare const adapters: Adapters;
experimental_createHarnessModel({ harness: adapters.claudeCode });
experimental_createHarnessModel({ harness: adapters.cline });
experimental_createHarnessModel({ harness: adapters.codex });
experimental_createHarnessModel({ harness: adapters.cursor });
experimental_createHarnessModel({ harness: adapters.deepagents });
experimental_createHarnessModel({ harness: adapters.fx });
experimental_createHarnessModel({ harness: adapters.copilot });
experimental_createHarnessModel({ harness: adapters.grok });
experimental_createHarnessModel({ harness: adapters.opencode });
experimental_createHarnessModel({ harness: adapters.pi });

// Widening the built-in schema constraint must not erase the harness contract.
// @ts-expect-error An arbitrary object is not an official harness adapter.
experimental_createHarnessModel({ harness: {} });
// @ts-expect-error Official active/inactive tool filters remain mutually exclusive.
experimental_createHarnessModel({ harness: adapters.pi, activeTools: [], inactiveTools: [] });
