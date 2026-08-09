import { existsSync, mkdirSync, lstatSync, unlinkSync, writeFileSync, symlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { CLI, DOJOS_DIR, readDojoRc, writeDojoRc, type DojoRc } from "../config";
import { pmCommands } from "../pm";
import { prompt, invokeAsk } from "../format";

export const AGENTS = {
  claude: { dir: ".claude", commandsDir: "commands", hasSettings: true, envVars: ["CLAUDECODE"] },
  opencode: { dir: ".opencode", commandsDir: "commands", hasSettings: false, envVars: ["OPENCODE"] },
  codex: { dir: ".codex", commandsDir: "commands", hasSettings: false, envVars: ["CODEX_THREAD_ID"] },
  gemini: { dir: ".gemini", commandsDir: "commands", hasSettings: false, envVars: ["GEMINI_CLI"] },
  pi: { dir: ".pi", commandsDir: "prompts", hasSettings: false, envVars: ["PI_CODING_AGENT"] },
} as const;

const AGENTS_COMMANDS_DIR = ".agents/commands";

export type AgentName = keyof typeof AGENTS;

function detectAgentsFromEnv(): AgentName[] {
  return (Object.keys(AGENTS) as AgentName[]).filter((a) =>
    AGENTS[a].envVars.some((v) => Boolean(process.env[v])),
  );
}

const CLAUDE_SETTINGS = {
  permissions: {
    allow: [
      "Bash(dojo *)",
      "Bash(dojo)",
    ],
    deny: [
      "Read(.dojos/**)",
      "Glob(.dojos/**)",
      "Grep(.dojos/**)",
    ],
  },
};

const DEFAULT_DOJO_MD = `!\`dojo $ARGUMENTS\`

Follow any \`<dojo:prompt>\` instructions in the output.
`;

const DEFAULT_KATA_MD_CLAUDE = `!\`dojo ui --background\`

!\`dojo status\`

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
3. If state is \`no-dojo\`, tell them to run \`dojo add <source>\`.
4. Otherwise, execute the \`run:\` command via Bash.
5. Parse the output. Display any unwrapped student-facing text.
6. Internalize \`<dojo:sensei>\` as your teaching material — teach exclusively from it, do NOT rely on outside knowledge.
7. If \`<dojo:learnings>\` is present, personalize: build on what the student knows, skip mastered concepts, address past struggles.
8. Follow \`<dojo:prompt>\` instructions. If there is no \`<dojo:prompt>\`, present the content and ask what the student would like to do.
9. **Use AskUserQuestion** for ALL student interactions — present choices, ask questions, gather responses. Never list numbered options as plain text.
10. When the task or student responses require CLI commands (\`dojo kata --check\`, \`dojo kata intro --done\`, \`dojo kata --open\`, etc.), run them via Bash.
11. If the teaching material contains Reference URLs, surface them to the student.
12. Before finishing, record 1–3 key observations about the student by running \`dojo kata --note "observation"\` for each.
13. Drive the full session: AskUserQuestion → process response → run commands if needed → AskUserQuestion again. Do not stop after one exchange.
`;

const ROOT_DOJO_MD = `# Welcome to Dojocho

Your dojo is set up and ready. You just need a dojo (training pack) to start practicing.

## Add a dojo

\`\`\`bash
dojo add <source>
\`\`\`

Source can be:
- A local path: \`dojo add ./path/to/dojo\`
- A git repo: \`dojo add org/repo\`
- Official dojos: \`dojo add effect-ts\`

## Start practicing

Once a dojo is added, use \`/kata\` in your coding agent to begin.
`;

const DOJO_CONFIG = `import { defineConfig } from "@dojocho/config"

export default defineConfig()
`;


const DEFAULT_RC: DojoRc = {
  currentDojo: "",
  currentKata: null,
  editor: "code",
  progress: {},
};

export function setup(root: string, args: string[]): void {
  const explicit = (Object.keys(AGENTS) as AgentName[]).filter(
    (a) => args.includes(`--${a}`),
  );
  const detected = explicit.length > 0 ? explicit : detectAgentsFromEnv();

  if (detected.length === 0) {
    promptAgents();
    return;
  }

  scaffold(root);
  setupAgents(root, detected);

  const kataCmd = detected.length === 1 ? `${detected[0]} "/kata"` : "/kata in your agent prompt";
  const suffix = explicit.length === 0 ? ` (detected from env: ${detected.join(", ")})` : "";
  console.log(`Dojo ready${suffix}.

  Add a dojo with: ${CLI} add <source>
  Then use:        ${kataCmd}`);
}

function promptAgents(): void {
  const options = [
    `- "Claude Code" → --claude`,
    `- "OpenCode" → --opencode`,
    `- "Codex" → --codex`,
    `- "Gemini CLI" → --gemini`,
    `- "Pi" → --pi`,
  ].join("\n");

  console.log(prompt(`${invokeAsk("multiSelect")} to ask the student:
Which coding agents do you use?
${options}

Then run: ${CLI} setup --<agent1> --<agent2> ...`));
}

function scaffold(root: string): void {
  const rcPath = resolve(root, ".dojorc");
  if (!existsSync(rcPath)) {
    writeDojoRc(root, DEFAULT_RC);
  }

  mkdirSync(resolve(root, DOJOS_DIR), { recursive: true });

  const dojoMdPath = resolve(root, DOJOS_DIR, "DOJO.md");
  if (!existsSync(dojoMdPath)) {
    writeFileSync(dojoMdPath, ROOT_DOJO_MD);
  }

  const configPath = resolve(root, "dojo.config.ts");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DOJO_CONFIG);
  }

  const tsconfigPath = resolve(root, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    writeFileSync(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ES2022",
            moduleResolution: "bundler",
            strict: true,
            noEmit: true,
          },
          include: ["katas/**/*.ts"],
        },
        null,
        2,
      ) + "\n",
    );
  }

  const pkgPath = resolve(root, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify({ type: "module", private: true }, null, 2) + "\n",
    );
  }


  const pm = pmCommands(root);
  console.log("Installing @dojocho/config...");
  try {
    execSync(pm.add("@dojocho/config"), { cwd: root, stdio: "pipe" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const firstLine = msg.split("\n").find((l) => l.includes("ERR_") || l.includes("error"))
      ?? msg.split("\n")[0];
    console.warn(`! Could not install @dojocho/config: ${firstLine.trim()}`);
    console.warn(`  Continuing setup. Install it manually later (e.g. when authoring katas):`);
    console.warn(`    ${pm.add("@dojocho/config")}`);
  }
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

export function setupAgents(root: string, agents: AgentName[]): void {
  writeCanonicalCommands(root);

  for (const agent of agents) {
    const cfg = AGENTS[agent];
    mkdirSync(resolve(root, cfg.dir, cfg.commandsDir), { recursive: true });
    mkdirSync(resolve(root, cfg.dir, "skills"), { recursive: true });

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
