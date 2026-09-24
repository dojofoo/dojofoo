import { defineAgent } from "@dojofoo/agent";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createPi } from "@ai-sdk/harness-pi";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";

const { model } = experimental_createHarnessModel({
  harness: createPi({ auth: { OPENAI_API_KEY: "fixture-only" } }),
  model: "openai/gpt-4o",
  sandbox: createJustBashSandbox(),
});

// Fixture limit, not a recommended/default limit for the selected model.
export default defineAgent({ model, modelContextWindowTokens: 32_000 });
