import { scaffoldAuthoringWorkspace, type AuthoringStyle } from "@dojofoo/authoring/scaffold";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import { ui } from "./ui";
import { execFileSync } from "node:child_process";
import { createAuthoringLesson, readAuthoringDraft } from "@dojofoo/authoring/service";
import { readEvaluationSettings } from "@dojofoo/authoring/evaluation/settings";
import { bootstrapMise } from "../mise-bootstrap";

export type TeachingStyle = AuthoringStyle;

export async function kyoshi(root: string, args: string[]): Promise<void> {
  const [action, ...rest] = args;
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`Usage: dojofoo kyoshi [command]\n\n  (none)                 Create or open authoring\n  inspect                Show course files, lessons, and readiness\n  lesson <title>         Add one lesson scaffold\n  setup                  Install the course's pinned tools and dependencies via mise\n  check                  Run the course's mise check task\n`);
    return;
  }
  if (action === "inspect") {
    process.stdout.write(`${JSON.stringify({ ...readAuthoringDraft(root), evaluation: await readEvaluationSettings(root) })}\n`);
    return;
  }
  if (action === "lesson") {
    if (!rest.length || rest.some(value => value.startsWith("-"))) throw new Error("Usage: dojofoo kyoshi lesson <title>");
    process.stdout.write(`${JSON.stringify({ lessonId: createAuthoringLesson(root, rest.join(" ")) })}\n`);
    return;
  }
  if (action === "setup" || action === "check") {
    const mise = await bootstrapMise();
    execFileSync(mise, ["run", action], { cwd: root, stdio: "inherit" });
    return;
  }
  if (action && !action.startsWith("-")) throw new Error(`Unknown Kyoshi command: ${action}. Use inspect, lesson, setup, check, or no subcommand to open authoring.`);
  const style = await selectTeachingStyle(valueAfter(args, "--style"));
  scaffoldAuthoringWorkspace({
    root,
    style,
    name: valueAfter(args, "--name") ?? basename(resolve(root)),
  });
  observeWorkspacePath(root, { kind: "draft" });
  process.stdout.write(`Kyoshi workspace ready in ${resolve(root)}\n`);
  await ui(root, ["--authoring", ...forwardedUiArgs(args)]);
}

async function selectTeachingStyle(requested?: string): Promise<TeachingStyle> {
  if (requested) {
    if (requested !== "katas") throw new Error(`Unsupported teaching style: ${requested}`);
    return requested;
  }
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return "katas";
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write("Teaching style:\n  1. Katas\n");
    while (true) {
      const answer = (await readline.question("Select a style: ")).trim().toLowerCase();
      if (answer === "1" || answer === "kata" || answer === "katas") return "katas";
      process.stdout.write("Select 1 or katas.\n");
    }
  } finally {
    readline.close();
  }
}

function forwardedUiArgs(args: string[]): string[] {
  const result = ["--background", "--no-open", "--no-portless"]
    .filter((flag) => args.includes(flag));
  for (const flag of ["--port", "--tld"]) {
    const value = valueAfter(args, flag);
    if (value) result.push(flag, value);
  }
  return result;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index >= 0) return args[index + 1];
  return args.find((argument) => argument.startsWith(`${flag}=`))?.slice(flag.length + 1);
}
