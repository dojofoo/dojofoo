import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGrokBuild } from "@ai-sdk/harness-grok-build";
import { createFx } from "@ai-sdk/harness-fx";
import { createCodex } from "@ai-sdk/harness-codex";
import { createOpenCode } from "@ai-sdk/harness-opencode";
import { createPi } from "@ai-sdk/harness-pi";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { expect, it } from "vitest";
import { authoringEnvironment } from "./environment";
// Real native ACP agents, with only model inference replaced by a local fixture.
// @ts-expect-error Shared JavaScript inference fixture has no declarations.
import { startLoopbackModel } from "../../../agent/experiments/model-provider/loopback-openai.mjs";

it.skipIf(process.env.DOJO_HARNESS_LIFECYCLE !== "1").each(["grok", "fx", "codex", "opencode", "pi"] as const)("%s recovers conversation history and cancels an active native turn", async harness => {
  const root = await realpath(await mkdtemp(join(tmpdir(), `dojo-${harness}-recovery-`)));
  const home = join(root, "home");
  await mkdir(home);
  if (harness === "codex") await mkdir(join(home, ".codex"));
  const endpoint = await startLoopbackModel();
  if (harness === "grok") {
    await mkdir(join(home, ".grok"));
    // Native custom-model configuration avoids relying on a remote catalog or
    // whichever built-in model names ship with the installed CLI version.
    await writeFile(join(home, ".grok/config.toml"), [
      '[models]', 'default = "fixture-first"',
      ...["first", "second"].flatMap(name => [
        `[model.fixture-${name}]`, `model = "fixture-${name}"`,
        `base_url = "${endpoint.baseURL}"`, `name = "Fixture ${name}"`,
        'api_backend = "chat_completions"', 'env_key = "XAI_API_KEY"',
      ]),
    ].join("\n"));
  }
  const sandbox = await createLocalSandbox(root, { environment: await authoringEnvironment(harness, {
    PATH: `${fileURLToPath(new URL("../../node_modules/.bin", import.meta.url))}:${process.env.PATH}`,
    HOME: home, CI: "1", GROK_HOME: join(home, ".grok"), CODEX_HOME: join(home, ".codex"),
    ...(harness === "fx" ? {
      // FX's native loopback-only overrides; its CLI does not consume the
      // adapter's generic AI_GATEWAY_BASE_URL for these requests.
      FX_GATEWAY_BASE_URL: endpoint.baseURL.replace(/\/v1$/, ""),
      FX_GATEWAY_CHAT_URL: `${endpoint.baseURL.replace(/\/v1$/, "")}/v4/ai/language-model`,
      FX_DISABLE_KEYCHAIN: "1", FX_E2E_DISABLE_DOTENV: "1", FX_AUTO_UPGRADE: "0",
    } : {}),
  }) });
  const adapters = {
    fx: createFx({ port: 0, auth: {
      AI_GATEWAY_API_KEY: "fixture-only", AI_GATEWAY_BASE_URL: endpoint.baseURL.replace(/\/v1$/, ""),
    } }),
    grok: createGrokBuild({ port: 0, auth: {
      XAI_API_KEY: "fixture-only", GROK_XAI_API_BASE_URL: endpoint.baseURL,
      GROK_MODELS_BASE_URL: endpoint.baseURL,
    } }),
    codex: createCodex({ port: 0, auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL } }),
    opencode: createOpenCode({ port: 0, auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL },
      provider: "openai", openCodeConfig: { small_model: "openai/gpt-4o", enabled_providers: ["openai"] } }),
    pi: createPi({ auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL } }),
  };
  const agent = new HarnessAgent({
    harness: adapters[harness],
    ...(["opencode", "pi"].includes(harness) ? { model: "openai/gpt-4o" } : {}),
    sandboxConfig: { workDir: "course" },
  });
  try {
    const session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(60_000) });
    const first = await agent.generate({ session, prompt: "Introduce the lesson.", abortSignal: AbortSignal.timeout(45_000) });
    expect(first.text).toBe("Ready to teach.");
    const checkpoint = await session.stop();
    const resumed = await agent.createSession({ sandboxSession: sandbox, sessionId: session.sessionId,
      resumeFrom: JSON.parse(JSON.stringify(checkpoint)), abortSignal: AbortSignal.timeout(60_000) });
    const second = await agent.generate({ session: resumed, prompt: "Continue the lesson.", abortSignal: AbortSignal.timeout(45_000) });
    expect(second.text).toBe("Ready to teach.");
    expect(resumed.sessionId).toBe(session.sessionId);
    expect(JSON.stringify(endpoint.requests.at(-1))).toContain("Introduce the lesson.");
    expect(JSON.stringify(endpoint.requests.at(-1))).toContain("Continue the lesson.");
    {
      // A fresh public HarnessAgent configuration, as Eve's dynamic resolver
      // creates between turns. The existing session remains authoritative.
      const models = {
        codex: { selection: "gpt-5.4", wire: "gpt-5.4" },
        fx: { selection: "openai/gpt-5.5", wire: "openai/gpt-5.5" },
        grok: { selection: "fixture-second", wire: "fixture-second" },
        opencode: { selection: "openai/gpt-4.1", wire: "gpt-4.1" },
        pi: { selection: "openai/gpt-4.1", wire: "gpt-4.1" },
      };
      const switchedAgent = new HarnessAgent({ harness: adapters[harness],
        model: models[harness].selection, sandboxConfig: { workDir: "course" } });
      const previousModel = endpoint.requestedModels.at(-1);
      const switched = await switchedAgent.generate({ session: resumed,
        prompt: "Continue with the newly selected model.", abortSignal: AbortSignal.timeout(45_000) });
      expect(switched.text).toBe("Ready to teach.");
      const request = endpoint.requests.at(-1);
      expect(endpoint.requestedModels.at(-1)).toBe(models[harness].wire);
      expect(endpoint.requestedModels.at(-1)).not.toBe(previousModel);
      expect(JSON.stringify(request)).toContain("Introduce the lesson.");
      expect(JSON.stringify(request)).toContain("Continue the lesson.");
      expect(JSON.stringify(request)).toContain("Continue with the newly selected model.");
      expect(resumed.sessionId).toBe(session.sessionId);
    }
    if (harness === "opencode") {
      await expect(resumed.compact("Custom summary instructions")).rejects.toMatchObject({
        name: "AI_HarnessCapabilityUnsupportedError",
        message: expect.stringContaining("does not expose custom compaction instructions"),
      });
      const beforeCompaction = endpoint.requests.length;
      await resumed.compact();
      expect(endpoint.requests.length).toBeGreaterThan(beforeCompaction);
      const continued = await agent.generate({ session: resumed, prompt: "Continue after native compaction.",
        abortSignal: AbortSignal.timeout(45_000) });
      expect(continued.text).toBe("Ready to teach.");
      expect(resumed.sessionId).toBe(session.sessionId);
      expect(JSON.stringify(endpoint.requests.at(-1))).toContain("Continue after native compaction.");
    } else if (harness !== "pi") {
      await expect(resumed.compact()).rejects.toMatchObject({
        name: "AI_HarnessCapabilityUnsupportedError",
        message: expect.stringMatching(/does not support manual compaction|ACP v1 does not define manual session compaction/),
      });
    }
    const held = endpoint.holdNextResponse((request: unknown) => JSON.stringify(request).includes("Wait for the model before answering."));
    const cancellation = new AbortController();
    const pending = agent.generate({ session: resumed, prompt: "Wait for the model before answering.",
      abortSignal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(30_000)]) });
    const outcome = pending.then(() => undefined, error => error);
    try {
      await Promise.race([held.started, outcome.then(() => { throw new Error("Turn finished before cancellation"); })]);
      cancellation.abort(new Error("Cancelled by the author"));
      const failure = await outcome;
      expect(failure).toBeInstanceOf(Error);
      expect(failure.name).not.toBe("TimeoutError");
      expect(failure.message).toMatch(/aborted|Cancelled by the author/i);
    } finally { held.release(); }
    await resumed.stop();
  } catch (error) {
    throw new Error(`${harness} recovery failed; loopback requests: ${JSON.stringify(endpoint.paths)}`, { cause: error });
  } finally {
    await sandbox.stop();
    await endpoint.close();
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}, 180_000);
