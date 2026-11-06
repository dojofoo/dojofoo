import { createLifecycleHook } from "@dojofoo/harness/persona";
import { runtime } from "../runtime.ts";

export default createLifecycleHook(async () => (await runtime()).hostPort);
