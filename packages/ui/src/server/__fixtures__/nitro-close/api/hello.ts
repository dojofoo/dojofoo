import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

export default async () => {
  const root = process.env.DOJO_NITRO_RUNTIME_ROOT;
  if (!root) return "hello";
  // Acquire outside the route's module graph, exactly as the UI does. Launch
  // only a local Node process through its owner; no model or credentials.
  const load = createRequire(import.meta.url);
  const { acquireKyoshiRuntime } = load("@dojofoo/authoring/eve/runtime");
  const runtime = await acquireKyoshiRuntime(root);
  await runtime.start();
  const settings = JSON.parse(await readFile(join(root, ".dojo/kyoshi-app/agents/kyoshi/runtime.json"), "utf8"));
  const { requestLocalProcessHost } = load("@dojofoo/agent/experimental/local");
  const host = await requestLocalProcessHost(settings.connection);
  const child = await host.spawn({ command: `exec ${JSON.stringify(process.execPath)} -e 'setInterval(() => {}, 1000)'` });
  return { message: "hello", pid: child.pid };
};
