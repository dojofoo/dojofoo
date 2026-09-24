import { definePlugin } from "nitro";
import { closeAuthoringRuntime } from "../../src/server/authoring";

export default definePlugin(app => {
  app.hooks.hook("close", closeAuthoringRuntime);
});
