import { definePlugin } from "nitro";
import { startUiServer } from "../../src/server/startup";

export default definePlugin(() => {
  // A failed backfill must not stop the UI; rows without a kind still use the draft rule.
  try { startUiServer(); }
  catch (error) { console.error(error); }
});
