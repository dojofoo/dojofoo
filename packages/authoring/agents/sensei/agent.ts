import { createSenseiAgent } from "@dojofoo/authoring/sensei/agent";
import { runtime, usageCeiling } from "./runtime.ts";

export default createSenseiAgent(runtime, usageCeiling);
