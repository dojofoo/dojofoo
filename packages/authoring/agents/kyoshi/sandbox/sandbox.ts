import { defineSandbox } from "@dojofoo/agent/sandbox";
import { createAuthoringSandbox } from "@dojofoo/authoring/sandbox";
import { runtime } from "../runtime.ts";

export const environment = createAuthoringSandbox(async () => (await runtime()).courseRoot);
export default defineSandbox(() => environment.open());
