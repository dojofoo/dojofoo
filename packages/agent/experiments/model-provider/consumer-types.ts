import type { HarnessAgentAdapter } from "@ai-sdk/harness/agent";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { defineAgent } from "@dojofoo/agent";
import { createDevelopmentServer } from "@dojofoo/agent/server";
import { createLocalSandbox, registerLocalProcessHost, requestLocalProcessHost } from "@dojofoo/agent/experimental/local";

// Compile against the packed public declarations, not workspace source aliases.
declare const harness: HarnessAgentAdapter;
const sandboxSession = await createJustBashSandbox().createSession();
const { model } = experimental_createHarnessModel({ harness }, { sandboxSession });
defineAgent({ model, modelContextWindowTokens: 32_000 });
declare const courseDirectory: string;
const server = createDevelopmentServer(courseDirectory, { host: "127.0.0.1", port: 0 });
void server.start;
void server.close;
const coordinator = registerLocalProcessHost(await createLocalSandbox(courseDirectory));
const processHost = await requestLocalProcessHost(coordinator.connection);
const localSession = await createLocalSandbox(courseDirectory, { processHost });
experimental_createHarnessModel({ harness }, { sandboxSession: localSession });
await coordinator.close();
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
