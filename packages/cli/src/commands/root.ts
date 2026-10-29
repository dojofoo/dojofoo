import { existsSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import {
  CLI,
  DOJOS_DIR,
  readDojoRc,
  writeDojoRc,
  readDojoMd,
  readCatalog,
  resolveAllKatas,
  listDojos,
  loadConfig,
} from "../config";
import { findCurrentKata, findNextKata, completedCount } from "../state";
import type { KataProgress } from "../config";
import { prompt, invokeAsk } from "../format";

const USAGE = `Usage: ${CLI} [command] [flags]

Commands:
  (none)              Set up this folder if needed, then open the lesson UI
  kata                Kata-level actions (sensei, check, scaffold)
  intro               Show the active dojo's introduction
  status              Show current dojo/kata state
  install [--agent]   Install mise, then set up a project and its agents
  install --skills    Refresh skills for configured or selected agents
  add <source> [--master] Add a learner course or editable master copy
  update <source>     Update an installed dojo from its recorded source
  remove <name>       Remove a dojo
  ui                  Open or control the lesson UI from scripts and agents
  track               Record the active agent session as a cassette
  kyoshi              Author, inspect, scaffold, check, or evaluate a course (--help)

Flags:
  --test/--check      Show overall progress
  --list              List installed dojos
  --open              Print the active DOJO.md
  --change <dojo>     Switch active dojo

UI flags:
  --authoring         Open the current workspace in Kyoshi authoring mode
  --background        Keep the UI daemon running after this command exits
  --no-open           Print the URL without opening a browser
  --name <name>       Set the Portless subdomain (default URL: https://dojo.localhost)
  --tld <tld>         Set the Portless top-level domain
  --no-portless       Use the http://localhost:4567 fallback directly
  --port <port>       Change the direct/fallback port

Agent UI controls:
  ui prompt           Show a structured prompt in the current lesson UI
  ui --skill          Print agent instructions for controlling the UI`;

const UI_FLAGS = ["--authoring", "--background", "--no-open", "--name", "--tld", "--no-portless", "--port", "--skill"];

/**
 * Bare `dojofoo` in a terminal opens the lesson UI, setting the folder up first. Project flags keep their own
 * actions, and without a terminal (scripts, CI, pipes) it prints the help instead of starting a server.
 */
export function bareOpensUi(argv: string[], interactive: boolean): boolean {
  const [command] = argv;
  if (!interactive || (command && !command.startsWith("-"))) return false;
  return argv.every((argument) => !argument.startsWith("--") || UI_FLAGS.includes(argument));
}

export function root(rootDir: string, args: string[]): void {
  const flag = args.find((a) => a.startsWith("--"));

  if (!flag) {
    console.log(USAGE);
    return;
  }

  switch (flag) {
    case "--check":
    case "--test":
      check(rootDir);
      break;
    case "--list":
      list(rootDir);
      break;
    case "--open":
      open(rootDir);
      break;
    case "--change": {
      const name = args[args.indexOf("--change") + 1];
      if (!name) throw new Error(`Usage: ${CLI} --change <dojo>`);
      change(rootDir, name);
      break;
    }
    case "--help":
    case "-h":
      console.log(USAGE);
      break;
    default:
      if (UI_FLAGS.includes(flag)) {
        console.log(USAGE);
        break;
      }
      throw new Error(`Unknown flag: ${flag}\n\n${USAGE}`);
  }
}

function check(root: string): void {
  const rc = readDojoRc(root);

  if (!rc.currentDojo) {
    console.log(`No dojo active. Add one with:
  ${CLI} add <source>`);
    return;
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const progress = rc.progress?.[rc.currentDojo];
  const current = findCurrentKata(katas, rc.currentKata);
  const completed = completedCount(katas, progress);
  const total = katas.length;

  if (!current) {
    const next = findNextKata(katas, progress);
    if (next) {
      console.log(`${completed}/${total} katas complete. No kata in progress.`);
      console.log(prompt(`${invokeAsk()} to ask the student:
- "Start next kata" (Begin the next kata in sequence) → run: ${CLI} kata --start
- "Pick a kata" (Browse and choose a specific kata) → run: ${CLI} kata --list`));
    } else {
      console.log(`All ${total} katas complete. The dojo is finished.`);
    }
    return;
  }

  const workspaceRel = relative(root, current.workspacePath);

  console.log(`Kata: ${current.name} (in progress)\n${completed}/${total} complete | Workspace: ${workspaceRel}`);
  console.log(prompt(`${invokeAsk()} to ask the student:
- "Check progress" → run: ${CLI} kata --check
- "Keep working" → encourage them
- "Switch kata" → run: ${CLI} kata --list`));
}

function list(root: string): void {
  const rc = readDojoRc(root);
  const dojos = listDojos(root);

  if (dojos.length === 0) {
    console.log(`No dojos installed. Add one with:
  ${CLI} add <source>`);
    return;
  }

  console.log("Dojos:\n");
  for (const name of dojos) {
    const marker = name === rc.currentDojo ? "[*]" : "[ ]";
    console.log(`  ${marker} ${name}`);
  }
}

function open(root: string): void {
  const rc = readDojoRc(root);
  const md = readDojoMd(root, rc.currentDojo);
  if (md) {
    console.log(md);
  } else {
    console.log(`No DOJO.md found. Run \`${CLI} install\` first.`);
  }
}

function change(root: string, name: string): void {
  const dojos = listDojos(root);
  if (!dojos.includes(name)) {
    throw new Error(`Dojo "${name}" not found. Available: ${dojos.join(", ") || "(none)"}`);
  }

  const rc = readDojoRc(root);
  rc.currentDojo = name;
  rc.currentKata = null;
  writeDojoRc(root, rc);

  const dojoTsconfigPath = resolve(root, DOJOS_DIR, name, "tsconfig.json");
  if (existsSync(dojoTsconfigPath)) {
    const config = loadConfig(root);
    const katasInclude = `${relative(root, config.katasPath)}/**/*.ts`;
    const tsconfigPath = resolve(root, "tsconfig.json");
    const extendsPath = `./${relative(root, dojoTsconfigPath)}`;
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          extends: extendsPath,
          compilerOptions: { noEmit: true },
          include: [katasInclude],
        },
        null,
        2,
      ) + "\n",
    );
  }

  console.log(`Switched to dojo "${name}".`);
}
