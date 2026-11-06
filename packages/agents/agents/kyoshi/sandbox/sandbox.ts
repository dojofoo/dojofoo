import { defineSandbox } from "@dojofoo/harness/sandbox";
import { createAuthoringSandbox } from "@dojofoo/agents/sandbox";
import { runtime } from "../runtime.ts";

export const environment = createAuthoringSandbox(async () => (await runtime()).courseRoot);
export default defineSandbox(() => environment.open());
