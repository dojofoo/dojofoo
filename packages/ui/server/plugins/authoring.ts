import { definePlugin } from "nitro";
import { closeAuthoringRuntime } from "../../src/server/authoring";
import { authoringWatchers } from "../../src/server/authoring-watch";
import { createRequire } from "node:module";

export default definePlugin(app => {
  app.hooks.hook("close", () => {
    const { closeKyoshiRuntimes } = createRequire(import.meta.url)("@dojofoo/authoring/eve/runtime") as typeof import("@dojofoo/authoring/eve/runtime");
    return closeKyoshiRuntimes();
  });
  app.hooks.hook("close", closeAuthoringRuntime);
  app.hooks.hook("close", () => authoringWatchers.close());
});
