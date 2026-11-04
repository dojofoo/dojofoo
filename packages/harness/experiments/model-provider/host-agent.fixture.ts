import { defineAgent, defineDynamic } from "@dojofoo/harness";
import { experimental_createHarnessModel } from "@dojofoo/harness/adapters";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { scriptedHarness } from "@dojofoo/harness/scripted-harness";

const harness = scriptedHarness;
const sandbox = createJustBashSandbox();
// This fixture stores its history only in the native handle, never in the FS.
export default defineAgent({
  model: defineDynamic(async context => ({
    model: experimental_createHarnessModel({
      harness,
      model: `host:${context.session.id}`,
      sandbox: { ...sandbox, resumeSession: options => sandbox.createSession(options) },
    }, { mode: "full", eveSessionId: context.session.id }).model,
    modelContextWindowTokens: 32_000,
  })),
});
