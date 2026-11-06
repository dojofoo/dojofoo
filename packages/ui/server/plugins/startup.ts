import { definePlugin } from "nitro";
import { startUiServer } from "../../src/server/startup";

export default definePlugin(() => {
  // The server lock is its first step, outside any catch: a second server on this DOJOFOO_HOME must not start.
  // The kind backfill inside it logs its own errors.
  void startUiServer();
});
