import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createServer, createServerModuleRunnerTransport } from "vite";
import { ModuleRunner } from "vite/module-runner";

it("loads authoring services and instructions in Vite's server module runner", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    ssr: { noExternal: ["@dojofoo/config"] },
  });
  const runner = new ModuleRunner({
    transport: createServerModuleRunnerTransport({ channel: server.environments.ssr.hot }),
    hmr: false,
  });
  try {
    const service = await runner.import("/src/server/service.ts");
    expect(service).toBeDefined();
    const { default: instructions } = await runner.import("/src/eve/instructions.ts");
    const contract = readFileSync(new URL("./contracts/KYOSHI.md", import.meta.url), "utf8");
    expect(instructions.content).toContain(contract);
  } finally {
    await runner.close();
    await server.close();
  }
}, 30_000);
