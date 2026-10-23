import { appendFileSync } from "node:fs";
import { definePlugin } from "nitro";

export default definePlugin(app => {
  app.hooks.hook("close", () => {
    appendFileSync(process.env.DOJO_NITRO_CLOSE_LOG!, "runtime:close\n");
  });
});
