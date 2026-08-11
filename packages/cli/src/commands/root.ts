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

const USAGE = `Usage: ${CLI} <command> [flags]

Commands:
  (none)              Project-level actions (use flags below)
  kata                Kata-level actions (sensei, check, scaffold)
  intro               Show the active dojo's introduction
  status              Show current dojo/kata state
  install [--agent]   Set up a new dojo project and configure agents
  add <source>        Add a dojo (training pack)
  remove <name>       Remove a dojo
  ui [--background]   Start the dojo lesson web UI (default: https://dojo.localhost)
  track               Record the active agent session as a cassette

Flags:
  --test/--check      Show overall progress
  --list              List installed dojos
  --open              Print the active DOJO.md
  --change <dojo>     Switch active dojo`;

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
