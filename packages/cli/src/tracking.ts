import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

type AgentName = "pi" | "codex" | "claude" | "opencode" | "gemini" | "unknown";

type CassetteEntry = {
  role: "user" | "assistant" | "toolResult";
  content: string | Array<Record<string, unknown>>;
};

type SessionSource = {
  agent: AgentName;
  sessionId: string;
  path: string;
};

type Candidate = {
  path: string;
  mtimeMs: number;
};

const CASSETTES_DIR = ".dojo/cassettes";
const SESSION_LOG_ENV = ["DOJOCHO_SESSION_LOG", "DOJO_SESSION_LOG", "SESSION_LOG"];

export function recordCassette(root: string, args: string[]): SessionSource & { outputPath: string; entries: number } {
  const explicitSource = valueAfter(args, "--source");
  const source = explicitSource
    ? sourceFromPath(explicitSource)
    : detectSessionSource(root);

  if (!source) {
    throw new Error(
      "Could not find an active agent session log. Set DOJOCHO_SESSION_LOG=/path/to/session.jsonl and run `npx dojofoo track` again.",
    );
  }

  const cassette = normalizeSessionLog(source);
  if (cassette.length === 0) {
    throw new Error(`No user/assistant messages found in ${source.path}`);
  }

  const outDir = resolve(root, CASSETTES_DIR);
  mkdirSync(outDir, { recursive: true });

  const outputPath = cassettePathForSource(outDir, source);
  writeFileSync(outputPath, JSON.stringify(cassette, null, 2) + "\n");

  return { ...source, outputPath, entries: cassette.length };
}

export function refreshCassette(root: string): void {
  try {
    recordCassette(root, []);
  } catch {
    // Automatic tracking must never block a kata flow. Users can run
    // `npx dojofoo track --source <path>` when their agent stores logs elsewhere.
  }
}

export function cassetteDir(root: string): string {
  return resolve(root, CASSETTES_DIR);
}

export function detectSessionSource(root: string): SessionSource | null {
  for (const envName of SESSION_LOG_ENV) {
    const value = process.env[envName];
    if (value && existsSync(expandHome(value))) return sourceFromPath(value);
  }

  const agent = detectAgent();
  const sessionId = sessionIdFor(agent);
  const source = findSourceForAgent(root, agent, sessionId);
  if (source) return source;

  return null;
}

function findSourceForAgent(root: string, agent: AgentName, sessionId: string | null): SessionSource | null {
  const home = homedir();

  if (agent === "pi") {
    const base = join(home, ".pi", "agent", "sessions");
    const cwdSlug = piCwdSlug(root);
    const dirs = [join(base, cwdSlug), base].filter(existsSync);
    return sourceFromCandidates(agent, dirs.flatMap((dir) => findJsonl(dir)), sessionId);
  }

  if (agent === "codex") {
    const base = join(home, ".codex", "sessions");
    return sourceFromCandidates(agent, existsSync(base) ? findJsonl(base) : [], sessionId);
  }

  if (agent === "claude") {
    const base = join(home, ".claude", "projects");
    const cwdSlug = root.replaceAll("/", "-");
    const files = existsSync(base) ? findJsonl(base).filter((f) => f.path.includes(cwdSlug)) : [];
    return sourceFromCandidates(agent, files.length > 0 ? files : existsSync(base) ? findJsonl(base) : [], sessionId);
  }

  if (agent === "opencode") {
    const base = join(home, ".opencode", "sessions");
    return sourceFromCandidates(agent, existsSync(base) ? findJsonl(base) : [], sessionId);
  }

  if (agent === "gemini") {
    const base = join(home, ".gemini");
    return sourceFromCandidates(agent, existsSync(base) ? findJsonl(base) : [], sessionId);
  }

  return null;
}

function sourceFromCandidates(agent: AgentName, candidates: Candidate[], sessionId: string | null): SessionSource | null {
  const filtered = sessionId
    ? candidates.filter((candidate) => candidate.path.includes(sessionId))
    : candidates;
  const latest = filtered.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!latest) return null;
  return { agent, sessionId: sessionIdFromPath(latest.path), path: latest.path };
}

function sourceFromPath(path: string): SessionSource {
  const expanded = expandHome(path);
  return {
    agent: detectAgent(),
    sessionId: sessionIdFromPath(expanded),
    path: expanded,
  };
}

function cassettePathForSource(outDir: string, source: SessionSource): string {
  const existing = readdirSync(outDir)
    .filter((name) => name.endsWith(`-${source.sessionId}.jsonl`))
    .sort()
    .at(-1);

  if (existing) return resolve(outDir, existing);

  const prefix = timestampPrefix(new Date());
  return resolve(outDir, `${prefix}-${source.sessionId}.jsonl`);
}

function normalizeSessionLog(source: SessionSource): CassetteEntry[] {
  const raw = readFileSync(source.path, "utf8");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter(isCassetteEntry);
    } catch {
      // Fall through to JSONL parsing.
    }
  }

  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const events = lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });

  if (source.agent === "pi") {
    const entries = normalizePi(events);
    return entries.length > 0 ? entries : normalizeGeneric(events);
  }
  if (source.agent === "codex") {
    const entries = normalizeCodex(events);
    return entries.length > 0 ? entries : normalizeGeneric(events);
  }

  return normalizeGeneric(events);
}

function normalizePi(events: Record<string, unknown>[]): CassetteEntry[] {
  const entries: CassetteEntry[] = [];

  for (const event of events) {
    if (event.type !== "message") continue;
    const message = asRecord(event.message);
    const role = message?.role;
    if (role === "user" || role === "assistant" || role === "toolResult") {
      const content = piContent(message.content);
      if (content) entries.push({ role, content });
    }
  }

  return entries;
}

function normalizeCodex(events: Record<string, unknown>[]): CassetteEntry[] {
  const entries: CassetteEntry[] = [];

  for (const event of events) {
    if (event.type !== "response_item") continue;
    const payload = asRecord(event.payload);
    if (!payload) continue;

    if (payload.type === "message") {
      const role = payload.role;
      if (role !== "user" && role !== "assistant") continue;
      if (role === "user" && payload.phase !== undefined) continue;
      const content = codexMessageContent(payload.content);
      if (content && !isEnvironmentContext(content)) entries.push({ role, content });
      continue;
    }

    if (payload.type === "function_call") {
      entries.push({
        role: "assistant",
        content: [{
          type: "toolCall",
          name: payload.name,
          arguments: parseArguments(payload.arguments),
        }],
      });
      continue;
    }

    if (payload.type === "function_call_output") {
      const output = typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output);
      entries.push({ role: "toolResult", content: output });
    }
  }

  return entries;
}

function normalizeGeneric(events: Record<string, unknown>[]): CassetteEntry[] {
  const entries: CassetteEntry[] = [];
  for (const event of events) {
    const message = asRecord(event.message) ?? event;
    const role = message.role;
    if (role !== "user" && role !== "assistant" && role !== "toolResult") continue;
    const content = piContent(message.content);
    if (content) entries.push({ role, content });
  }
  return entries;
}

function piContent(content: unknown): CassetteEntry["content"] | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;

  const items = content
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => item.type !== "thinking")
    .map((item) => {
      if (item.type === "text" && typeof item.text === "string") return item.text;
      if (item.type === "toolCall") {
        const args = asRecord(item.arguments);
        return {
          type: "toolCall",
          name: item.name,
          command: typeof args?.command === "string" ? args.command : undefined,
        };
      }
      return item;
    });

  if (items.length === 0) return null;
  if (items.every((item) => typeof item === "string")) return items.join("\n");
  return items.map((item) =>
    typeof item === "string" ? { type: "text", text: item } : item,
  );
}

function codexMessageContent(content: unknown): CassetteEntry["content"] | null {
  if (!Array.isArray(content)) return null;
  const items = content
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      if ((item.type === "input_text" || item.type === "output_text") && typeof item.text === "string") return item.text;
      return item;
    });

  if (items.length === 0) return null;
  if (items.every((item) => typeof item === "string")) return items.join("\n");
  return items.map((item) =>
    typeof item === "string" ? { type: "text", text: item } : item,
  );
}

function detectAgent(): AgentName {
  if (process.env.PI_CODING_AGENT) return "pi";
  if (process.env.CODEX_THREAD_ID) return "codex";
  if (process.env.CLAUDECODE) return "claude";
  if (process.env.OPENCODE) return "opencode";
  if (process.env.GEMINI_CLI) return "gemini";
  return "unknown";
}

function sessionIdFor(agent: AgentName): string | null {
  const keysByAgent: Record<AgentName, string[]> = {
    pi: ["PI_SESSION_ID", "PI_THREAD_ID"],
    codex: ["CODEX_THREAD_ID"],
    claude: ["CLAUDE_SESSION_ID", "CLAUDE_CONVERSATION_ID"],
    opencode: ["OPENCODE_SESSION_ID"],
    gemini: ["GEMINI_SESSION_ID"],
    unknown: [],
  };

  for (const key of keysByAgent[agent]) {
    const value = process.env[key];
    if (value) return value;
  }
  return null;
}

function findJsonl(dir: string): Candidate[] {
  const entries: Candidate[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...findJsonl(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".jsonl")) {
      entries.push({ path: fullPath, mtimeMs: statSync(fullPath).mtimeMs });
    }
  }
  return entries;
}

function piCwdSlug(root: string): string {
  return `--${root.replace(/^\/+/, "").replaceAll("/", "-")}--`;
}

function sessionIdFromPath(path: string): string {
  const name = basename(path).replace(/\.jsonl$/, "");
  const uuid = name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (uuid) return uuid[0];
  return name;
}

function timestampPrefix(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(path);
}

function valueAfter(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function isCassetteEntry(value: unknown): value is CassetteEntry {
  const entry = asRecord(value);
  return (
    (entry?.role === "user" || entry?.role === "assistant" || entry?.role === "toolResult") &&
    (typeof entry.content === "string" || Array.isArray(entry.content))
  );
}

function isEnvironmentContext(content: CassetteEntry["content"]): boolean {
  return typeof content === "string" && content.trim().startsWith("<environment_context>");
}

export function relativeCassettePath(root: string, path: string): string {
  return relative(root, path);
}
