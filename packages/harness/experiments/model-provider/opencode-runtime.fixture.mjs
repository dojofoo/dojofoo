import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenCode } from "@ai-sdk/harness-opencode";
import { createLocalSandbox } from "@dojofoo/harness/adapters";

export async function createRuntime(root, baseURL) {
  const home = join(root, "home");
  const pnpmBin = fileURLToPath(new URL("./node_modules/.bin", import.meta.url));
  const sandboxSession = await createLocalSandbox(root, { environment: {
    PATH: `${pnpmBin}:${process.env.PATH}`, HOME: home,
    XDG_CONFIG_HOME: join(home, "config"), XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"), CI: "1",
  } });
  return { sandboxSession, runtime: {
    sandboxConfig: { workDir: "course" },
    model: "openai/fixture-first", harness: createOpenCode({
      auth: { AI_GATEWAY_API_KEY: "fixture-only", AI_GATEWAY_BASE_URL: baseURL },
      openCodeConfig: { small_model: "openai/fixture-first", enabled_providers: ["openai"] },
      provider: "openai", port: 0, startupTimeoutMs: 30000,
    }),
  } };
}
