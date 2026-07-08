import { findProjectRoot } from "./config";
import { root } from "./commands/root";
import { kata } from "./commands/kata";
import { intro } from "./commands/intro";
import { setup } from "./commands/setup";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { status } from "./commands/status";
import { ui } from "./commands/ui";
import { track } from "./commands/track";

const [command, ...args] = process.argv.slice(2);

process.env.DOJO_PROJECT_ROOT ??= findProjectRoot();

async function main() {
  if (command === "kata") {
    kata(findProjectRoot(), args);
  } else if (command === "intro") {
    intro(findProjectRoot(), args);
  } else if (command === "setup") {
    setup(process.cwd(), args);
  } else if (command === "add") {
    await add(process.cwd(), args);
  } else if (command === "remove") {
    remove(findProjectRoot(), args);
  } else if (command === "status") {
    status(findProjectRoot(), args);
  } else if (command === "ui") {
    process.env.PORT ??= process.env.DOJO_UI_PORT ?? "4567";
    ui(process.cwd(), args);
  } else if (command === "track") {
    track(findProjectRoot(), args);
  } else {
    // Everything else is root-level flags
    root(process.cwd(), [command, ...args].filter(Boolean));
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
