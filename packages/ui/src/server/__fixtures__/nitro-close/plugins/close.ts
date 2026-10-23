import { appendFileSync } from "node:fs";
import { definePlugin } from "nitro";
import authoringPlugin from "../../../../../server/plugins/authoring";

export default definePlugin(app => {
  if (process.env.DOJO_NITRO_RUNTIME_ROOT) authoringPlugin(app);
  app.hooks.hook("close", async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    appendFileSync(process.env.DOJO_NITRO_CLOSE_LOG!, "runtime:close\n");
  });
});
