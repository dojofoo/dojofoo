import type { ReadContract } from "@dojofoo/agents/sensei/instructions";
import platform from "../../src/sensei/contracts/DOJOFOO.md?raw";
import interactive from "../../src/sensei/contracts/INTERACTIVE.md?raw";
import katas from "../../src/sensei/contracts/KATAS.md?raw";
import native from "../../src/sensei/contracts/NATIVE.md?raw";

// Embedded at build time: the prepared server cannot resolve @dojofoo/agents's files at run time
const contracts = { "DOJOFOO.md": platform, "NATIVE.md": native, "KATAS.md": katas, "INTERACTIVE.md": interactive };
export const contract: ReadContract = name => contracts[name];
