import { httpBasic } from "@dojofoo/agent/channels/auth";
import { eveChannel } from "@dojofoo/agent/channels/eve";
import { runtime } from "../runtime.ts";

export default eveChannel({
  auth: async request => {
    const caller = await httpBasic((await runtime()).auth)(request);
    // Only the local host holds this credential, and it checks the agent's info when it starts
    return caller ? { ...caller, allowAgentInfo: true } : caller;
  },
});
