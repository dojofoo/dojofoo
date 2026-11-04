import { defineSandbox } from "@dojofoo/agent/sandbox";
import { JustBashSandbox } from "@dojofoo/agent/sandbox/just-bash";

// An empty environment: Eve's sandbox never mounts learner files
export const environment = JustBashSandbox.environment({ autoInstall: false });
export default defineSandbox(() => environment.open());
