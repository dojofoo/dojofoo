# Step 2 plan: one registry and one workspace selection (Sensei still on ACP)

*   **Design:** `docs/designs/agent-runtime.md`, "Implementation Roadmap", Step 2 (Approved 2026-11-03).
*   **Written against:** branch `eve-1`, HEAD `c3b5616` (steps 0 and 1 done), worktree `.worktree/mobile`, on 2026-11-04. All `path:line` references are to that commit.
*   **Reader:** the implementer has only this plan and the design. Where the two disagree on a current line number, this plan is right; where they disagree on behaviour, the design is right unless "Decisions made in this plan" says otherwise and why.

## What this step delivers

One coding-agent registry in `@dojofoo/protocol` that every agent list reads; one coding agent per workspace, chosen in the composer's agent menu and saved by `POST /api/v1/workspaces/{workspaceId}/agents/{agentId}/select`; the persona derived from a new workspace `kind`; adapter factories in `packages/agent` (`agentAdapter`); a per-launch token on the new state-changing route; and `pnpm lint:deps`. Sensei still runs on ACP for kata lessons, interactive courses and evaluation trials.

Gate (design, Step 2): step 1's specs plus `agent-selector.spec.ts`; the select, persona, kind and launch-token tests; a test that opens a master copy in authoring; `test:lesson` and `test:interactive` on ACP with their workspace's agent seeded in `.dojo/runtimes.json`; `pnpm lint:deps`; plus the common checks under "Verification Plan", from a clean `pnpm install --frozen-lockfile`.

## Facts checked on this machine (2026-11-04)

*   `~/.grok/bin` is first on `PATH`, and `~/.grok/bin/agent` is a symlink to `../downloads/grok-1.0.46-macos-aarch64` (Grok). The Cursor installer puts both `~/.local/bin/agent` and `~/.local/bin/cursor-agent` on the machine, symlinks to the same `~/.local/share/cursor-agent/versions/2026.07.09-a3815c0/cursor-agent`. Today `resolveAgentExecutable("cursor")` (`packages/config/src/agent-installations.ts:25-49`) searches for the row's `command`, which is `"agent"` (`packages/config/src/agents.ts:16`), so it finds Grok. `createLocalCursor` (`packages/authoring/src/eve/local-cursor.ts:22`) runs `which agent` and finds Grok too, and the ACP Sensei adapter falls back to `"agent"` (`packages/ui/src/server/harness/native-acp.ts:37`). The Cursor row's `command` becomes `cursor-agent`.
*   `claude --help` (Claude Code 2.1.287) names the `--model` aliases `fable`, `opus` and `sonnet`, and lists `--strict-mcp-config` and `--setting-sources <sources>`.
*   `@ai-sdk/harness-claude-code` 1.0.171 has a `strictMcpConfig` setting (`src/claude-code-harness.ts:116`) and passes the built-in filter to the CLI as `tools` (`src/bridge/index.ts:587`). It has no `settingSources` setting (no match for `settingSources`, `setting-sources` or `setting_sources` anywhere in the package).
*   Every adapter at its pinned version exposes `builtinTools` with a `toolUseKind` per tool, and the Codex, FX, OpenCode, Pi and Claude Code adapters pass `builtinToolFiltering` through (`harness-codex src/codex-harness.ts:162,230`; `harness-fx src/fx-session.ts:148,525`; `harness-opencode src/bridge/index.ts:123,341`; `harness-pi src/pi-harness.ts:135,272`; `harness-claude-code src/bridge/index.ts:541`). The read-only tool names in the registry below are the tools whose `toolUseKind` is `"readonly"` at those versions (printed by importing each adapter from `packages/authoring`). The source shows that filtering exists; it does not show that it holds at runtime. Step 3's prevention cases decide that (open risk 8).
*   `dependency-cruiser` 18.7.2 is the current release (`npm view`, Node `^22||^24||>=26`). It needs a `typescript` below 7 that it can resolve. Run against this tree with the rule set under commit 9, it reports three violations outside the named exemptions: `packages/uix/src/components/harness-icons.tsx` and `packages/uix/src/containers/agent-setup.tsx` → `packages/config/dist/agents.js` (removed in commit 2), and `packages/ui/e2e/agent-chat.fixture.ts` → `packages/agent-api/src/fixtures.ts` (removed in commit 9). The run takes about 3 seconds. `dist` must go under `doNotFollow`, not `exclude`. With `exclude`, imports by package name that resolve to `dist` drop out of the graph and the direction rules cannot see them.
*   `pnpm pack --json` returns one object `{ name, version, filename (absolute), files: [{ path }] }` and rewrites `workspace:*` dependencies to versions. `npm pack` does not, which matters once `packages/agent` has workspace dependencies (commit 3).
*   `packages/config` has no `test` script, so `packages/config/src/*.test.ts` (including `runtime.test.ts`) runs in no CI step. The tests that check `@dojofoo/config/local-state` live in `packages/cli/test/local-state.test.ts` (run by `pnpm --filter dojofoo test`, include `test/**/*.test.ts`, `packages/cli/vitest.config.ts`).
*   `verify.yml` runs no `@dojofoo/protocol` tests today, although the design's Verification Plan lists `pnpm --filter @dojofoo/protocol test`.

## The registry (protocol, data only)

New file `packages/protocol/src/agents.ts`. Today's `packages/config/src/agents.ts` (baseline) moves here; config re-exports it. Row order is today's order (`agents.ts:13-22`), because onboarding shows it and precedence step 3 under "Workspace agent selection" walks it.

```ts
export const agentIds = ["claude", "codex", "cursor", "agy", "grok", "opencode", "fx", "pi"] as const;
export type AgentId = (typeof agentIds)[number];
/** Adapter ids stay inside the harness (D12). */
export type AdapterId = "claude-code" | "codex" | "cursor" | "fx" | "grok-build" | "opencode" | "pi";
export type PreventionMechanism = "filter" | "deny";
export type ReadOnlyPermissionMode = "allow-all" | "allow-reads";
export type UserConfigIsolation =
  | { status: "flags"; args: readonly string[]; adapterSettings?: Readonly<Record<string, unknown>>; note: string }
  | { status: "environment"; home: "empty-directory"; environment: Readonly<Record<string, string>>; note: string }
  | { status: "none"; note: string }
  | { status: "pending"; candidates?: readonly string[]; note: string };
export interface ReadOnlyProfile {
  prevention: PreventionMechanism;
  permissionMode: ReadOnlyPermissionMode;
  /** HarnessV1 built-in tool keys allowed for read-only personas (step 4 builds the allow-list from them). */
  builtinTools: readonly string[];
  /** Data only in step 2; step 4 applies it when the CLI starts. */
  userConfig: UserConfigIsolation;
}
export type ModelDiscovery =
  | { method: "native" }                                   // existing discovery, packages/authoring/src/eve/models.ts
  | { method: "acp-probe" }                                // lands in step 4
  | { method: "adapter" }                                  // settled in step 3
  | { method: "cli-aliases"; aliases: readonly string[] };
export interface AgentRow {
  id: AgentId; name: string; short: string;
  command: string; install: string; docs: string; executableEnvironment?: string;
  adapterId?: AdapterId;          // undefined: no AI SDK adapter (agy)
  /** Runs today's ACP Sensei path; removed in step 7. */
  acp: boolean;
  readOnly?: ReadOnlyProfile;     // undefined for agy
  modelDiscovery?: ModelDiscovery;
}
export type AgentInstallation = AgentRow & { found: boolean; executable: string | null };
export const agentRows: readonly AgentRow[];
export const fallbackAgent: AgentId = "opencode";         // today's default (config/src/runtime.ts:35)
export function isAgentId(value: unknown): value is AgentId;   // Object.hasOwn-safe; "constructor", "__proto__" are false
export function agentRow(id: AgentId): AgentRow;
/** Steps 2-4: the rows today's ACP lesson registry runs. Step 5 switches this to the conformance record. */
export function offeredAgents(): readonly AgentRow[];      // agentRows.filter(row => row.acp)
export const acpAgentIds: readonly ["claude", "codex", "cursor", "grok", "opencode", "fx"];
export type AcpAgentId = (typeof acpAgentIds)[number];
export function isAcpAgentId(value: unknown): value is AcpAgentId;
```

Rows (identity columns copied from `packages/config/src/agents.ts:14-21` unless marked):

| id | command | adapterId | acp | prevention | permission | read-only built-ins (adapter version) | user-config isolation | model discovery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `claude` | `claude` | `claude-code` | yes | `filter` | `allow-reads` | `read`, `glob`, `grep` (1.0.171) | `flags`: `["--strict-mcp-config", "--setting-sources", ""]`, `adapterSettings: { strictMcpConfig: true }`; note: the adapter passes `tools` from the built-in filter, but 1.0.171 has no `settingSources` setting, so step 4 must find another way to pass `--setting-sources ""` | `cli-aliases`: `fable`, `opus`, `sonnet` |
| `codex` | `codex` | `codex` | yes | `filter` | `allow-all` | none (1.0.169: `bash`, `apply_patch`, `webSearch`, `view_image`; it has no read-only file tool, so Codex Sensei reads through `context`) | `pending`, candidate `--ignore-user-config` (the judges pass it to `codex exec`, `packages/authoring/src/evaluation/judges.ts:41`; whether the app-server path takes it is unverified) | `native` |
| `cursor` | `cursor-agent` (changed) | `cursor` | yes | `deny` | `allow-reads` | `read`, `glob`, `grep`, `ls` (1.0.81) | `none`; note: a `HOME` override breaks Cursor's keychain login; read-only relies on ask mode and rejecting permission requests | `acp-probe` |
| `agy` | `agy` | none | no | none | none | none | none | none |
| `grok` | `grok` | `grok-build` | yes | `deny` | `allow-reads` | `read_file`, `list_dir`, `grep` (1.0.105) | `environment`, `home: "empty-directory"`, `GROK_HOME: "~/.grok"` (`~` is the user's real home), and `"false"` for `GROK_CLAUDE_MCPS_ENABLED`, `GROK_CLAUDE_SKILLS_ENABLED`, `GROK_CLAUDE_RULES_ENABLED`, `GROK_CLAUDE_AGENTS_ENABLED`, `GROK_CLAUDE_HOOKS_ENABLED`, `GROK_CURSOR_MCPS_ENABLED`, `GROK_CURSOR_SKILLS_ENABLED`, `GROK_CURSOR_RULES_ENABLED`, `GROK_CURSOR_AGENTS_ENABLED`, `GROK_CURSOR_HOOKS_ENABLED` | `acp-probe` |
| `opencode` | `opencode` | `opencode` | yes | `filter` | `allow-reads` | `read`, `glob`, `grep` (1.0.169) | `pending` (research pending) | `native` |
| `fx` | `fx` | `fx` | yes | `filter` | `allow-reads` | `read`, `grep`, `glob`, `ls` (1.0.83) | `environment`, `home: "empty-directory"`, no variables; note: a `HOME` override only; filtering goes through `@ai-sdk/harness-fx` | `adapter` |
| `pi` | `pi` | `pi` | no | `filter` | `allow-reads` | `read`, `grep`, `glob`, `ls` (1.0.170) | `pending` (no research yet) | `native` |

The Cursor row's install text stays `curl https://cursor.com/install -fsS | bash`, which installs both names. The conformance record is not a row field in step 2. Step 3 adds the record file, and step 5 makes `offeredAgents()` read it (see "Decisions").

New file `packages/protocol/src/personas.ts`:

```ts
export const personas = ["sensei", "kyoshi"] as const;   // moved from packages/agent-api/src/runtime.ts:2-3
export type Persona = (typeof personas)[number];
export const workspaceKinds = ["learner", "draft", "evaluation-trial"] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];
export function personaForKind(kind: WorkspaceKind): Persona;  // "draft" → "kyoshi", else "sensei"
```

## Workspace selection

`packages/config/src/runtime.ts` keeps its path (`@dojofoo/config/runtime`), and its body is replaced:

```ts
export type AgentSelectionOptions = { environment?: NodeJS.ProcessEnv; discovery?: AgentDiscoveryOptions };
/** Highest first: <root>/.dojo/runtimes.json `agent`; the first offered agent in $DOJOFOO_HOME/settings.json `agents`
 * (or legacy `agent`); the first offered agent whose CLI resolveAgentExecutable finds; fallbackAgent. */
export function resolveAgent(root: string, options?: AgentSelectionOptions): AgentId;
/** Saves <root>/.dojo/runtimes.json { ...other keys, agent } through a temp file and rename; drops `authoring`/`lesson`. */
export function writeAgent(root: string, agent: AgentId, options?: AgentSelectionOptions): void;
export const ignoredAgentVariables = ["DOJOFOO_HARNESS", "DOJOFOO_LESSON_HARNESS", "DOJOFOO_AUTHORING_HARNESS",
  "DOJOFOO_MODEL", "DOJOFOO_LESSON_MODEL", "DOJOFOO_AUTHORING_MODEL"] as const;
```

*   `resolveAgent` always returns an offered id. A saved `agent` that is a string but not offered (for example `"pi"`) is skipped with one logged warning per path. A non-object file, or an `agent` that is not a string, throws `Invalid agent in <path>`, as today's `Invalid … harness` does (`runtime.ts:9-19`). The old `authoring`/`lesson` keys are ignored with one warning per path. `~/.dojofoo/runtimes.json` is no longer read; the design's precedence does not include it.
*   On its first call per process, `resolveAgent` writes one `console.warn` for each variable in `ignoredAgentVariables` that is set and not empty: "`<NAME>` is ignored: each workspace keeps its coding agent in `.dojo/runtimes.json`; choose it in the composer's agent menu."
*   `writeAgent` throws for an id that is not offered.
*   There is no test-mode agent variable. Tests and scripts write `{ "agent": "<id>" }` to their own temporary workspace's `.dojo/runtimes.json`.

## Workspace kind and persona

*   `packages/config/src/local-state.ts`: migration `version < 3` runs `ALTER TABLE workspaces ADD COLUMN kind TEXT CHECK (kind IS NULL OR kind IN ('learner','draft','evaluation-trial'))` and sets `user_version = 3`. `LocalWorkspace` gains `kind: WorkspaceKind | null`. Every `SELECT … FROM workspaces` (`listWorkspaces` `:189-194`, `readLocalSnapshot` `:247-250`) selects `kind`.
*   `observeWorkspace(db, root, now, kind?)` (`:408-423`): a new row gets `kind ?? 'learner'`. An existing row (and the `ON CONFLICT(id)` path) changes only when `kind === 'draft'` and the stored kind is `NULL` or `'learner'`. No registration ever changes `draft` to anything else, or `NULL` to `learner`; `NULL` waits for the backfill.
*   `observeWorkspacePath(root, options: LocalStateOptions & { kind?: WorkspaceKind })` and `observeLocalContext(root, options: LocalStateOptions & { kind?: WorkspaceKind })` pass `kind` through. New `setWorkspaceKind(workspaceId, kind, options)` runs `UPDATE workspaces SET kind = ? WHERE id = ?`; only the backfill uses it.
*   `packages/ui/src/server/control/drafts.ts` gains `isAuthoringWorkspace(root, options)`: today's rule, managed draft (`isManagedDraft`, `:15`) or `.dojo/kyoshi.json` or a Kyoshi record in `.dojo/agent-sessions.json`. That rule is inline today at `packages/ui/src/server/control/routes.ts:238` and `:197-198`. `newestKyoshiSession` moves here from `routes.ts:286-292`. It also gains `workspaceKind(workspace, options): WorkspaceKind`, which is `workspace.kind ?? (isAuthoringWorkspace(workspace.path, options) ? "draft" : "learner")`.
*   New `packages/ui/src/server/startup.ts`: `startUiServer(options?)` calls `backfillWorkspaceKinds(options)`, which calls `setWorkspaceKind` with the rule's result for every row whose `kind` is `NULL`. New Nitro plugin `packages/ui/server/plugins/startup.ts` calls `startUiServer()` in its body, inside `try/catch` with `console.error`. Steps 4 and 5 add reaping, recovery and the server lock to the same module.
*   Persona: the UI server's `AgentRuntime.persona(workspaceId)` returns `personaForKind(workspaceKind(row))`. `POST /sessions` takes the persona from it and ignores `body.persona`.

## Per-launch token

*   **What and where.** One random token per UI-server process: `randomBytes(32).toString("base64url")`, created on first use in `packages/ui/src/server/launch-token.ts` (`launchToken()`) and kept on `globalThis` under a `Symbol.for("dojofoo.launchToken")`, so duplicated route modules in the dev runner share it. It is never written to disk or into HTML, so a UI-server restart changes it.
*   **How the browser gets it.** `GET /api/control/launch-token` returns `{ token }` with `Cache-Control: no-store`. The route answers 403 when an `Origin` header is present and is not `requestOrigin(request)` (`packages/ui/src/server/request-origin.ts:2`), or when `Sec-Fetch-Site` is present and is neither `same-origin` nor `none`. A cross-site page cannot read the body either way: the app-wide CORS middleware reflects only the server's own origin (`packages/ui/src/server/app.ts:56-76`). The browser caches the token in module memory only (`packages/ui/src/lib/launch-token.ts`), never in storage.
*   **How it is sent and checked.** Header `x-dojofoo-launch-token`. A custom header also forces a CORS preflight for any cross-origin caller, and the preflight fails: `app.ts:63-64` allows only `Content-Type, Authorization` and no foreign origin. The check is `launchGuard({ token, origin })`, new in `packages/agent-api/src/launch.ts`, which `createAgentApi(runtime, { authorize })` calls on the token-checked routes. In step 2 that is `POST …/agents/{agentId}/select`; step 4 adds `POST /sessions/default`. An `Origin` that is present and differs from `origin(request)` gives 403 `origin_forbidden` ("Same-origin requests only."). A missing token, or one that differs (compared with `timingSafeEqual` on equal-length buffers), gives 403 `launch_token_invalid` ("This page's launch token is out of date."). A missing `Origin` is allowed when the token matches, as in the existing control routes (`control/routes.ts:193-194,220-221`).
*   **Retry.** `launchFetch(url, init)` gets the cached token, sends it, and on a 403 whose JSON `error` is `launch_token_invalid` fetches the token again once and retries once. A second `launch_token_invalid` throws `LaunchTokenError`. The selector then shows the alert "This page is out of date." with a "Reload the page" button (`window.location.reload()`). No other status is retried.
*   **Who calls the token-checked routes.** Only the UI's own pages; the CLI does not. Unit tests call `createAgentApi(runtime, { authorize: launchGuard({ token: () => testLaunchToken, origin }) })`. Browser specs get the token from the fixture runtime (`testLaunchToken`, exported by `packages/agent-api/src/fixtures.ts`) through a mocked `GET /api/control/launch-token` (open risk 12). In commits 7 and 8, `packages/ui/e2e/agent-chat.fixture.ts` imports it through its existing relative import (`:6`, `../../agent-api/src/fixtures`). Commit 9 switches that import to `@dojofoo/agent-api/fixtures`.
*   **D33.** The table gains a row right after `400 invalid_request` (`docs/designs/agent-runtime.md:395`): `| 403 \`launch_token_invalid\` | session API package (\`packages/agent-api/src/launch.ts\`), on the token-checked routes | the page's per-launch token is missing or from an earlier UI-server launch | the browser fetches the token again once and retries; a second refusal shows "Reload the page" |`.

## Session API additions (interface)

```ts
// packages/agent-api/src/runtime.ts
export { personas, type Persona } from "@dojofoo/protocol";     // replaces the local definition at :2-3
export interface AgentRuntime {
  // …existing members…
  /** Saves the workspace's coding agent after cancelling the old agent's turns and stopping its host.
   *  404 workspace_not_found | agent_not_found; 409 agent_not_offered. Selecting the current agent changes nothing. */
  select(workspaceId: string, agentId: string): Promise<Agent>;
  /** From the workspace's kind: a draft runs Kyoshi; a learner workspace or an evaluation trial runs Sensei. */
  persona(workspaceId: string): Promise<Persona>;
}
// packages/agent-api/src/launch.ts
export const LAUNCH_TOKEN_HEADER = "x-dojofoo-launch-token";
export function launchGuard(options: { token(): string; origin(request: Request): string }): (request: Request) => void;
// packages/agent-api/src/app.ts
export interface AgentApiOptions { authorize?(request: Request): void }
export function createAgentApi(runtime: AgentRuntime, options?: AgentApiOptions): Elysia;
```

*   Route `POST /api/v1/workspaces/:workspaceId/agents/:agentId/select`. No body. It calls `options.authorize?.(request)`, then returns `200` with the `Agent` (`selected: true`). Errors: 403 `launch_token_invalid` | `origin_forbidden`; 404 `workspace_not_found` | `agent_not_found`; 409 `agent_not_offered`. Schema entry `routes.selectAgent` (`packages/agent-api/src/schema.ts`): `params: { workspaceId, agentId }`, `response: { 200: agent, 403: error, 404: error, 409: error }`, operationId `selectAgent`.
*   `routes.createSession.body.persona` becomes `t.Optional(persona)`; the handler (`app.ts:61-77`) uses `await runtime.persona(params.workspaceId)`.

## Commits

Each commit type-checks and builds (`pnpm build && pnpm -r --if-present types:check`) and passes the unit tests of the packages it touches. It leaves Kyoshi authoring, kata Sensei, interactive Sensei and evaluation working. Run `pnpm install` after any `package.json` change and commit `pnpm-lock.yaml` with it.

### Commit 1: The coding-agent registry in protocol, built to dist

*   **Add** `packages/protocol/src/agents.ts` and `packages/protocol/src/personas.ts` (contents above).
*   **Change** `packages/protocol/src/index.ts`: append `export * from "./agents.js"; export * from "./personas.js";`. Convention: relative imports in protocol carry `.js` extensions, so tsc-built NodeNext consumers (`packages/agent`, `rootDir: "src"`, `declaration: true`) never meet raw `.ts` (TS6059) or extensionless imports.
*   **Add** `packages/protocol/tsconfig.build.json`: extends `./tsconfig.json` with `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `noEmit: false`, `declaration: true`, `rootDir: "src"`, `outDir: "dist"`, `exclude: ["src/**/*.test.ts"]`.
*   **Change** `packages/protocol/package.json`: `"files": ["dist"]`; `"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" } }`; script `"build": "tsc -p tsconfig.build.json"`. `types:check` and `test` stay.
*   **Change** `.gitignore`: add `packages/protocol/dist/` under "build outputs".
*   **Add** `packages/protocol/src/agents.test.ts`:
    *   `has one row per agent id, in onboarding order`
    *   `offers exactly the rows today's ACP lesson runtime runs` (ids `claude, codex, cursor, grok, opencode, fx`)
    *   `every offered row has an adapter and a read-only profile`
    *   `Cursor resolves cursor-agent, not the agent command Grok also installs`
    *   `rejects prototype keys as agent ids` (`constructor`, `__proto__`, `toString`)
    *   `a draft runs Kyoshi; learner workspaces and evaluation trials run Sensei` (`personaForKind`)
*   **Change** `.github/workflows/verify.yml`: add `- run: pnpm --filter @dojofoo/protocol test` after the `@dojofoo/uix test` step.
*   Consumers that already import `@dojofoo/protocol` (`packages/ui/src/server/lesson/*.ts`, `run/routes.ts`, `packages/cli/src/lesson-mcp.ts`, `packages/evals/src/eval-mcp.ts`) now resolve `dist`. `pnpm build` builds protocol first (turbo `^build`).

### Commit 2: Every agent definition comes from protocol; Cursor resolves `cursor-agent`

*   **Change** `packages/config/src/agents.ts`: replace its body with `export { agentRows as agentDefinitions, type AgentRow as AgentDefinition, type AgentId, type AgentInstallation } from "@dojofoo/protocol";`. Its importers (`agent-installations.ts:4`, `runtime.ts:4`, `packages/cli/src/runtime.ts:1`, `packages/ui/src/components/local-onboarding.tsx:1`, `packages/ui/e2e/local-library.spec.ts:2`) keep compiling.
*   **Change** `packages/config/package.json`: add `"@dojofoo/protocol": "workspace:*"` to `dependencies`. tsup keeps it external.
*   **Change** `packages/config/src/local-state.ts:88-95`: type `SESSION_ENVIRONMENTS` as `ReadonlyArray<readonly [AgentId, string]>`, so it stays a list keyed by `AgentId`.
*   **Change** `packages/uix/src/components/harness-icons.tsx:2` and `packages/uix/src/containers/agent-setup.tsx:1` to import from `@dojofoo/protocol` (`agentRows`, `AgentRow`, `AgentId`, `AgentInstallation`). In `packages/uix/package.json`, replace `"@dojofoo/config"` with `"@dojofoo/protocol": "workspace:*"`.
*   **Change** `packages/ui/src/lib/coding-agents.ts:2,6` and `packages/ui/src/server/local.ts:1,46` to import `agentRows` from `@dojofoo/protocol`.
*   **Change** `packages/ui/src/server/harness/native-acp.ts:37`: fallback `"cursor-agent"` instead of `"agent"`.
*   **Change** `packages/cli/scripts/prepare-package.mjs:14`: packages list `["protocol", "config", "agent", "authoring"]`, so the packed CLI bundles `@dojofoo/protocol` (config's dist imports it at runtime).
*   **Change** `packages/agent/experiments/model-provider/run.mjs:52`: the `pnpm pack` loop's list becomes `["authoring", "config", "protocol"]`, because config (and from commit 3, agent) depends on the private protocol.
*   **Change** `packages/cli/scripts/test-packed-ui.mjs` (after `installedRequire`, `:36`): `installedRequire.resolve("@dojofoo/protocol")`, throwing "Packed CLI is missing @dojofoo/protocol." when it is absent.
*   **Change** `.github/workflows/verify.yml`: `pnpm --filter @dojofoo/config build` becomes `pnpm --filter "@dojofoo/config..." build`, which also builds protocol first. uix and web type-check before `pnpm build`.
*   **Add** `packages/cli/test/agent-installations.test.ts`. It moves the two discovery cases from `packages/config/src/runtime.test.ts:39-64`, where no CI step runs them, and adds `Cursor resolves cursor-agent even when another CLI's agent is first on PATH`: dir A holds an executable `agent`, dir B an executable `cursor-agent`, `PATH=A:B`; `resolveAgentExecutable("cursor", { environment: { PATH }, home })` returns `B/cursor-agent`.

### Commit 3: Adapter factories move into the harness (`agentAdapter`)

*   **Add** `packages/agent/src/adapters.ts`:
    *   `export async function agentAdapter(agent: AgentId, environment = process.env): Promise<AgentAdapter>`.
    *   It throws `Unsupported coding agent: <id>` unless `isAgentId(agent) && agentRow(agent).adapterId`.
    *   It creates `createClaudeCode({ port: 0 })`, `createCodex({ port: 0 })`, `createLocalCursor()`, `createFx()`, `createGrokBuild({ port: 0 })` and `createOpenCode({ port: 0 })` once per id and caches them in a module `Map`, so the same call returns the same object.
    *   Pi: `createPi({ agentDir: resolve(environment.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")) })` from `await import("@ai-sdk/harness-pi")` on every call, as today (`packages/authoring/src/eve/harness.ts:30-35`).
    *   `AgentAdapter` is the union of those factories' return types.
*   **Add** `packages/agent/src/local-cursor.ts`, moved from `packages/authoring/src/eve/local-cursor.ts`. It replaces `execFileSync("which", ["agent"])` (`:22`) with `resolveAgentExecutable("cursor")` from `@dojofoo/config/agent-installations`. The missing-CLI message becomes "Cursor CLI is not installed. Install it with `curl https://cursor.com/install -fsS | bash` and log in with `cursor-agent login`." The wrapper file stays `${bootstrapDir}/home/.local/bin/agent`, because the adapter's bootstrap runs that name. Only the lookup changes.
*   **Change** `packages/agent/package.json`:
    *   Add `exports["./adapters"] = { types: "./dist/adapters.d.ts", import: "./dist/adapters.js", default: "./dist/adapters.js" }`.
    *   Add to `dependencies`: `@ai-sdk/harness-claude-code` 1.0.171, `@ai-sdk/harness-codex` 1.0.169, `@ai-sdk/harness-cursor` 1.0.81, `@ai-sdk/harness-fx` 1.0.83, `@ai-sdk/harness-grok-build` 1.0.105, `@ai-sdk/harness-opencode` 1.0.169, `@ai-sdk/harness-pi` 1.0.170 (moved from `devDependencies`, `package.json:598`), `@dojofoo/protocol` and `@dojofoo/config` (`workspace:*`).
    *   Add `vitest` `^5.0.5` to `devDependencies`.
    *   The `test` script becomes `pnpm build && vitest run && node --test --test-timeout=10000 … && node experiments/model-provider/run.mjs`; the `node --test` list is unchanged.
*   **Add** `packages/agent/vitest.config.ts`: `defineConfig({ test: { include: ["test/**/*.test.ts"] } })`. Without it, Vitest's default include would also pick up the `node:test` files in `experiments/model-provider/*.test.mjs`.
*   **Add** `packages/agent/test/adapters.test.ts`, moved from `packages/authoring/src/eve/harness.test.ts`, calling `agentAdapter(id)`:
    *   `reads Pi's native provider/model settings without copying credentials`
    *   `uses the official %s adapter contract` (claude, codex, cursor, fx, grok, pi)
    *   `returns the same OpenCode adapter on every call`
    *   `rejects %s rather than silently switching agents` (unknown, constructor, `__proto__`, toString, agy)
*   **Add** `packages/agent/test/local-cursor.contract.test.ts`, moved from `packages/authoring/src/eve/local-cursor.contract.test.ts`. It mocks `@dojofoo/config/agent-installations` `resolveAgentExecutable` (returning `/fixture/Cursor Agent/bin/cursor-agent`) instead of `execFileSync`, and asserts the call was `resolveAgentExecutable("cursor")`.
*   **Add** `packages/agent/test/cursor-acceptance.test.ts`, moved from `packages/authoring/src/eve/cursor-acceptance.test.ts`. It stays gated by `DOJO_CURSOR_ACCEPTANCE=1` and imports `../src/local-cursor.ts`, `../src/harness.ts` and `../src/local-runtime.ts` by relative path.
*   **Delete** `packages/authoring/src/eve/harness.ts`, `local-cursor.ts`, `harness.test.ts`, `local-cursor.contract.test.ts` and `cursor-acceptance.test.ts`. `packages/authoring/package.json` keeps its `@ai-sdk/harness-*` entries; step 8 removes them.
*   **Change** `packages/authoring/package.json`: add `"@dojofoo/protocol": "workspace:*"` to `dependencies`. From this commit on, authoring imports `AgentId`, `isAgentId` and `agentRow` from it (`eve/agent.ts`, `eve/install.ts`, `eve/runtime.ts`, `evaluation/learner-fixtures.ts`, `evaluation/learner-response.ts`; in commit 4 also `evaluation/settings.ts`, `server/routes.ts`, `eve/models.ts`, `server/service.ts`).
*   **Change** the callers to `agentAdapter` from `@dojofoo/agent/adapters`:
    *   `packages/authoring/src/eve/agent.ts:4,34`: `agentAdapter(settings.harness)`; `KyoshiRuntime.harness` becomes `AgentId`.
    *   `install.ts:6,10`: `prepareAuthoringHarness(agent: AgentId)`.
    *   `runtime.ts:5,53-55`: still `resolveRuntimeHarness` in this commit; throws unless `isAgentId`, then `await agentAdapter(agent)`.
    *   `harness-lifecycle.test.ts:8,14,27`: list typed `satisfies readonly AgentId[]`.
    *   `packages/authoring/src/evaluation/learner-fixtures.ts:7,58` and `learner-response.ts:7,63`: `agentAdapter(harness)` after an `isAgentId` check.
    *   `learner-fixtures.test.ts:17`: `vi.mock("@dojofoo/agent/adapters", () => ({ agentAdapter: () => ({}) }))`.
    *   `packages/authoring/src/evaluation/lesson-design.live.test.ts:7,66,71`: `:66` reads `process.env.DOJOFOO_EVAL_AGENT` instead of `DOJOFOO_HARNESS` and still throws when it or the model is missing. `:71` calls `agentAdapter(agent)` after an `isAgentId` check.
    *   `packages/evals/src/authoring-continuation.live.test.ts:10,41,43`: `const agent = process.env.DOJOFOO_EVAL_AGENT ?? "opencode"`, checked with `isAgentId` (today's `authoringHarness()` default is OpenCode). `:41` records `harness: agent`, and `:43` calls `agentAdapter(agent)`.
    *   The eval-parameter rename `DOJOFOO_HARNESS` → `DOJOFOO_EVAL_AGENT` happens in this commit for these two files. Their run commands in `packages/evals/authoring/README.md:98` (lesson design) and `:135` (continuation) change with them.
*   **Change** `packages/agent/experiments/model-provider/run.mjs`:
    *   `:46-48`: today `@dojofoo/agent` alone is packed with `npm pack` (`const [packed] = …`); the others already use `pnpm pack` (`:52-55`). It becomes `const packed = JSON.parse(execFileSync("pnpm", ["pack", "--json", "--pack-destination", root], { cwd: <agent dir>, encoding: "utf8" }))`, one object, so the new `workspace:*` dependencies are rewritten. The `files` assertions at `:49-50` stay. `:51` becomes `localPackages = { "@dojofoo/agent": \`file:${packed.filename}\` }`, since `filename` is absolute.
    *   `:24`: read `@ai-sdk/harness-pi` from `versions.dependencies`.
*   **Change** `packages/agent/README.md:338-339`: Local Cursor uses the installed `cursor-agent` executable, and the binding lives in `packages/agent/src/local-cursor.ts`.

### Commit 4: `resolveAgent` and `writeAgent` replace `resolveRuntimeHarness`; the removed variables are ignored

*   **Change** `packages/config/src/runtime.ts` (whole file): `resolveAgent`, `writeAgent` and `ignoredAgentVariables` as specified above. `RuntimeRole` and `resolveRuntimeHarness` are deleted.
*   **Delete** `packages/config/src/runtime.test.ts` (it runs in no CI step). **Add** `packages/cli/test/agent-selection.test.ts`:
    *   `a workspace's saved agent wins over the onboarding default and installed CLIs`
    *   `the onboarding default is the first offered agent in settings.json`
    *   `without a saved or onboarding choice, the first offered installed CLI is used, else OpenCode`
    *   `an agent that is not offered is skipped with one warning`
    *   `reports a malformed runtimes.json instead of switching agents`
    *   `old authoring and lesson keys are ignored with one warning`
    *   `DOJOFOO_HARNESS and the other removed variables are ignored with one warning each`
    *   `writeAgent keeps other keys, drops authoring and lesson, and refuses agents that are not offered`
*   **Change** every importer of `resolveRuntimeHarness`:
    *   `packages/cli/src/index.ts:18,86-97`: `new Set([...configuredAgents(cwd), resolveAgent(cwd)])`, filtered by `agentRow(agent).adapterId` instead of the hand-written list at `:93-94`.
    *   `packages/authoring/src/eve/runtime.ts:8,53`: `const agent = resolveAgent(courseRoot)`.
    *   `packages/ui/src/server/agent-api.ts:6,44-47`: `selected = path => resolveAgent(path)`; the `grok-build` mapping goes. In the same file:
        *   The `codingAgents` map (`:12`) is deleted; `describe` (`:48-56`) takes `name` from `agentRow(id).name`.
        *   `agents()` (`:116-120`) returns `[selected, ...offeredAgents() ids other than it]`, each through `describe`.
        *   `known()` (`:57-62`) throws 404 `agent_not_found` when `!isAgentId(agentId)`, else 409 `agent_unavailable` when it is not the selected agent. So `start("pi")` gives 409 and `start("nope")` gives 404.
    *   `packages/ui/src/server/interactive/conversation.ts:5,32,54`.
    *   `packages/ui/src/server/lesson/service.ts:2,266,628`.
    *   `packages/authoring/src/server/service.ts:135,451`: the trial writes `{ agent: resolveAgent(root) }`.
*   **Change** the ACP registry (agent list onto the registry):
    *   `packages/ui/src/server/harness/adapter.ts:3`: `export type HarnessKind = AcpAgentId` (imported from protocol).
    *   `registry.ts`: `adapters: Record<AcpAgentId, HarnessAdapter>`; `lessonHarnesses = acpAgentIds`.
    *   `dojofooHarness` (`:18-26`) is deleted and replaced by `lessonAgent(root: string): AcpAgentId`, which returns `resolveAgent(root)` or throws "`<name>` can't teach lessons yet. Choose another coding agent for this workspace." (user-facing, no step label).
    *   Callers: `service.ts:628` (`lessonAgent(root)`); `service.ts:876` (the `harness` parameter becomes required; drop the default); `interactive/conversation.ts:32` (`binding?.harness ?? lessonAgent(root)`); `conversation.ts:76-77` and `interactive/routes.ts:41-42` (validate with `isAcpAgentId`, message "Select a supported coding agent."); `lesson/routes.ts:64` (`isAcpAgentId` until commit 5 removes the branch).
*   **Change** evaluation to teach on the trial's agent (the draft's), not the settings picker:
    *   `packages/authoring/src/evaluation/host.ts:41-42`: the worker env drops `DOJOFOO_HARNESS`. `DOJOFOO_HANDOFF_MODEL` is `config.teachingModel` when `config.teachingHarness === resolveAgent(root)`, else `""`.
    *   `packages/cli/src/teaching-eval.ts:12-15`: the `DOJOFOO_HARNESS` gate is deleted.
    *   `teaching-eval.ts:31-32`: `const { lessonAgent } = await import(".../harness/registry"); const agent = lessonAgent(process.env.DOJOFOO_HANDOFF_COURSE);`, using the realpath'd course set at `:24` (not `process.argv[3]`), run before `runAuthoringHandoff` changes `DOJOFOO_HOME`, then passed as `runAuthoringHandoff(…, { agent, … })` at `:60` and `:72`.
    *   `packages/ui/src/server/lesson/authoring-handoff.ts`: new option `agent?: AcpAgentId`, defaulting to `lessonAgent(authoredRoot)` before `:61`. `:56` (the env check) is deleted. `:74` evidence uses `harness: agent`. `:77` calls `createLessonTrial(authoredRoot, lessons[0].name, { agent })`.
    *   `packages/authoring/src/server/service.ts:110`: `createLessonTrial(root, lessonId, options: { agent?: AgentId } = {})` writes `{ agent: options.agent ?? resolveAgent(root) }`. Commit 6 adds `kind`.
*   **Change** the remaining agent lists:
    *   `packages/authoring/src/evaluation/settings.ts:6-9`: `harness: z.enum(agentIds).refine(id => agentRow(id).adapterId !== undefined, "Select a supported coding agent")`.
    *   `packages/authoring/src/server/routes.ts:39-40`: `if (!isAgentId(harness) || !agentRow(harness).adapterId) return 422`.
    *   `packages/authoring/src/eve/models.ts:31-40`: `harnessModels(agent: AgentId, signal)` switches on `agentRow(agent).modelDiscovery`. `native` keeps today's Codex, Pi and OpenCode branches. `cli-aliases` returns `aliases.map(id => ({ id, name: id, efforts: [] }))`. `acp-probe` and `adapter` return `[]` (FX until step 3, Cursor and Grok until step 4).
    *   `packages/ui/src/components/harness-model-input.tsx:33`: with no error and an empty catalog, the placeholder reads "No models listed; the agent's default is used". The input stays `required`.
    *   `packages/ui/src/components/authoring-evaluation-settings.tsx:11,56-66`: teacher options are `offeredAgents()`; learner options are rows with an `adapterId`. Labels come from `codingAgents`. The Sensei legend gains the line "Sensei teaches on this draft's coding agent; the model applies when it is that agent." The pickers stay until step 7.
    *   `packages/cli/src/commands/setup.ts:20-24`: `INTERACTIVE_AGENTS = (["opencode", "codex", "pi"] as const satisfies readonly AgentName[]).map(value => ({ name: agentRow(value).name, value }))`. The skill-install map `AGENTS` (`:7-13`) keeps its five entries; cursor, fx and grok have no skill directory.
    *   `packages/evals/src/full-course-scenario.ts:1-3`: `matrixHarnesses = [...acpAgentIds, "pi"] as const` and `MatrixHarness = AcpAgentId | "pi"`. This adds `claude` to the matrix, so `full-course-scenario.test.ts:64` (cassette driver, no inference) gains a claude case. `agy` stays out because it has no adapter.
    *   `packages/evals/src/live-course-matrix.ts:37`: `LiveAcpCourseDriver`'s `harness` becomes `AcpAgentId`. After the `harness === "pi"` branch at `:176`, the loop variable narrows to `AcpAgentId`, so `:195` type-checks.
*   **Lists that stay keyed by `AgentId`** (they hold data no row carries): `packages/cli/src/runtime.ts:10-15` (`SESSION_KEYS`); `packages/cli/src/tracking.ts:88-116` (transcript paths; its `AgentName` is the local alias `type AgentName = RuntimeName` at `tracking.ts:13`, not setup's `AgentName`); `packages/config/src/local-state.ts:88-95` (typed in commit 2).
*   **Change** `packages/cli/src/runtime.ts:26-27`: delete the `DOJOFOO_HARNESS` branch.
*   **Change** the tests that set the removed variables:
    *   `packages/cli/test/runtime.test.ts:7,17,33`: drop `DOJOFOO_HARNESS`; the `agy` case goes, because agy has no native marker.
    *   `packages/cli/test/tracking.test.ts:14`: drop the stub.
    *   `packages/cli/test/teaching-eval.test.ts`: `:27-33` is deleted. `:47-55` becomes `rejects a malformed saved agent before paid work in %s` (runtimes.json `{ "agent": 123 }` gives stderr `Invalid agent`). `:39,60,74,90` drop `DOJOFOO_HARNESS` and seed `<root>/.dojo/runtimes.json` `{ "agent": "codex" }`.
    *   `packages/authoring/src/eve/runtime.test.ts:13`: seed `<root>/.dojo/runtimes.json` `{ "agent": "codex" }`.
    *   `runtime-turn.test.ts:66` (gated live): seed the selection's agent in the course's runtimes.json.
    *   `packages/ui/src/server/lesson/service-state.test.ts`:
        *   `freshCourse()` seeds `{ "agent": "opencode" }`, which keeps `:79-89` (expects `harness: "opencode"`) passing without the `DOJOFOO_LESSON_HARNESS` stub at `:80`; the stub is deleted.
        *   `:147-159` ("rejects an authoring-only harness…") is deleted. With the variable ignored, Pi can no longer be selected, and `writeAgent` refuses it.
        *   `:204-227` becomes `keeps a conversation on its agent while the selection stays the same`. `writeAgent(root, "codex")`; `startLessonSession` gives `owned-session`; `getLesson` returns `owned-session` with `harness: "codex"`; `streamSensei` resumes it on codex; `002-second` loads. A forced `startLessonSession(root, "001-first", "starter")` gives `replacement-session` on codex, with `owned-session` in its aliases; `another-course` is rejected; `start` was called twice. Dropping the old "switch to pi/opencode by variable" steps lets this test pass both before and after commit 5.
        *   `:124-136` and `:138-145` still pass in this commit: they pass `harness` explicitly, and their `DOJOFOO_HARNESS` stub no longer has any effect. Commit 5 deletes them.
        *   `:8` stops importing `dojofooHarness`; `:459` stores `harness: "opencode"` (the seeded agent) instead of `dojofooHarness()`.
    *   `packages/ui/src/server/agent-api.test.ts:34-115`: `workspace()` seeds `{ "agent": "codex" }`. `:107` becomes `writeAgent(root, "opencode")`. `:38` expects `["codex", "claude", "cursor", "grok", "opencode", "fx"]`. `:84` expects `start("pi")` to give 409 `agent_unavailable`.
    *   `packages/ui/src/server/lesson/authoring-handoff.test.ts:83`: seed `{ "agent": "codex" }` in the fixture root.
    *   `packages/ui/src/server/harness/adapters.test.ts:7,12,113,126` and `packages/ui/src/server/lesson/codex-client.test.ts:12,429-431`: every `dojofooHarness(...)` call becomes `lessonAgent(root)` on a temp root with seeded runtimes.json. `:12` seeds `claude` and expects `claude`; `:113` and `codex-client.test.ts:429` seed `opencode`; `codex-client.test.ts:430` seeds `codex`. `:126` and `:431` become `expect(isAcpAgentId("unknown")).toBe(false)`.
    *   `packages/ui/src/server/interactive/conversation.test.ts` and `interactive/routes.test.ts`: the setup seeds `{ "agent": "opencode" }`.
    *   `packages/authoring/src/evaluation/host.test.ts`: the fixture seeds `{ "agent": "codex" }`; new case `drops the teacher model when the draft's agent is not the configured teacher`.
    *   `packages/authoring/src/server/routes.test.ts:317,334`: the draft seeds `{ "agent": "codex" }`; the trial gets `{ "agent": "codex" }`.
*   **Change** the scripts, which seed the agent instead of setting variables:
    *   `packages/ui/scripts/verify-lesson-runtime.mjs:57-62`: drop `DOJOFOO_HARNESS`, `DOJOFOO_MODEL`, `DOJOFOO_AUTHORING_MODEL` and `DOJOFOO_LESSON_MODEL`; after the `cli add` at `:86`, `mkdir(join(workspace, ".dojo"), { recursive: true })` and write `.dojo/runtimes.json` `{ "agent": "opencode" }`.
    *   `verify-interactive-runtime.mjs:23-27`: the same; write after the `add` loop (the `add` call is at `:47`).
    *   `packages/cli/scripts/test-packed-ui.mjs:68-80`: write `authorRoot/.dojo/runtimes.json` `{ "agent": "opencode" }` before `createKyoshiRuntime`; the `DOJOFOO_HARNESS` save and restore goes.
    *   `packages/authoring/src/eve/browser.fixture.mjs:67-70`: drop `DOJOFOO_HARNESS`, `DOJOFOO_AUTHORING_HARNESS` and the three `*_MODEL` keys; after `add --master` (`:89-92`), write `{ "agent": "opencode" }` to both `course/.dojo/runtimes.json` and `learning/.dojo/runtimes.json`.
*   **Change** the remaining evals that used `DOJOFOO_HARNESS` to pick an agent (the two live tests moved in commit 3):
    *   `packages/evals/src/authoring.ts:30`: right after `scaffoldAuthoringWorkspace`, call `writeAgent(root, agent)` with `agent = process.env.DOJOFOO_EVAL_AGENT ?? "opencode"`, checked with `isAgentId` and offered. The Kyoshi runtime used to read the variable; it now reads the scaffold's runtimes.json.
    *   `packages/evals/authoring/evals/authoring-chain.eval.ts:25`: records `harness: process.env.DOJOFOO_EVAL_AGENT ?? "opencode"`.
    *   `packages/ui/src/server/lesson/teaching-comparison.live.test.ts:205`: passes `{ agent: "codex" }` to `runAuthoringHandoff` instead.
*   **Change** the docs that name `DOJOFOO_HARNESS`:
    *   `packages/agent/README.md:335`: Kyoshi's adapter comes from the draft's `.dojo/runtimes.json` agent (OpenCode by default).
    *   `packages/evals/authoring/README.md`: `:284,287,313,452` become `DOJOFOO_EVAL_AGENT=…`. `:230` says the runner writes `DOJOFOO_EVAL_AGENT` (default OpenCode) to the scaffold's `.dojo/runtimes.json`. In `:365` and `:372`, `DOJOFOO_HARNESS=codex` is removed, and the text says the worker teaches on the course's `.dojo/runtimes.json` agent (write `{ "agent": "codex" }` there).
    *   `packages/authoring/src/evaluation/fixtures/README.md:57`: "the normal `DOJOFOO_HARNESS`, …" becomes "the course's `.dojo/runtimes.json` agent and the normal `DOJOFOO_HANDOFF_MODEL` and `DOJO_CLI` settings".
*   **Change** the docs: in `apps/web/content/docs/commands/ui.mdx:86-97`, "The sensei's agent" says that each workspace has one coding agent, chosen in the composer's agent menu and saved as `{ "agent": "codex" }` in `.dojo/runtimes.json`, and that the default is the first agent picked at setup. In `packages/config/README.md:30-46`, "Harness defaults" describes `resolveAgent`'s precedence and `writeAgent`, and the `DOJOFOO_*` and role-key text goes.
*   **Change** `docs/designs/agent-runtime.md`, "Workspace agent selection", first bullet: replace "`DOJOFOO_AGENT` overrides all of them only when the UI server runs in test mode (`NODE_ENV=test` or the test fixture runtime); elsewhere it is ignored with a logged warning." with "There is no test-mode agent variable: tests and scripts write the agent to their own temporary workspace's `.dojo/runtimes.json`."

### Commit 5: After a switch, ACP lessons and interactive courses use the new agent; per-conversation pickers go

*   **Lesson path** (`packages/ui/src/server/lesson/service.ts`):
    *   `getLesson` (`:162-284`): `const agent = resolveAgent(root)`. A stored thread is usable only when `storedThread.harness === agent` (today `:180-210` resumes it on its stored harness). When `prepareSession` is true, a stored thread exists for another agent, and the route's course is the current course (`!courseId || stored.currentDojo === courseId`), the function calls `lessonThread(root, selected.name)`, which creates a thread on `agent` without a prompt, and uses its id with `messages = []`. Otherwise `threadId = undefined`. The snapshot returns that `sessionId` (`:264`) and `harness: agent` (`:266`).
    *   `lessonThread` (`:623-689`): `const harness = lessonAgent(root)`. It resumes `existing` only when `!options.forceNew && existing?.harness === harness`; otherwise it creates on `harness`, keeping `aliases` with the old session id. `options.harness` goes.
    *   `startLessonSession` (`:715-731`): the `harness` parameter and the `defaultHarness` write (`:723-727`) are deleted.
    *   `WebState.defaultHarness` (`:36`), the stored field at `:904` and its read at `:920` are deleted, so the next write drops it from `web.json`.
    *   `nextLesson` (`:582-613`) is unchanged: its `acpClient.history` reads already-received events and does not resume.
*   **Lesson routes** (`packages/ui/src/server/lesson/routes.ts`): the `POST /:workspaceId/courses/:courseId/lessons/:lessonId/sessions` handler (`:56-71`) ignores its body and calls `startLessonSession(root, lessonId, courseId)`. The `isAcpAgentId` import that replaced `:20` goes.
*   **Interactive path** (`packages/ui/src/server/interactive/conversation.ts`):
    *   `getInteractiveConversation` (`:50-58`), `session` (`:104-120`), `setInteractiveModel` (`:152-165`) and `answerInteractiveSensei` (`:167-172`) read `readInteractiveConversation(root, dojo, lessonAgent(root))`. Today `:105` resumes the saved binding whatever its agent. The per-agent map in `interactive.json` (`interactive/service.ts:51-64`) brings back an agent's own conversation when the learner switches back.
    *   `selectInteractiveHarness` (`:74-101`) refuses any value other than `lessonAgent(root)`: "`<name>` isn't this workspace's coding agent." It still prepares the selected agent's session for `onModelPrepare`.
    *   `PUT /configuration/harness` (`interactive/routes.ts:36-46`) stays until step 4 and gets the same check.
*   **Delete** the Trial-tab agent override (`packages/ui/src/routes/authoring.tsx`): `trialHarness` (`:75`), the `?harness=` search (`:320`, so `:321` opens the path without `search`) and the "Trial agent" `MenuButton` (`:481-483`).
*   **Delete** the per-lesson and per-conversation pickers:
    *   `packages/ui/src/routes/index.tsx`: the `requestedHarness` prop (`:214-216`) and its branch in the conversation effect (`:388-397`, which now always `fetch(apiBase)`); `changeAgent` (`:535-559`); and `agents`/`onAgentChange` on the lesson composer (`:841-842`), which keeps `agent` and `agentChanging`.
    *   `packages/ui/src/components/interactive-course.tsx`: `agents` and `onAgentChange` at `:234-235`. `changeAgent` (`:157-172`) stays, used only by `onModelPrepare` (`:239`).
*   **Delete** `packages/ui/e2e/interactive-agent-picker.spec.ts`.
*   **Change** `packages/ui/e2e/learner-agent-picker.spec.ts`: drop `"agent"` from the loop at `:16`, its route branch at `:35` and the `operation === "agent"` conditionals at `:58-59` (they would no longer type-check, TS2367: the menu step always uses "Model" and `/^GPT/`), and delete the test at `:79` ("native agent changes preserve drafts…").
*   **Change** `packages/ui/e2e/eve-authoring.spec.ts:526-539` (in the gate): drop the picker steps; expect `toHaveURL(/\/first$/)`.
*   **Tests** (`packages/ui/src/server/lesson/service-state.test.ts`):
    *   Delete `:124-136` and `:138-145` (the `harness` parameter and `defaultHarness` they test are gone).
    *   Add `a lesson opened after the workspace switches agents starts its thread on the new agent and never resumes the old one`. `writeAgent(root, "codex")`; `startLessonSession` gives thread `codex-1`; `writeAgent(root, "claude")`; `getLesson(root, "001-first")` calls `startThread` with `harness: "claude"`, never calls `resumeThread("codex-1")`, returns the new `sessionId`, and `web.json` aliases contain `codex-1`.
    *   The `:204-227` test rewritten in commit 4 stays as it is.
    *   Add `startLessonSession has no agent parameter and writes no defaultHarness`.
    *   In `interactive/conversation.test.ts`, `:105-121,139-190` switch agents with `writeAgent` and then `selectInteractiveHarness(root, "first", <selected>)`. The restore assertions at `:149-150` stay. The unsupported-choice case at `:164-165` expects "isn't this workspace's coding agent".
    *   `interactive/routes.test.ts:92-96`: `PUT` of the selected agent gives 200; another agent gives 422.

### Commit 6: Workspace kind, persona from kind, master copy registered as a draft

*   **Change** `packages/config/src/local-state.ts` as under "Workspace kind and persona": `migrate` (`:329-380`), `observeWorkspace` (`:408-423`), `observeWorkspacePath` (`:208-215`), `observeLocalContext` (`:107-138`), `listWorkspaces` (`:189-194`), `readLocalSnapshot` (`:247-250`), new `setWorkspaceKind`, `export type { WorkspaceKind }`.
*   **Change** the entry points that open a folder for authoring so each sets `draft` explicitly:
    *   `packages/ui/src/server/control/drafts.ts:29`: `observeWorkspacePath(root, { ...options, kind: "draft" })`.
    *   `packages/cli/src/commands/kyoshi.ts:50`.
    *   `packages/cli/src/commands/ui.ts:45` (`dojofoo ui --authoring`; this is also how a master copy opens, `cd courses/<id> && dojofoo --authoring`, as `add.ts:430` prints, with the root from `resolveAuthoringRoot`, `ui.ts:15-27`).
*   **Change** trials: `createLessonTrial(root, lessonId, { agent?, kind? })` (`packages/authoring/src/server/service.ts:110,156`) calls `observeLocalContext(trialRoot, { kind: options.kind ?? "learner" })`. The manual Trial tab route (`packages/authoring/src/server/routes.ts:132-136`) passes nothing, so it registers `learner`. `authoring-handoff.ts:77` passes `{ agent, kind: "evaluation-trial" }`.
*   **Add** `isAuthoringWorkspace`, `newestKyoshiSession` and `workspaceKind` to `packages/ui/src/server/control/drafts.ts`. **Change** `packages/ui/src/server/control/routes.ts`: `DELETE /authoring/:workspaceId` (`:192-203`) requires `workspaceKind(workspace) === "draft"`; `GET /authoring` (`:234-252`) lists rows whose `workspaceKind` is `draft` (`sessionId` still from `newestKyoshiSession`); `newestKyoshiSession` is deleted at `:286-292`.
*   **Add** `packages/ui/src/server/startup.ts` and `packages/ui/server/plugins/startup.ts` (above).
*   **Change** the session API:
    *   `packages/agent-api/src/runtime.ts:2-3,39-54`: `Persona` re-exported from protocol; `persona(workspaceId)` added. `select` comes in commit 7.
    *   `packages/agent-api/package.json`: add `"@dojofoo/protocol": "workspace:*"`.
    *   `schema.ts:9-11`: `persona` built from `personas`; `:63` `persona` optional.
    *   `app.ts:62`: `const persona = await runtime.persona(params.workspaceId)`.
*   **Change** `packages/ui/src/server/agent-api.ts`: `persona(workspaceId)`: find the row in `listWorkspaces(options.state)`; `404 workspace_not_found` if it is missing; return `personaForKind(workspaceKind(row, options.state))`.
*   **Change** `packages/agent-api/src/fixtures.ts:35-61`: `testRuntime(endpoint, workspaceId = "ws-1", options: { persona?: Persona } = {})` adds `persona: async id => { known(id); return options.persona ?? "kyoshi"; }`. The fixture workspace is a draft, as `agent-chat.fixture.ts` uses it. `greeting` (`:54`) stays.
*   **Tests:**
    *   `packages/cli/test/local-state.test.ts`, new cases:
        *   `registers a new workspace as a learner unless an authoring entry point says draft`
        *   `a draft registration upgrades a learner workspace and nothing turns a draft back`
        *   `an evaluation trial keeps its kind`
        *   `adds an empty kind to an existing version-two database for the UI server to backfill` (build the v2 file with `node:sqlite`, as the existing version-one test at `:185` does)
    *   `packages/ui/src/server/startup.test.ts`: `backfills a missing kind from the dashboard's draft rule` (a managed draft, a `.dojo/kyoshi.json` folder and a folder with a Kyoshi record become `draft`; a plain course becomes `learner`; rows with a kind are left alone).
    *   `packages/ui/src/server/control/routes.test.ts`:
        *   `:161-186` additionally expects `kind: "draft"` on created drafts.
        *   `:201-252` (three listing cases) is rewritten as `lists drafts by kind, with their newest Kyoshi session` (registered with `kind: "draft"`) and `does not list a learner workspace, even with agent sessions`.
        *   The legacy `kyoshi.json` case moves to `startup.test.ts`.
    *   `packages/ui/src/server/agent-api.test.ts`, new `persona` cases:
        *   `a draft runs Kyoshi`
        *   `a learner workspace and an evaluation trial run Sensei`
        *   `an unknown workspace is not found`
        *   `a workspace without a kind uses the draft rule`
    *   `packages/agent-api/src/app.test.ts`, new case `creates a session with the workspace's persona, ignoring a persona in the body` (`testRuntime(…, { persona: "sensei" })`, body `{ persona: "kyoshi" }`, record `persona: "sensei"`).
    *   `packages/cli/test/kyoshi-commands.test.ts`, new case `opening authoring registers the folder as a draft workspace` (`ui` is mocked, `:13`; `DOJOFOO_HOME` stubbed to a temp dir).
    *   `packages/cli/test/ui.test.ts:96-111` additionally expects `kind: "draft"`.
    *   **Master copy test** (open risk 9), `packages/cli/test/ui.test.ts`, new case `opens a master copy as its own draft workspace, separate from its learner workspace and its source`:
        1.  A source folder with `dojo.yaml` (`mode: katas`, one kata) is registered with `observeWorkspacePath(source, { stateHome, kind: "draft" })`.
        2.  A learner workspace gets `await add(workspace, [source, "--master"])` (as `starter-courses.test.ts:38`) and `observeLocalContext(workspace, { stateHome })`.
        3.  With `DOJOFOO_HOME` stubbed, `DOJO_PROJECT_ROOT = resolveAuthoringRoot(course, workspace)` and `spawn` mocked as at `:96-111`, it runs `await ui(course, ["--authoring", "--no-portless", "--no-open", "--port", "60767"], fixtureModuleUrl)`.
        4.  It asserts three rows: `course` with kind `draft`; `workspace` with kind `learner`; `source` with kind `draft`, its path unchanged. The ids are distinct, which shows that `.dojo/instance.json` was not copied (`packages/config/src/publication.ts:11-13`).
        5.  It asserts `personaForKind(courseRow.kind)` is `kyoshi` (`@dojofoo/protocol`; the CLI already has it as a devDependency, `packages/cli/package.json:67`). It does not import `packages/ui/src/server/agent-api.ts`: the UI package exports no server path, and a relative import would break commit 9's `no-relative-cross-package` rule. The UI server's use of the kind is covered by the `persona` cases in `packages/ui/src/server/agent-api.test.ts`, including `a draft runs Kyoshi`.

### Commit 7: `select`, the launch token and the Origin check

*   **Add** `packages/agent-api/src/launch.ts` (`LAUNCH_TOKEN_HEADER`, `launchGuard`) and export both from `packages/agent-api/src/index.ts`.
*   **Change** `packages/agent-api/src/app.ts`: `createAgentApi(runtime, options: AgentApiOptions = {})`; new route `.post("/workspaces/:workspaceId/agents/:agentId/select", …, routes.selectAgent)` placed after `stopAgent` (`:49-52`). `schema.ts` adds `selectAgent`. `runtime.ts` adds `select`.
*   **Change** `packages/ui/src/server/agent-api.ts`, `select(workspaceId, agentId)`:
    1.  `path = root(workspaceId)`. `isAgentId(agentId)` or 404 `agent_not_found`. Offered, or 409 `agent_not_offered` ("`<name>` isn't available yet. Choose another coding agent."). Equal to `selected(path)`: return `describe` without stopping anything.
    2.  Serialise per path through `switching: Map<string, Promise<unknown>>`. `connect` and `start` first `await switching.get(path)`.
    3.  If `states.get(path)` has an `endpoint` for the current agent: `await` it (errors ignored). Make `client = new Client({ baseUrl, headers })`. For every record in `read(path)` with `agent === current`, call `client.sessions.attach(id).cancel({ signal: AbortSignal.timeout(5_000) })` without a `turnId`. Eve accepts that as a no-op on an idle live session and returns 409 `session_not_active` for a terminal one, which is ignored (`packages/agent/dist/eve/docs/concepts/sessions-runs-and-streaming.md:344-353`).
    4.  Wait at most `switchSettleMs` (option, default `10_000`) for those sessions to have no open turn. Poll each pending session's `snapshot({ signal: AbortSignal.timeout(2_000) })` (a bounded `follow=false` read) every 250 ms. A turn is open when a `turn.started` event's `data.turnId` has no later `turn.settled` with the same `data.turnId`; a paused turn counts as open. A snapshot that fails with 409 or 410 counts as settled. When the bound passes, log one warning naming the unsettled sessions and continue; step 5 marks them `interrupted`.
    5.  Stop the host: `await state.owned?.close()` and `states.delete(path)`.
    6.  `writeAgent(path, agentId)`, last.
    7.  Return `describe(path, agentId)`.

    No ACP lesson process is cancelled: the composer disables the agent menu while a turn runs (`packages/uix/src/containers/assistant-home.tsx:411`), and after the switch no ACP path resumes the old agent's thread (commit 5).
*   **Change** `packages/ui/src/server/agent-api.ts:152`: `createAgentApi(createLocalAgentRuntime({...}), { authorize: authorizeLaunchRequest })`.
*   **Add** `packages/ui/src/server/launch-token.ts` (`launchToken`, `authorizeLaunchRequest = launchGuard({ token: launchToken, origin: requestOrigin })`). **Change** `packages/ui/src/server/control/routes.ts`: `.get("/launch-token", …)` as specified.
*   **Add** `packages/ui/src/lib/launch-token.ts` (`launchFetch`, `LaunchTokenError`).
*   **Change** `packages/agent-api/src/fixtures.ts`:
    *   `testRuntime` gains `options.agent?: AgentId` (default `"codex"`), a mutable `selected`, and `selections: string[]`.
    *   `agents()` (`:39-42`) becomes `offeredAgents()` with the selected row first, each `{ id, name, selected, status }`.
    *   `start` refuses agents that are not selected (`:46-51`).
    *   `select` validates like the UI server (404 / 409), records the selection, sets `selected` and returns the agent.
    *   New export `testLaunchToken = "test-launch-token"`. Until commit 9 its only browser-side importer, `packages/ui/e2e/agent-chat.fixture.ts`, reaches it through the existing relative import at `:6`.
*   **Tests:**
    *   `packages/agent-api/src/launch.test.ts`:
        *   `accepts the launch token from the same origin`
        *   `accepts a matching token without an Origin header`
        *   `refuses a missing or wrong token with 403 launch_token_invalid`
        *   `refuses a foreign Origin with 403 origin_forbidden`
    *   `packages/agent-api/src/app.test.ts`:
        *   `:43-54` expects the six offered agents, `codex` first.
        *   New `selects a coding agent through the authorized route` (200, `selections` is `["opencode"]`, and the next `POST /sessions` record has `agent: "opencode"`).
        *   New `refuses select without the launch token` (403 `launch_token_invalid`, `selections` empty).
        *   New `answers unknown and not-offered agents on select` (`nope` 404 `agent_not_found`, `pi` 409 `agent_not_offered`).
    *   `packages/ui/src/server/agent-api.test.ts` (select):
        *   `select saves the agent only after the old host has stopped` (the `owned.close` mock checks that `.dojo/runtimes.json` still names `codex`)
        *   `select cancels the old agent's sessions without a turnId and waits at most the switch bound`. A `node:http` fake Eve host records `POST /eve/v1/session/<id>/cancel` and serves a never-settling `turn.started` on the snapshot read; `switchSettleMs: 200`; select resolves after about 200 ms, and both sessions were cancelled.
        *   `selecting the current agent changes nothing`
        *   `select refuses unknown and not-offered agents`
        *   `two selects for one workspace run one after the other`
        *   `connect waits for a switch in progress and starts the new agent`
    *   `packages/ui/src/server/launch-token.test.ts`:
        *   `serves one token per process with no-store`
        *   `refuses to hand the token to another site` (foreign `Origin`; `Sec-Fetch-Site: cross-site`)
        *   `the mounted select route refuses an earlier launch's token`. It calls `app.fetch` on `/api/v1/workspaces/<id>/agents/opencode/select` with a registered temp workspace and `DOJOFOO_HOME` stubbed: a wrong token gives 403 `launch_token_invalid`, and the right one gives 200 and writes runtimes.json.
    *   `packages/ui/src/lib/launch-token.test.ts` (mocked `fetch`):
        *   `retries once with a fresh token after 403 launch_token_invalid`
        *   `throws LaunchTokenError after a second refusal`
        *   `does not retry other 403s`
*   **Change** `docs/designs/agent-runtime.md`: add the D33 row given under "Per-launch token".

### Commit 8: The workspace selector on the lesson, interactive and authoring pages; `agent-selector.spec.ts`

*   **Add** `packages/ui/src/hooks/use-workspace-agent.tsx`:

    ```ts
    export function useWorkspaceAgent(options: { workspaceId?: string; persona: Persona; onSwitched(agentId: string): void }): {
      agents: ComposerAgent[]; selected?: string; switching: boolean;
      request(agentId: string): void;  // opens the confirmation; a no-op for the selected agent
      dialog: ReactNode;               // the confirmation, rendered by the page
      notice: ReactNode;               // role="alert" error text; with "Reload the page" after LaunchTokenError
    }
    ```

    *   It loads `GET /api/v1/workspaces/{id}/agents` whenever `workspaceId` changes. On a failed request or non-JSON body it keeps `agents` empty and shows nothing, so pages whose specs do not serve this route keep working. Agents get name and icon from `codingAgents`.
    *   The dialog (`@dojofoo/ui/dialog`) has the title "Switch this workspace to `<name>`?". The description reads "Kyoshi will use `<name>` for this draft." (Kyoshi) or "Sensei will use `<name>` for every lesson in this workspace." (Sensei). The buttons are "Cancel" and "Switch".
    *   Confirm calls `launchFetch(…/agents/{id}/select, { method: "POST" })`. On 200 it calls `onSwitched(id)` and reloads the list. On another error it shows the response `message` and keeps the agent.
*   **Change** `packages/ui/src/routes/index.tsx` (lesson page): `useWorkspaceAgent({ workspaceId, persona: "sensei", onSwitched })`. The composer (`:840-846`) gets `agents={workspaceAgent.agents}`, `onAgentChange={workspaceAgent.request}` and `agentChanging={workspaceAgent.switching || (!conversationReady && !conversationError)}`. `onSwitched` runs `setHostChatEvents([])`, `setModelNotice("Sensei now uses <name> in this workspace.")` and `setConversationAttempt(n => n + 1)`; the conversation effect refetches `apiBase`, and `getLesson` starts the new agent's thread (commit 5). It renders `workspaceAgent.dialog` and `workspaceAgent.notice` beside `modelNotice` (`:847`).
*   **Change** `packages/ui/src/components/interactive-course.tsx` (`:233-239`): the same, with `onSwitched = () => { void loadConversation(); }`.
*   **Change** the authoring page (`packages/ui/src/routes/authoring.tsx:355-362`): `useWorkspaceAgent({ workspaceId: agentWorkspace.id, persona: "kyoshi", onSwitched })`. `onSwitched` increments a new `agentEpoch` state (part of `AgentChat`'s `key`) and runs `navigate({ to: "/authoring", search: previous => ({ ...previous, session: undefined }), replace: true })`. The remounted `AgentChat` finds no session for the new agent and creates one, which runs on that agent.
*   **Change** `packages/ui/src/components/agent-chat.tsx`: the props gain `agents?: ComposerAgent[]`, `onAgentChange?(id: string): void` and `agentChanging?: boolean`, passed to `AuthoringChat` at `:145` and at the loading state `:87`. **Change** `packages/ui/src/components/authoring-chat.tsx:13-15,42`: the same three props go to `Composer`.
*   **Change** `packages/ui/e2e/agent-chat.fixture.ts` (it keeps its relative import of `../../agent-api/src/fixtures` at `:6`, now also importing `testLaunchToken`, and `launchGuard` from `@dojofoo/agent-api`; commit 9 changes the relative import):
    *   `MountOptions` gains `persona?: Persona`, `agent?: AgentId` and `launch?: { served: string[]; accepted: string }` (default `[testLaunchToken]` / `testLaunchToken`).
    *   `MountedAgentChat` gains `selects: Array<{ agentId: string; token: string | null }>` and `tokenReads: string[]`.
    *   `mount` builds `createAgentApi(runtime, { authorize: launchGuard({ token: () => accepted, origin: () => new URL(baseURL).origin }) })`, serves `**/api/control/launch-token` from `served` in order (repeating the last), and records select requests with their `x-dojofoo-launch-token`.
    *   The `mountAgentChat` fixture receives Playwright's `baseURL`.
*   **Add** `packages/ui/e2e/agent-selector.spec.ts`:
    *   `switching the draft's agent asks first, then Kyoshi's next conversation runs on the new agent`
        1.  Mount (Codex selected) and go to `/authoring?workspace=ws-1&session=<saved>`. The composer's "Agent" button shows Codex.
        2.  Pick menuitemradio "OpenCode". The dialog "Switch this workspace to OpenCode?" shows "Kyoshi will use OpenCode for this draft." Click "Switch".
        3.  `selects` is `[{ agentId: "opencode", token: testLaunchToken }]`; a new record with `agent: "opencode"` appears; the URL `session` is its id; the "Agent" button shows OpenCode; the greeting reply is visible.
    *   `cancelling the switch keeps the agent and the conversation`: no select request, the agent and the URL session are unchanged.
    *   `a lesson opened after a switch runs on the new agent`
        1.  Mount `{ persona: "sensei", workspaceId: "ws-learn", files: false }`. The spec's own `**/api/**` route (passing `/api/v1/` and `/api/control/launch-token` on with `route.fallback()`) serves `/api/control/courses`, `/api/control/learning-sessions/<runId>` and two lesson snapshots whose `harness` is the fixture's current selection.
        2.  Open lesson `first` and switch to OpenCode; the dialog shows the Sensei text.
        3.  The lesson is fetched again and the composer shows OpenCode.
        4.  Open lesson `second` from the sidebar; its composer shows OpenCode, and no request body anywhere names a `harness`.
    *   `a refused launch token is fetched once more and the switch succeeds` (`launch: { served: ["stale", "fresh"], accepted: "fresh" }`; `tokenReads` has length 2; two select requests; the switch completes)
    *   `a launch token refused twice asks to reload the page` (`served: ["stale"]`): the alert "This page is out of date." and a "Reload the page" button are shown, and the agent stays Codex.
*   **Change** `.github/workflows/verify.yml`: the spec list becomes `agent-chat.spec.ts eve-authoring.spec.ts learner-pages.spec.ts workspace-loading.spec.ts agent-selector.spec.ts`.

### Commit 9: Dependency rules (`pnpm lint:deps`)

*   **Change** the root `package.json`: script `"lint:deps": "depcruise --config .dependency-cruiser.cjs packages"`; `devDependencies` `"dependency-cruiser": "18.7.2"` and `"typescript": "6.0.3"` (it must resolve a TypeScript below 7).
*   **Add** `.dependency-cruiser.cjs`. Every named exemption carries a comment with the step that removes it:

    ```js
    const exempt = (...files) => files.map(file => `^${file.replaceAll(".", "\\.")}$`);
    const relativeExemptions = exempt(
      "packages/authoring/src/eve/browser.fixture.mjs",              // loopback: step 8; ui/server/harness/opencode.ts: step 7
      "packages/authoring/src/eve/native-harness-contract.test.ts",  // step 3 deletes the file
      "packages/authoring/src/eve/pi-workspace.test.ts",             // loopback model: step 8
      "packages/authoring/src/eve/runtime-turn.test.ts",             // loopback model: step 8
      "packages/cli/src/teaching-eval.ts",                           // step 7 deletes the file
      "packages/cli/test/learner-notes.integration.test.ts",         // run coordinator and lesson MCP: step 7
      "packages/cli/test/starter-courses.test.ts",                   // permanent: checks starters with the UI's parser
      "packages/evals/src/authoring-continuation.live.test.ts",      // eve/prepare: step 8
      "packages/evals/src/live-course-matrix.ts",                    // codex-client: step 7
      "packages/uix/.storybook/language-api.ts",                     // permanent: Storybook dev server only
    );
    module.exports = {
      forbidden: [
        { name: "no-relative-cross-package", severity: "error",
          from: { path: "^packages/([^/]+)/", pathNot: relativeExemptions },
          to: { dependencyTypes: ["local"], path: "^packages/", pathNot: "^packages/$1/" } },
        { name: "protocol-is-a-leaf", severity: "error", from: { path: "^packages/protocol/" }, to: { path: "^packages/(?!protocol/)" } },
        { name: "harness-imports-no-persona", severity: "error", from: { path: "^packages/(agent|agent-api)/" },
          to: { path: "^packages/(authoring|ui|cli|evals|uix|avatar)/" } },
        { name: "harness-reads-only-agent-installations-from-config", severity: "error", from: { path: "^packages/(agent|agent-api)/" },
          to: { path: "^packages/config/", pathNot: "^packages/config/(src|dist)/agent-installations\\.(ts|js)$" } },
        { name: "agents-below-ui-and-cli", severity: "error",
          from: { path: "^packages/authoring/", pathNot: exempt("packages/authoring/src/eve/browser.fixture.mjs") },   // step 7
          to: { path: "^packages/(ui|cli|evals|uix)/" } },
        { name: "config-depends-on-protocol-only", severity: "error", from: { path: "^packages/config/" }, to: { path: "^packages/(?!config/|protocol/)" } },
        { name: "uix-depends-on-protocol-only", severity: "error",
          from: { path: "^packages/uix/", pathNot: exempt("packages/uix/.storybook/language-api.ts") }, to: { path: "^packages/(?!uix/|protocol/)" } },
        { name: "evals-depend-on-harness-and-agents", severity: "error",
          from: { path: "^packages/evals/", pathNot: exempt("packages/evals/src/live-course-matrix.ts") },   // step 7
          to: { path: "^packages/(ui|cli|uix)/" } },
      ],
      options: {
        doNotFollow: { path: "(^|/)(node_modules|dist)(/|$)" },
        exclude: { path: "(^|/)(node_modules|\\.output|\\.package|\\.eve|\\.runs|\\.turbo|test-results|storybook-static)(/|$)" },
        tsPreCompilationDeps: true,
        enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"],
          extensions: [".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs", ".d.ts"] },
      },
    };
    ```

*   **Change** the remaining relative cross-package imports to package imports, so they need no exemption:
    *   `packages/agent-api/package.json` exports `"./fixtures": "./src/fixtures.ts"`, and `packages/ui/e2e/agent-chat.fixture.ts:6` imports `@dojofoo/agent-api/fixtures`.
    *   `packages/evals/src/authoring-continuation.live.test.ts:9` imports `@dojofoo/authoring/eve/instructions` (exported, `packages/authoring/package.json` `./eve/instructions`). Its `:10` already moved to `@dojofoo/agent/adapters` in commit 3.
*   **Change** `.github/workflows/verify.yml`: add `- run: pnpm lint:deps` right after `- run: pnpm build`, because the rules resolve package imports to `dist`.

## Constraints for this step's plan, one by one

1.  **Agent lists that switch to the registry.**
    *   Commit 4: `registry.ts` and `adapter.ts` (`HarnessKind = AcpAgentId`), `ui/server/agent-api.ts` (`offeredAgents()`), `evaluation/settings.ts`, `server/routes.ts` `/models`, `eve/models.ts`, `setup.ts` `INTERACTIVE_AGENTS`, `cli/src/index.ts`, `evals/full-course-scenario.ts:1`, `authoring-evaluation-settings.tsx`.
    *   Commit 3: `eve/harness.ts` and `local-cursor.ts`.
    *   Commit 2: `ui/lib/coding-agents.ts`.
    *   Commit 7: `agent-api/fixtures.ts:41` (now `:39-42`).
    *   Stay keyed by `AgentId`: `local-state.ts:88-95`, `tracking.ts:88-116`, `cli/src/runtime.ts:10-15`.
2.  **`INTERACTIVE_AGENTS` mapping.** A filter (commit 4). The three existing ids, with names from the registry and ordering kept for `packages/cli/test/smoke.test.ts:141-142`. No new `AGENTS` entries, because cursor, fx and grok have no skill directory.
3.  **Every importer of `resolveRuntimeHarness`, and every test that sets the removed variables** (commit 4).
    *   The importers the design names: `cli/src/index.ts:18,89-90`, `authoring/src/eve/runtime.ts:8,53`, `ui/src/server/agent-api.ts:6,45`, `ui/src/server/interactive/conversation.ts:5,32,54`, `config/src/runtime.test.ts` (deleted), `cli/src/runtime.ts:26`.
    *   Importers found beyond the design's list: `ui/src/server/lesson/service.ts:2,266,628`, `authoring/src/server/service.ts:135,451`.
    *   The tests the design names: `authoring/src/eve/runtime.test.ts:13`, `runtime-turn.test.ts:66` (the design said `:64`), `ui/src/server/lesson/service-state.test.ts:80,126-219`, `ui/src/server/agent-api.test.ts:34-115`, `authoring-handoff.test.ts:83`.
    *   Tests and scripts found beyond the design's list: `cli/test/runtime.test.ts:7,17,33`, `cli/test/tracking.test.ts:14`, `cli/test/teaching-eval.test.ts:29,39,50,60,74,90`, `authoring/src/eve/harness.test.ts` (moved), `harness-lifecycle.test.ts:27`, `ui/src/server/harness/adapters.test.ts:12,113,126`, `ui/src/server/lesson/codex-client.test.ts:429-431`, `ui/src/server/lesson/service-state.test.ts:8,147-159,204-227,459`, `evals/src/authoring.ts:30`, the four scripts, the live tests and the evals.
    *   The variables, named exactly: `DOJOFOO_HARNESS`, `DOJOFOO_LESSON_HARNESS`, `DOJOFOO_AUTHORING_HARNESS`, `DOJOFOO_MODEL`, `DOJOFOO_LESSON_MODEL`, `DOJOFOO_AUTHORING_MODEL`.
4.  **No test-mode agent variable; the scripts seed runtimes.json.** Commit 4: `verify-lesson-runtime.mjs:57-62,85`, `verify-interactive-runtime.mjs:23-27,45`, `test-packed-ui.mjs:68-80` and `browser.fixture.mjs:67-70,89-92`. The design's "Workspace agent selection" is rewritten in commit 4.
5.  **Both ACP paths stop resuming the old agent's thread** (commit 5).
    *   Lesson: `getLesson` `:180-210`, `:264` and `:266`; `lessonThread` `:628-630`; `startLessonSession` `:715-731`; `defaultHarness` `:36,904,920`.
    *   Interactive: `session` `:105-106`, `getInteractiveConversation` `:52-53`, `setInteractiveModel`, `answerInteractiveSensei` and `selectInteractiveHarness`.
6.  **Which turns `select` cancels, and the wait bound** (commit 7). A cancel without `turnId` for every record of the old agent in the workspace, then bounded snapshot reads (`follow=false`) for at most 10 seconds (`switchSettleMs`). The selection is saved last, after the host stops.
7.  **The "Trial agent" menu and `?harness=`** are removed in commit 5 (`authoring.tsx:75,320,481-483`; the route's `harness` branch at `lesson/routes.ts:56-71`; `startLessonSession`'s `harness` parameter, which forced a thread at `service.ts:715-731`).
8.  **The Kyoshi selector.** Commit 8: `AgentChat` and `AuthoringChat` gain `agents`, `onAgentChange` and `agentChanging`. The authoring page calls `select` for the draft workspace after confirmation.
9.  **Model discovery until each method lands** (commit 4). Claude Code shows the CLI aliases. Codex, OpenCode and Pi keep `native`. FX, Cursor and Grok return `[]`, and the input says "No models listed; the agent's default is used".
10. **Which agent evaluation teaches on** (commit 4). The trial's agent, the draft's, through `resolveAgent`. `host.ts:41` no longer sets `DOJOFOO_HARNESS`. `teaching-eval.ts` resolves `lessonAgent(root)` and passes it through `runAuthoringHandoff` into `createLessonTrial`.
11. **Adapter move** (commit 3). `packages/agent` gains the `@ai-sdk/harness-*` dependencies (Pi moved from `devDependencies`, `package.json:598`), `@dojofoo/protocol`, `@dojofoo/config`, and a Vitest runner in its `test` script. The tests at `cursor-acceptance.test.ts:4` and `local-cursor.contract.test.ts:2` move to `packages/agent/test/`.
12. **`run.mjs` packs protocol.** Commit 2 adds `protocol` to the `pnpm pack` loop (`:52`), which fills `localPackages`. Commit 3 packs agent with `pnpm pack` (one object, absolute `filename`, `:46-51`) and reads Pi from `dependencies` (`:24`).
13. **Protocol's build** (commit 1). `.js` import extensions; declarations and JS emitted to `dist` by `tsc -p tsconfig.build.json` (NodeNext); exports point to `dist`.
14. **`lint:deps` relative-import failures.** Commit 9. The loopback model is not exported from `packages/agent`: it lives in `experiments/`, which the package's `files` field does not publish, so an export would be broken in the packed CLI. Each file is exempted by name with its removal step instead, `browser.fixture.mjs:10` and `authoring-continuation.live.test.ts:9,11` included. The probe found more relative imports than the design listed (`teaching-eval.ts`, `learner-notes.integration.test.ts`, `starter-courses.test.ts`, `live-course-matrix.ts`, `.storybook/language-api.ts`, `agent-chat.fixture.ts`); each is exempted or fixed above.
15. **The session API test runtime.** Commits 6 and 7: the fixture workspace's persona is `kyoshi` unless `options.persona` says otherwise. `select` validates, records, switches `selected`, and returns the agent.
16. **403 `launch_token_invalid`.** Commit 7: fetch the token again once and retry, then "Reload the page"; the D33 row is added.

## Gate

From a clean `pnpm install --frozen-lockfile`:

*   `pnpm build`, then `pnpm -r --if-present types:check`.
*   `pnpm lint:deps`.
*   `pnpm --filter @dojofoo/protocol test`, `pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'`, `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'`, `pnpm --filter @dojofoo/agent test`, `pnpm --filter @dojofoo/agent-api test`, `pnpm --filter dojofoo test`, `pnpm --filter dojofoo test:package`.
*   Specs: `pnpm --filter @dojofoo/ui exec playwright test agent-chat.spec.ts eve-authoring.spec.ts learner-pages.spec.ts workspace-loading.spec.ts agent-selector.spec.ts`, against the built UI as `verify.yml` starts it.
*   `pnpm --filter @dojofoo/ui test:lesson` and `pnpm --filter @dojofoo/ui test:interactive` (OpenCode seeded in `.dojo/runtimes.json`).
*   The named tests, by package:
    *   select: `packages/ui/src/server/agent-api.test.ts` and `packages/agent-api/src/app.test.ts`
    *   persona: the same two files
    *   kind: `packages/cli/test/local-state.test.ts`, `packages/ui/src/server/startup.test.ts` and `packages/ui/src/server/control/routes.test.ts`
    *   launch token: `packages/agent-api/src/launch.test.ts`, `packages/ui/src/server/launch-token.test.ts`, `packages/ui/src/lib/launch-token.test.ts` and the two token cases in `agent-selector.spec.ts`
    *   master copy: `packages/cli/test/ui.test.ts`
    *   switch after a lesson: `packages/ui/src/server/lesson/service-state.test.ts`

The final `verify.yml` diff:

*   `pnpm --filter "@dojofoo/config..." build` (commit 2)
*   `pnpm --filter @dojofoo/protocol test` (commit 1)
*   `pnpm lint:deps` after `pnpm build` (commit 9)
*   `agent-selector.spec.ts` appended to the spec list (commit 8)

## Decisions made in this plan

1.  **`offeredAgents()` is `acp: true` in steps 2-4; the row has no conformance field yet.** The roadmap fixes the offered set for these steps. Step 3 creates the record file and step 5 switches `offeredAgents()` to it, so a field that nothing writes would be dead data now.
2.  **The Cursor row resolves `cursor-agent`.** The Cursor installer provides both names, and `agent` is also Grok's on this machine. The bootstrap wrapper the adapter runs keeps the name `agent`.
3.  **The harness may import `@dojofoo/config/agent-installations`, and nothing else from config.** `local-cursor` needs the shared executable lookup, and copying that lookup into the harness would create a second inventory. The lint rule `harness-reads-only-agent-installations-from-config` enforces the limit.
4.  **Read-only built-ins are file tools only** (read, list, search). Web, MCP, skills and the native question tools are left out: Sensei uses Eve's `ask_question` and the host-port tools. Codex has no read-only file tool, so its list is empty. Step 3 verifies these lists and step 4 consumes them.
5.  **`resolveAgent` returns only offered agents, and the last fallback is OpenCode.** No page can handle `agent_not_offered` before step 4. OpenCode is today's default (`runtime.ts:35`). The global `~/.dojofoo/runtimes.json` is no longer read, because the design's precedence leaves it out.
6.  **`@dojofoo/config/runtime` keeps its module path.** Only the functions change, so the tsup entry, the exports and the packed layout stay as they are.
7.  **Config and UI tests that must gate run in `packages/cli/test`.** `packages/config` has no test script. Adding one would turn on unreviewed old tests; the CLI suite already tests config this way.
8.  **The ACP lesson path starts the new agent's thread inside `getLesson(prepareSession)` when the stored thread belongs to another agent.** The lesson socket and Check need a session id (`index.tsx:414-417`, `packages/ui/server/routes/api/session.ts:26`). Starting a thread sends no prompt and costs no model call, as the old `changeAgent` did through `POST …/sessions`. It applies only when the route's course is the current course, because `lessonThread` keys threads by the current course.
9.  **`select` cancels no ACP turns.** The menu is disabled while a turn runs (`assistant-home.tsx:411`), and no ACP path resumes another agent's thread after commit 5. ACP is deleted in step 7.
10. **`selectInteractiveHarness` and `PUT /configuration/harness` stay until step 4, limited to the selected agent.** Step 4's Deletes list them. `onModelPrepare` still needs them to prepare the session.
11. **The evaluation settings pickers stay until step 7.** The teacher choice no longer picks the teaching agent, and the teacher model applies only when it names the draft's agent. Step 7 edits those specs (`eve-authoring.spec.ts:385-505`), and the dialog says which agent teaches.
12. **`eve-authoring.spec.ts`'s Trial assertion (`:526-539`, `?harness=codex`) is edited in step 2, not step 6.** Step 2 removes `?harness=`, and that spec is in step 2's gate. The design's step 6 bullet about `:582` then has nothing left to edit.
13. **Live tests and evals pick their agent with `DOJOFOO_EVAL_AGENT`** (next to `DOJOFOO_EVAL_MODEL`). The two live tests that call the adapter directly switch in commit 3, when `authoringHarness()` disappears. The eval runner (`evals/src/authoring.ts`) switches in commit 4, when the Kyoshi runtime stops reading the variable, and it writes the agent to its scaffold's runtimes.json. They are eval parameters, not a product selection, and the UI server never reads them.
14. **Workspace kind: new rows default to `learner`; `NULL` marks only rows from before the migration.** Only a `draft` registration changes an existing row. The backfill runs once per UI-server start in a Nitro plugin, and `workspaceKind()` applies the same rule when a row is still `NULL`. Deleting a draft and listing drafts both use the kind.
15. **Token errors: 403 `origin_forbidden` for a foreign Origin (no browser retry), 403 `launch_token_invalid` for a bad token (one retry).** Our own pages never send a foreign Origin, so `origin_forbidden` needs no D33 row. A missing `Origin` is allowed with a valid token, as in the existing control routes.
16. **`HarnessKind` stays as an alias of `AcpAgentId` until step 7 deletes `packages/ui/src/server/harness/`.** This leaves its many importers untouched while the type now comes from the registry.
17. **`LessonSnapshot.harnesses` and `InteractiveConversation.harnesses` stay**, holding the ACP ids. Step 7's constraint states the final snapshot shape, and the pages stop reading the field in commit 5.
18. **The evals matrix is `[...acpAgentIds, "pi"]`, so Claude Code joins it.** Pi keeps its own driver, and every other entry is an ACP agent, so `LiveAcpCourseDriver` takes `AcpAgentId`. Claude Code is an offered ACP agent, so leaving it out would be a hand-written exception; the contract test gains one cassette case with no inference.
19. **The master-copy test checks the persona through `personaForKind` on the registered kind, not through the UI server's runtime.** The UI package exports no server path, and a relative import would break the dependency rules. The runtime's kind-to-persona step has its own tests in `packages/ui/src/server/agent-api.test.ts`.
20. **Review finding D was partly wrong about `tracking.ts`.** `findSourceForAgent` (`tracking.ts:88`) is typed with `AgentName`, but that `AgentName` is the local alias `type AgentName = RuntimeName` (`tracking.ts:13`), not the skill-install `AgentName` from `commands/setup.ts:18`. `RuntimeName` is `AgentId | "unknown"`, so the list is already keyed by `AgentId`, and the plan's statement stands; only the citation is clarified. The other line fixes in finding D were correct and are applied.
21. **`service-state.test.ts` changes are split between commits 4 and 5.** In commit 4, the two tests that depend on the variable (`:147-159`, `:204-227`) are deleted or rewritten so they pass under both commits' behaviour. In commit 5, the two tests that use the removed `harness` parameter (`:124-136`, `:138-145`) are deleted, and the new switch tests are added.
22. **(Implementation) A removed variable warns once per variable per process, the first time `resolveAgent` sees it set**, instead of only on the first call. The output is the same when the variables are set at startup, and a variable set later (a test's `vi.stubEnv`, or a caller passing its own `environment`) is still reported once, which `agent-selection.test.ts` relies on.
23. **(Implementation) In commit 4, `selectInteractiveHarness(root, dojo, "pi")` answers "Select a supported coding agent."** `isAcpAgentId` replaces `dojofooHarness`, whose Pi-specific message is gone, so `interactive/conversation.test.ts:167` expects the new text until commit 5 changes the check to the workspace's agent.

## Open questions for the user

None. The design leaves nothing in step 2 to the user. Every gap found while planning is decided above.
