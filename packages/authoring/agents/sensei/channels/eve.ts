import { httpBasic } from "@dojofoo/agent/channels/auth";
import { defaultEveAuth, eveChannel } from "@dojofoo/agent/channels/eve";
import { senseiHostPort } from "@dojofoo/authoring/sensei/agent";
import type { InteractiveContext } from "@dojofoo/protocol";
import { runtime } from "../runtime.ts";

export default eveChannel({
  auth: async request => {
    const caller = await httpBasic((await runtime()).auth)(request);
    // Only the local host holds this credential, and it checks the agent's info when it starts
    return caller ? { ...caller, allowAgentInfo: true } : caller;
  },
  // Each turn sees the current slide and answer, never kept in history; a browser-sent clientContext is replaced
  onMessage: async ctx => {
    const port = senseiHostPort(await runtime());
    if (!port || !ctx.eve.sessionId) return { auth: defaultEveAuth(ctx), clientContext: [] };
    const { lesson } = await port.call<InteractiveContext>("context", ctx.eve.sessionId, {});
    return { auth: defaultEveAuth(ctx), clientContext: [JSON.stringify(lesson)] };
  },
});
