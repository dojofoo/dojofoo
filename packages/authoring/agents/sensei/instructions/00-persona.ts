import { defineInstructions } from "@dojofoo/harness/instructions";
import { senseiPersonaInstructions } from "@dojofoo/authoring/sensei/instructions";
import { contract } from "../contracts.ts";

export default defineInstructions({ content: `${senseiPersonaInstructions(contract)}\n` });
