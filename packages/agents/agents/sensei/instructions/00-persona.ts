import { defineInstructions } from "@dojofoo/harness/instructions";
import { senseiPersonaInstructions } from "@dojofoo/agents/sensei/instructions";
import { contract } from "../contracts.ts";

export default defineInstructions({ content: `${senseiPersonaInstructions(contract)}\n` });
