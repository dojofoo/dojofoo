import { defineSandbox } from "@dojofoo/harness/sandbox";
import { JustBashSandbox } from "@dojofoo/harness/sandbox/just-bash";

// An empty environment: Eve's sandbox never mounts learner files
export const environment = JustBashSandbox.environment({ autoInstall: false });
export default defineSandbox(() => environment.open());
