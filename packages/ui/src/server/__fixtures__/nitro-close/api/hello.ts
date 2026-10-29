import { createRequire } from "node:module";

export default async () => {
  const root = process.env.DOJO_NITRO_RUNTIME_ROOT;
  if (!root) return "hello";
  // Acquire outside the route's module graph, exactly as the UI does. Launch
  // the packaged server through its owner; no model turn.
  const load = createRequire(import.meta.url);
  const { acquireKyoshiRuntime } = load("@dojofoo/authoring/eve/runtime");
  const runtime = await acquireKyoshiRuntime(root);
  const { url } = await runtime.start();
  return { message: "hello", url };
};
