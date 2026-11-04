import { defineInstructions } from "@dojofoo/agent/instructions";
import { senseiPersonaInstructions } from "@dojofoo/authoring/sensei/instructions";
import { contract } from "../contracts.ts";

export default defineInstructions({ content: `${senseiPersonaInstructions(contract)}\n` });
