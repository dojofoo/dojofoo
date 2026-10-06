import { definePlugin } from "nitro";
import { closeAuthoringRuntime } from "../../src/server/authoring";
import { authoringWatchers } from "../../src/server/authoring-watch";

export default definePlugin(app => {
  app.hooks.hook("close", closeAuthoringRuntime);
  app.hooks.hook("close", () => authoringWatchers.close());
});
