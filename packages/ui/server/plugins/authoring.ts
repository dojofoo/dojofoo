import { definePlugin } from "nitro";
import { authoringWatchers } from "../../src/server/authoring-watch";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { localStateDirectory } from "@dojofoo/config/local-state";
import { releaseServerLock } from "../../src/server/server-lock";

export default definePlugin(app => {
  app.hooks.hook("close", async () => {
    const { closePersonaRuntimes } = createRequire(import.meta.url)("@dojofoo/authoring/eve/runtime") as typeof import("@dojofoo/authoring/eve/runtime");
    await closePersonaRuntimes();
    // After the persona hosts, so the next server finds no host of this one running
    releaseServerLock(dirname(localStateDirectory()));
  });
  app.hooks.hook("close", () => authoringWatchers.close());
});
