import { existsSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";
import {
  CLI,
  readDojoRc,
  writeDojoRc,
  readCatalog,
  readDojoMd,
  resolveAllKatas,
  dojoDir,
  type DojoRc,
  type KataProgress,
  type ResolvedKata,
} from "../config";

function getProgress(rc: DojoRc): KataProgress | undefined {
  return rc.progress?.[rc.currentDojo];
}

function recordKataIntro(rc: DojoRc, kataName: string): void {
  rc.progress ??= {};
  rc.progress[rc.currentDojo] ??= { completed: [], lastActive: null };
  const progress = rc.progress[rc.currentDojo];
  progress.kataIntros ??= [];
  if (!progress.kataIntros.includes(kataName)) {
    progress.kataIntros.push(kataName);
  }
}
import {
  findCurrentKata,
  findNextKata,
  findKataByIdOrName,
  kataState,
  completedCount,
} from "../state";
import { runTests } from "../runner";
import { sensei, prompt, invokeAsk, learnings } from "../format";
import { appendNote, readLearnings } from "../journal";
import { refreshCassette } from "../tracking";
import { queueCourseEvent } from "../telemetry";

const USAGE = `Usage: ${CLI} kata [flags]

Flags:
  (none)              Show SENSEI.md for current kata (smart fallback)
  intro               Show current kata's SENSEI.md briefing
  --start             Scaffold next kata
  --test/--check      Run tests for current kata
  --list              List all katas with state
  --change <name>     Switch to a specific kata + scaffold
  --open              Open kata in editor
  --note "text"       Record a learning observation`;

function recordCompletion(rc: DojoRc, kataName: string): void {
  rc.progress ??= {};
  rc.progress[rc.currentDojo] ??= { completed: [], lastActive: null };
  const progress = rc.progress[rc.currentDojo];
  if (!progress.completed.includes(kataName)) {
    progress.completed.push(kataName);
  }
  progress.lastActive = kataName;
}

export function kata(root: string, args: string[]): void {
  // Check for "intro" subcommand first (before flag parsing)
  // so "npx dojos kata intro --done" works
  const sub = args.find((a) => !a.startsWith("--"));
  if (sub === "intro") {
    kataIntro(root, args);
    return;
  }

  const flag = args.find((a) => a.startsWith("--"));

  if (!flag) {
    smart(root, args);
    return;
  }

  switch (flag) {
    case "--start":
      start(root);
      break;
    case "--check":
    case "--test":
      check(root, args);
      break;
    case "--list":
      list(root);
      break;
    case "--change": {
      const name = args[args.indexOf("--change") + 1];
      if (!name) throw new Error(`Usage: ${CLI} kata --change <name>`);
      change(root, name);
      break;
    }
    case "--note": {
      const text = args[args.indexOf("--note") + 1];
      if (!text) throw new Error(`Usage: ${CLI} kata --note "observation text"`);
      note(root, text);
      break;
    }
    case "--open":
      open(root);
      break;
    case "--help":
    case "-h":
      console.log(USAGE);
      break;
    default:
      throw new Error(`Unknown flag: ${flag}\n\n${USAGE}`);
  }
}

function note(root: string, text: string): void {
  const rc = readDojoRc(root);
  if (!rc.currentDojo) throw new Error("No dojo active.");
  if (!rc.currentKata) throw new Error("No kata in progress.");
  appendNote(root, rc.currentDojo, rc.currentKata, text);
  console.log(`Noted for ${rc.currentKata}.`);
}

function emitLearnings(root: string, dojo: string): void {
  const content = readLearnings(root, dojo);
  if (content) {
    console.log(learnings(content));
  }
}

function kataIntro(root: string, args: string[]): void {
  if (args.includes("--done")) {
    kataIntroDone(root);
    return;
  }

  const rc = readDojoRc(root);
  if (!rc.currentDojo) {
    console.log(`No dojo active. Add one with:\n  ${CLI} add <source>`);
    return;
  }
  if (!rc.currentKata) {
    console.log(`No kata in progress.\n\nrun: ${CLI} kata --start`);
    return;
  }
  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const target = findCurrentKata(katas, rc.currentKata);
  if (!target) {
    console.log(`Kata "${rc.currentKata}" not found.`);
    return;
  }
  if (existsSync(target.senseiPath)) {
    console.log(sensei(readFileSync(target.senseiPath, "utf8")));
  } else {
    console.log(`No SENSEI.md found for ${target.name}.`);
  }
  emitLearnings(root, rc.currentDojo);

  console.log(prompt(`Present the kata briefing to the student using the <dojo:sensei> content above.
Explain the goal, what they'll practice, and any key concepts — in your own words, do NOT paste sensei content verbatim.

Then ${invokeAsk()} to ask the student:
- "Let's code" (Ready to start) → run: ${CLI} kata intro --done
- "Tell me more" (Ask questions first) → answer using the sensei content, then ask again`));
}

function kataIntroDone(root: string): void {
  const rc = readDojoRc(root);
  if (!rc.currentDojo || !rc.currentKata) {
    console.log("No kata in progress.");
    return;
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const target = findCurrentKata(katas, rc.currentKata);

  recordKataIntro(rc, rc.currentKata);
  writeDojoRc(root, rc);

  console.log(`Kata "${rc.currentKata}" introduction complete.`);

  if (target) {
    const workspaceRel = relative(root, target.workspacePath);
    console.log(prompt(`run: ${CLI} kata --open

Do NOT read ${workspaceRel} until the student runs /kata again — let them write the code first.`));
  }
}

function smart(root: string, args: string[]): void {
  const rc = readDojoRc(root);

  // No dojo active → root DOJO.md
  if (!rc.currentDojo) {
    const md = readDojoMd(root, "");
    if (md) {
      console.log(md);
    } else {
      console.log(`No dojo active. Add one with:
  ${CLI} add <source>`);
    }
    return;
  }

  let catalog;
  try {
    catalog = readCatalog(root, rc.currentDojo);
  } catch {
    // No katas → dojo's DOJO.md
    const md = readDojoMd(root, rc.currentDojo);
    if (md) {
      console.log(md);
    } else {
      console.log(`Dojo "${rc.currentDojo}" has no dojo.json or DOJO.md.`);
    }
    return;
  }

  const katas = resolveAllKatas(root, rc, catalog);
  const progress = getProgress(rc);

  // Try query arg (positional, e.g. `npx dojos kata 005`)
  const query = args.find((a) => !a.startsWith("--"));
  const target = query
    ? findKataByIdOrName(katas, query)
    : findCurrentKata(katas, rc.currentKata);

  if (target) {
    // Show SENSEI.md
    if (existsSync(target.senseiPath)) {
      console.log(sensei(readFileSync(target.senseiPath, "utf8")));
    } else {
      console.log(`No SENSEI.md found for ${target.name}.`);
    }
    emitLearnings(root, rc.currentDojo);
    return;
  }

  // No kata active — ask the student what to do
  const next = findNextKata(katas, progress);
  if (next) {
    console.log("No kata in progress.");
    console.log(prompt(`${invokeAsk()} to ask the student:
- "Start next kata" (Begin the next kata in sequence) → run: ${CLI} kata --start
- "Pick a kata" (Browse and choose a specific kata) → run: ${CLI} kata --list`));
  } else {
    // All done → DOJO.md
    const md = readDojoMd(root, rc.currentDojo);
    if (md) console.log(md);
    else console.log("All katas complete. The dojo is finished.");
  }
}

function start(root: string): void {
  const rc = readDojoRc(root);

  if (!rc.currentDojo) {
    console.log(`No dojo active. Add one with:
  ${CLI} add <source>`);
    return;
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const dojoPath = dojoDir(root, rc.currentDojo);
  const progress = getProgress(rc);

  const target = findNextKata(katas, progress);
  if (!target) {
    console.log("All katas are scaffolded. The dojo is complete.");
    return;
  }

  scaffold(root, rc, dojoPath, target);
  queueCourseEvent(root, catalog.name, "started", target.name);
  refreshCassette(root);
}

function check(root: string, args: string[]): void {
  const jsonReporter = args.includes("--reporter=json");
  const rc = readDojoRc(root);

  if (!rc.currentDojo) {
    console.log(`No dojo active. Add one with:
  ${CLI} add <source>`);
    return;
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const dojoPath = dojoDir(root, rc.currentDojo);
  const progress = getProgress(rc);

  const query = args.find((a) => !a.startsWith("--"));
  const target = query
    ? findKataByIdOrName(katas, query)
    : findCurrentKata(katas, rc.currentKata);

  if (!target) {
    const next = findNextKata(katas, progress);
    if (next) {
      console.log("No kata in progress.");
      console.log(prompt(`${invokeAsk()} to ask the student:
- "Start next kata" (Begin the next kata in sequence) → run: ${CLI} kata --start
- "Pick a kata" (Browse and choose a specific kata) → run: ${CLI} kata --list`));
    } else {
      console.log(`All ${katas.length} katas complete. The dojo is finished.`);
    }
    return;
  }

  const result = runTests(target, catalog, dojoPath);
  refreshCassette(root);
  const workspaceRel = relative(root, target.workspacePath);

  if (result.error) {
    if (jsonReporter) {
      console.log(JSON.stringify(result));
      return;
    }
    throw new Error(`${target.name}: error\n\n${result.error}`);
  }

  const lines = result.tests.map(
    (t) => `  [${t.status === "passed" ? "x" : " "}] ${[...t.suite, t.name].join(" > ")}`,
  );

  if (result.passed === result.total && result.total > 0) {
    // Record completion
    recordCompletion(rc, target.name);
    writeDojoRc(root, rc);
    queueCourseEvent(root, catalog.name, "kata_completed", target.name);
    if (completedCount(katas, getProgress(rc)) === katas.length) {
      queueCourseEvent(root, catalog.name, "finished", target.name);
    }

    if (jsonReporter) {
      console.log(JSON.stringify(result));
      return;
    }

    console.log(`${target.name}: ${result.total}/${result.total} — complete!\n\n${lines.join("\n")}`);
    console.log(prompt(`Congratulate the student! All tests are passing. Celebrate their achievement before presenting options.

Then ${invokeAsk()} to ask the student:
- "Review" (Get feedback on idiomatic patterns and potential improvements) → read ${workspaceRel} and run: ${CLI} kata, suggest improvements (Socratic only)
- "Move on" (Wrap up with key insight, then start next kata) → run: ${CLI} kata, follow On Completion (insight + bridge), then run: ${CLI} kata --start
- "Pause" (Take a break, come back anytime) → give a friendly sign-off and remind them to run /kata when ready to continue`));
    return;
  }

  if (jsonReporter) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(`${target.name}: ${result.passed}/${result.total} passing\n\n${lines.join("\n")}`);
  console.log(prompt(`${invokeAsk()} to ask the student:
- "Help me" (Get hints based on failing tests) → run: ${CLI} kata, use the Test Map
- "Keep working" (Continue on your own) → encourage them
- "Pause" (Take a break, come back anytime) → give a friendly sign-off and remind them to run /kata when ready to continue`));
}

function list(root: string): void {
  const rc = readDojoRc(root);

  if (!rc.currentDojo) {
    console.log(`No dojo active. Add one with:
  ${CLI} add <source>`);
    return;
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const progress = getProgress(rc);
  const completed = completedCount(katas, progress);

  console.log(`Katas (${completed}/${katas.length} complete):\n`);
  for (const k of katas) {
    const state = kataState(k, progress);
    const marker = state === "completed" ? "[x]" : state === "ongoing" ? "[~]" : "[ ]";
    const current = k.name === rc.currentKata ? "    (current)" : "";
    console.log(`  ${marker} ${k.name}${current}`);
  }
}

function change(root: string, name: string): void {
  const rc = readDojoRc(root);

  if (!rc.currentDojo) {
    console.log(`No dojo active. Add one with:
  ${CLI} add <source>`);
    return;
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const dojoPath = dojoDir(root, rc.currentDojo);

  const target = findKataByIdOrName(katas, name);
  if (!target) throw new Error(`Kata not found: ${name}`);

  // Already scaffolded? Just switch to it.
  if (existsSync(target.workspacePath)) {
    rc.currentKata = target.name;
    writeDojoRc(root, rc);
    const workspaceRel = relative(root, target.workspacePath);
    console.log(`Switched to ${target.name}.\nWorkspace: ${workspaceRel}`);
    console.log(prompt(`${invokeAsk()} to ask the student:
- "Check progress" → run: ${CLI} kata --check
- "Keep working" → encourage them`));
    return;
  }

  scaffold(root, rc, dojoPath, target);
  queueCourseEvent(root, catalog.name, "started", target.name);
  refreshCassette(root);
}

function open(root: string): void {
  const rc = readDojoRc(root);

  if (!rc.currentKata || !rc.currentDojo) {
    console.log("No kata in progress.");
    return;
  }

  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const target = findCurrentKata(katas, rc.currentKata);

  if (!target) {
    console.log("No kata in progress.");
    return;
  }

  const editor = rc.editor ?? "code";
  const absPath = target.workspacePath;
  console.log(`Opening ${target.name}...`);
  try {
    execSync(`${editor} ${absPath}`, { stdio: "inherit" });
  } catch {
    console.log(`Could not open with "${editor}". File: ${absPath}`);
  }
}

function scaffold(
  root: string,
  rc: DojoRc,
  dojoPath: string,
  target: ResolvedKata,
): void {
  const templateSrc = resolve(dojoPath, target.template);
  if (!existsSync(templateSrc)) {
    throw new Error(`Template not found: ${target.template}`);
  }

  mkdirSync(dirname(target.workspacePath), { recursive: true });
  copyFileSync(templateSrc, target.workspacePath);

  rc.currentKata = target.name;
  writeDojoRc(root, rc);

  const workspaceRel = relative(root, target.workspacePath);
  const absPath = target.workspacePath;

  let plain = `Kata ${target.name} scaffolded.\nWorkspace: ${workspaceRel}`;
  if (rc.editor) {
    plain += `\nOpen command: ${rc.editor} ${absPath}`;
  }
  console.log(plain);

  console.log(prompt(`run: ${CLI} kata intro
Present the kata briefing, then follow the instructions from that command.`));
}
