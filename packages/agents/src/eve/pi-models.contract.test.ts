import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { piModels } from "./models";

it("reads Pi 1.x native model configuration offline without exposing or changing credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dojo-pi-models-"));
  const auth = JSON.stringify({ fixture: { type: "api_key", key: "fixture-only" } });
  const models = JSON.stringify({ providers: { fixture: {
    baseUrl: "http://127.0.0.1:1/v1", api: "openai-completions", apiKey: "fixture-only",
    models: [{ id: "offline", name: "Offline fixture", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 512 }],
  } } });
  const fetch = vi.fn(() => { throw new Error("Model discovery must remain offline"); });
  vi.stubGlobal("fetch", fetch);
  try {
    await writeFile(join(directory, "auth.json"), auth);
    await writeFile(join(directory, "models.json"), models);
    const choices = await piModels(AbortSignal.timeout(5000), directory);
    expect(choices).toContainEqual({ id: "fixture/offline", name: "Offline fixture", efforts: ["off"] });
    expect(JSON.stringify(choices)).not.toContain("fixture-only");
    expect(fetch).not.toHaveBeenCalled();
    expect(await readFile(join(directory, "auth.json"), "utf8")).toBe(auth);
    expect(await readFile(join(directory, "models.json"), "utf8")).toBe(models);
  } finally {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  }
});
