import { existsSync, mkdirSync, lstatSync, readFileSync, readlinkSync, readdirSync, unlinkSync, writeFileSync, symlinkSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI, DOJOS_DIR, readDojoRc, writeDojoRc, type DojoRc } from "../config";

export const AGENTS = {
  claude: { dir: ".claude", commandsDir: "commands", hasSettings: true, envVars: ["CLAUDECODE"] },
  opencode: { dir: ".opencode", commandsDir: "commands", hasSettings: false, envVars: ["OPENCODE"] },
  codex: { dir: ".codex", commandsDir: "commands", hasSettings: false, envVars: ["CODEX_THREAD_ID"] },
  gemini: { dir: ".gemini", commandsDir: "commands", hasSettings: false, envVars: ["GEMINI_CLI"] },
  pi: { dir: ".pi", commandsDir: "prompts", hasSettings: false, envVars: ["PI_CODING_AGENT"] },
} as const;

const AGENTS_COMMANDS_DIR = ".agents/commands";
const AGENTS_SKILLS_DIR = ".agents/skills";

export type AgentName = keyof typeof AGENTS;

const INTERACTIVE_AGENTS = [
  { name: "OpenCode", value: "opencode" },
  { name: "Codex", value: "codex" },
  { name: "Pi", value: "pi" },
] as const satisfies ReadonlyArray<{ name: string; value: AgentName }>;

export function detectAgentsFromEnv(): AgentName[] {
  return (Object.keys(AGENTS) as AgentName[]).filter((a) =>
    AGENTS[a].envVars.some((v) => Boolean(process.env[v])),
  );
}

const CLAUDE_SETTINGS = {
  permissions: {
    allow: [
      "Bash(npx dojofoo *)",
      "Bash(npx dojofoo)",
    ],
    deny: [
      "Read(.dojos/**)",
      "Glob(.dojos/**)",
      "Grep(.dojos/**)",
    ],
  },
};

const DEFAULT_DOJO_MD = `!\`npx dojofoo $ARGUMENTS\`

Follow any \`<dojo:prompt>\` instructions in the output.
`;

const DEFAULT_KATA_MD_CLAUDE = `!\`npx dojofoo ui --background\`

!\`npx dojofoo status\`

## Identity

You are a kata sensei. Teach through Socratic dialogue — questions, hints, nudges — never give solutions directly.

## Protocol

CLI output uses XML tags to separate directives from student content:

- \`<dojo:status>\` — Machine state. Parse the \`run:\` line and execute it.
- \`<dojo:prompt>\` — Interaction spec. Follow the instructions inside.
- \`<dojo:sensei>\` — Teaching material. Internalize but **never** show verbatim to the student.
- \`<dojo:learnings>\` — Prior student observations. Use to personalize teaching.
- **Unwrapped text** — Student-facing. Display as-is.

## Flow

1. Parse \`<dojo:status>\` above.
2. If state is \`complete\`, congratulate the student.
3. If state is \`no-dojo\`, tell them to run \`npx dojofoo add <source>\`.
4. Otherwise, execute the \`run:\` command via Bash.
5. Parse the output. Display any unwrapped student-facing text.
6. Internalize \`<dojo:sensei>\` as your teaching material — teach exclusively from it, do NOT rely on outside knowledge.
7. If \`<dojo:learnings>\` is present, personalize: build on what the student knows, skip mastered concepts, address past struggles.
8. Follow \`<dojo:prompt>\` instructions. If there is no \`<dojo:prompt>\`, present the content and ask what the student would like to do.
9. **Use AskUserQuestion** for ALL student interactions — present choices, ask questions, gather responses. Never list numbered options as plain text.
10. When the task or student responses require CLI commands (\`npx dojofoo kata --check\`, \`npx dojofoo kata intro --done\`, \`npx dojofoo kata --open\`, etc.), run them via Bash.
11. If the teaching material contains Reference URLs, surface them to the student.
12. Before finishing, record 1–3 key observations about the student by running \`npx dojofoo kata --note "observation"\` for each.
13. Drive the full session: AskUserQuestion → process response → run commands if needed → AskUserQuestion again. Do not stop after one exchange.
`;

const DEFAULT_RC: DojoRc = {
  currentDojo: "",
  currentKata: null,
  editor: "code",
  progress: {},
};

export async function setup(
  root: string,
  args: string[],
  selectAgents = selectAgentsInteractively,
): Promise<void> {
  const explicit = agentsFromArgs(args);
  const skillsOnly = args.includes("--skills");
  const configured = skillsOnly ? configuredAgents(root) : [];
  let detected = explicit.length > 0 ? explicit : configured.length > 0 ? configured : detectAgentsFromEnv();
  const detectedFromEnvironment = explicit.length === 0 && configured.length === 0 && detected.length > 0;

  ensureProject(root);
  if (detected.length === 0) {
    detected = await selectAgents();
    if (detected.length === 0) {
      console.log(`No coding agents selected. Run ${CLI} install --agent opencode,codex,pi when you're ready.`);
      return;
    }
  }

  if (skillsOnly) {
    setupSkills(root, detected);
    console.log("Dojofoo skill installed in .agents/skills/dojofoo.");
    return;
  }

  setupAgents(root, detected);

  const suffix = detectedFromEnvironment ? ` (detected from env: ${detected.join(", ")})` : "";
  console.log(`Dojo ready${suffix}.

  Add a dojo with: ${CLI} add <source>
  Start learning:  ${CLI}`);
}

export function parseAgentSelection(answer: string): AgentName[] | null {
  const tokens = answer.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const selected = new Set<AgentName>();
  for (const token of tokens) {
    const byNumber = INTERACTIVE_AGENTS[Number(token) - 1];
    const byName = INTERACTIVE_AGENTS.find(({ name, value }) =>
      token === value || token === name.toLowerCase(),
    );
    const agent = byNumber?.value ?? byName?.value;
    if (!agent) return null;
    selected.add(agent);
  }
  return [...selected];
}

export async function selectAgentsInteractively(): Promise<AgentName[]> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return [];

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(`Which coding agents do you use?\n${INTERACTIVE_AGENTS
      .map(({ name }, index) => `  ${index + 1}. ${name}`)
      .join("\n")}\n`);
    while (true) {
      const answer = await readline.question("Select one or more (comma-separated): ");
      const selected = parseAgentSelection(answer);
      if (selected?.length) return selected;
      process.stdout.write("Enter one or more numbers or agent names.\n");
    }
  } finally {
    readline.close();
  }
}

export function ensureProject(root: string): void {
  if (!existsSync(resolve(root, ".dojorc")) && !existsSync(resolve(root, ".dojo/config.yaml"))) {
    writeDojoRc(root, DEFAULT_RC);
  }
  mkdirSync(resolve(root, DOJOS_DIR), { recursive: true });
}

export function agentsFromArgs(args: string[]): AgentName[] {
  const values = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--agent") {
      for (const value of (args[index + 1] ?? "").split(",")) values.add(value);
      index += 1;
    } else if (argument.startsWith("--agent=")) {
      for (const value of argument.slice("--agent=".length).split(",")) values.add(value);
    } else if (argument.startsWith("--")) {
      values.add(argument.slice(2));
    }
  }
  return (Object.keys(AGENTS) as AgentName[]).filter((agent) => values.has(agent));
}

function symlinkCanonical(root: string, agent: AgentName, name: "dojo" | "kata"): void {
  const cfg = AGENTS[agent];
  const targetDir = resolve(root, cfg.dir, cfg.commandsDir);
  const target = resolve(targetDir, `${name}.md`);
  const canonical = resolve(root, AGENTS_COMMANDS_DIR, `${name}.md`);

  // Replace any existing symlink or regular file with a fresh symlink so the
  // canonical content stays the single source of truth across agents.
  try { lstatSync(target); unlinkSync(target); } catch {}
  symlinkSync(relative(targetDir, canonical), target);
}

function writeCanonicalCommands(root: string): void {
  const canonicalDir = resolve(root, AGENTS_COMMANDS_DIR);
  mkdirSync(canonicalDir, { recursive: true });

  const canonicalDojo = resolve(canonicalDir, "dojo.md");
  if (!existsSync(canonicalDojo)) writeFileSync(canonicalDojo, DEFAULT_DOJO_MD);

  const canonicalKata = resolve(canonicalDir, "kata.md");
  if (!existsSync(canonicalKata)) writeFileSync(canonicalKata, DEFAULT_KATA_MD_CLAUDE);
}

function writeCanonicalSkill(root: string): void {
  const sourceDir = dirname(fileURLToPath(import.meta.url));
  const source = [
    resolve(sourceDir, "..", "skills", "dojofoo", "SKILL.md"),
    resolve(sourceDir, "..", "..", "skills", "dojofoo", "SKILL.md"),
  ].find(existsSync);
  if (!source) throw new Error("Could not locate the bundled Dojofoo skill.");
  const targetDir = resolve(root, AGENTS_SKILLS_DIR, "dojofoo");
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(resolve(targetDir, "SKILL.md"), readFileSync(source, "utf8"));
}

export function setupSkills(root: string, _agents: AgentName[]): void {
  writeCanonicalSkill(root);
  removeLegacySkillLinks(root);
}

function removeLegacySkillLinks(root: string): void {
  for (const agent of Object.keys(AGENTS) as AgentName[]) {
    const directory = resolve(root, AGENTS[agent].dir, "skills");
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory)) {
      const link = resolve(directory, entry);
      try {
        if (!lstatSync(link).isSymbolicLink()) continue;
        const target = readlinkSync(link);
        if (target.includes(".agents/skills/") || target.includes(`${DOJOS_DIR}/`)) unlinkSync(link);
      } catch {
        // Ignore links concurrently removed by another installer process.
      }
    }
  }
}

export function setupAgents(root: string, agents: AgentName[]): void {
  writeCanonicalCommands(root);
  setupSkills(root, agents);

  for (const agent of agents) {
    const cfg = AGENTS[agent];
    mkdirSync(resolve(root, cfg.dir, cfg.commandsDir), { recursive: true });
    symlinkCanonical(root, agent, "dojo");
    symlinkCanonical(root, agent, "kata");

    if (cfg.hasSettings) {
      const settingsPath = resolve(root, cfg.dir, "settings.json");
      writeFileSync(settingsPath, JSON.stringify(CLAUDE_SETTINGS, null, 2) + "\n");
    }
  }
}

export function configuredAgents(root: string): AgentName[] {
  return (Object.keys(AGENTS) as AgentName[]).filter(
    (a) => existsSync(resolve(root, AGENTS[a].dir)),
  );
}
