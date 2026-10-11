import { expect, it } from "vitest";
import { runAuthoringHandoff } from "./authoring-handoff";

// No inference in ordinary tests. The live test and worker share production code.
it.skipIf(process.env.DOJOFOO_LIVE_HANDOFF !== "1")("authored material drives two isolated production Sensei lessons", async () => {
  process.env.DOJOFOO_EVALUATION_WORKER = "1";
  const evidenceRoot = await runAuthoringHandoff();
  expect(evidenceRoot).toBeTruthy();
}, 1_800_000);
