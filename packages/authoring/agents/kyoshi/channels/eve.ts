import { httpBasic } from "@dojofoo/agent/channels/auth";
import { eveChannel } from "@dojofoo/agent/channels/eve";
import { runtime } from "../runtime.ts";

export default eveChannel({
  auth: async request => httpBasic((await runtime()).auth)(request),
});
