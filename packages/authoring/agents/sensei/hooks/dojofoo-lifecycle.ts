import { createLifecycleHook } from "@dojofoo/agent/lifecycle";
import { runtime } from "../runtime.ts";

export default createLifecycleHook(async () => (await runtime()).hostPort);
