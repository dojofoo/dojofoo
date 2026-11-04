import { createLifecycleHook } from "@dojofoo/agent/persona";
import { runtime } from "../runtime.ts";

export default createLifecycleHook(async () => (await runtime()).hostPort);
