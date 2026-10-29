import { dojoDir, findManifestPath, findProjectRoot, hasWorkspaceConfiguration, readDojoRc } from "./config";
import { observeLocalContext, sessionFromEnvironment } from "@dojofoo/config/local-state";
import { prepareWorkspace } from "@dojofoo/config/project-preparation";
import { bareOpensUi, root } from "./commands/root";
import { kata } from "./commands/kata";
import { intro } from "./commands/intro";
import { configuredAgents, setup } from "./commands/setup";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { status } from "./commands/status";
import { resolveAuthoringRoot, ui } from "./commands/ui";
import { track } from "./commands/track";
import { update } from "./commands/update";
import { kyoshi } from "./commands/kyoshi";
import { flushCourseEvents } from "./telemetry";
import { bootstrapMise } from "./mise-bootstrap";
import { miseConfigPath } from "@dojofoo/config/project-preparation";
import { resolveRuntimeHarness } from "@dojofoo/config/runtime";

const argv = process.argv.slice(2);
const [command, ...args] = argv;
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI;
// `ui` stays as the explicit form that scripts and agents call; bare `dojofoo` opens the UI only in a terminal.
const opensUi = command === "ui" || bareOpensUi(argv, interactive);
const uiArgs = command === "ui" ? args : argv;

process.env.DOJO_PROJECT_ROOT ??= opensUi && uiArgs.includes("--authoring")
  ? resolveAuthoringRoot(process.cwd(), findProjectRoot()) : findProjectRoot();

async function main() {
  const projectRoot = process.env.DOJO_PROJECT_ROOT!;
  const isUiControlCommand = opensUi && ["prompt", "--skill"].includes(uiArgs[0] ?? "");
  const isSetupCommand = command === "install" || command === "setup" || command === "add";
  const needsPreparation = command === "kata" || (opensUi && !isUiControlCommand);
  // A folder that isn't a workspace or course yet gets the install wizard before its UI opens.
  if (opensUi && command !== "ui" && !isUiControlCommand
    && !hasWorkspaceConfiguration(projectRoot) && !findManifestPath(projectRoot)) {
    await install([]);
  }
  if (
    !process.env.DOJO_SKIP_PREPARE
    && needsPreparation
  ) {
    await prepareWorkspace(projectRoot);
  }
  if (!(isUiControlCommand || isSetupCommand)) {
    observeLocalContext(projectRoot, {
      session: sessionFromEnvironment(),
    });
  }
  if (command === "kata") {
    kata(findProjectRoot(), args);
  } else if (command === "intro") {
    intro(findProjectRoot(), args);
  } else if (command === "install" || command === "setup") {
    await install(args);
  } else if (command === "add") {
    await add(process.cwd(), args);
    const root = findProjectRoot();
    const active = readDojoRc(root).currentDojo;
    if (active && miseConfigPath(dojoDir(root, active))) {
      await bootstrapMise();
      await prepareWorkspace(root);
    }
  } else if (command === "remove") {
    remove(findProjectRoot(), args);
  } else if (command === "update") {
    await update(findProjectRoot(), args);
  } else if (command === "status") {
    status(findProjectRoot(), args);
  } else if (opensUi) {
    process.env.PORT ??= process.env.DOJO_UI_PORT ?? "4567";
    await ui(projectRoot, uiArgs);
  } else if (command === "track") {
    track(findProjectRoot(), args);
  } else if (command === "kyoshi") {
    await kyoshi(process.cwd(), args);
  } else {
    // Everything else is root-level flags
    root(process.cwd(), [command, ...args].filter(Boolean));
  }
  if (!isUiControlCommand) await flushCourseEvents();
}

async function install(installArgs: string[]): Promise<void> {
  if (!installArgs.includes("--skills")) await bootstrapMise();
  await setup(process.cwd(), installArgs);
  if (installArgs.includes("--skills")) return;
  const { prepareAuthoringHarness } = await import("@dojofoo/authoring/eve/install");
  const selected = new Set([
    ...configuredAgents(process.cwd()),
    resolveRuntimeHarness("authoring", process.cwd()),
    resolveRuntimeHarness("lesson", process.cwd()),
  ]);
  for (const agent of selected) {
    if (agent !== "codex" && agent !== "opencode" && agent !== "pi"
      && agent !== "cursor" && agent !== "grok" && agent !== "fx") continue;
    console.log(`Preparing ${agent} for the course UI…`);
    await prepareAuthoringHarness(agent);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
