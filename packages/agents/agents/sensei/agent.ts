import { createSenseiAgent } from "@dojofoo/agents/sensei/agent";
import { runtime, usageCeiling } from "./runtime.ts";

export default createSenseiAgent(runtime, usageCeiling);
