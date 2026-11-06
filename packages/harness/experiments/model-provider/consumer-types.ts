import type { HarnessAgentAdapter } from "@ai-sdk/harness/agent";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { experimental_createHarnessModel, createLocalHarnessSandbox, createLocalSandbox } from "@dojofoo/harness/adapters";
import { defineAgent } from "@dojofoo/harness";
import { createDevelopmentServer } from "@dojofoo/harness/server";

// Compile against the packed public declarations, not workspace source aliases.
declare const harness: HarnessAgentAdapter;
const sandboxSession = await createJustBashSandbox().createSession();
const { model } = experimental_createHarnessModel({ harness }, { sandboxSession });
experimental_createHarnessModel({ harness }, { mode: "read-only", agent: "codex" });
defineAgent({ model, modelContextWindowTokens: 32_000 });
declare const courseDirectory: string;
const server = createDevelopmentServer(courseDirectory, { host: "127.0.0.1", port: 0 });
void server.start;
void server.close;
const localSession = await createLocalSandbox(courseDirectory);
experimental_createHarnessModel({ harness }, { sandboxSession: localSession });
await localSession.stop();
experimental_createHarnessModel({ harness, sandbox: createLocalHarnessSandbox(courseDirectory, { environment: { CI: "1" } }) });
experimental_createHarnessModel({
  harness,
  prepareCall: input => ({ ...input, model: "selected-model", instructions: "Teach carefully." }),
  sandbox: createJustBashSandbox(),
  skills: [{
    name: "author-course",
    description: "Guide course authoring",
    content: "Ask the author about their intended audience.",
    files: [{ path: "references/katas.md", content: "Practice one concept." }],
  }],
});
