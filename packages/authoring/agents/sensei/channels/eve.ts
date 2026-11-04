import { httpBasic } from "@dojofoo/harness/channels/auth";
import { defaultEveAuth, eveChannel } from "@dojofoo/harness/channels/eve";
import { senseiHostPort } from "@dojofoo/authoring/sensei/agent";
import { formatKataContext, type SenseiContext } from "@dojofoo/protocol";
import { runtime } from "../runtime.ts";

export default eveChannel({
  auth: async request => {
    const caller = await httpBasic((await runtime()).auth)(request);
    // Only the local host holds this credential, and it checks the agent's info when it starts
    return caller ? { ...caller, allowAgentInfo: true } : caller;
  },
  // Each turn sees the current lesson (a kata's file and latest check, or an interactive slide and answer), never kept in history;
  // a browser-sent clientContext is replaced
  onMessage: async ctx => {
    const port = senseiHostPort(await runtime());
    if (!port || !ctx.eve.sessionId) return { auth: defaultEveAuth(ctx), clientContext: [] };
    const context = await port.call<SenseiContext>("context", ctx.eve.sessionId, {});
    return { auth: defaultEveAuth(ctx), clientContext: [context.kind === "kata" ? formatKataContext(context) : JSON.stringify(context.lesson)] };
  },
});
