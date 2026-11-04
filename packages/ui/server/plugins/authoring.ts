import { definePlugin } from "nitro";
import { authoringWatchers } from "../../src/server/authoring-watch";
import { createRequire } from "node:module";

export default definePlugin(app => {
  app.hooks.hook("close", () => {
    const { closePersonaRuntimes } = createRequire(import.meta.url)("@dojofoo/authoring/eve/runtime") as typeof import("@dojofoo/authoring/eve/runtime");
    return closePersonaRuntimes();
  });
  app.hooks.hook("close", () => authoringWatchers.close());
});
