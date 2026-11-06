# @dojofoo/config

Shared configuration and Vitest integration for [dojofoo](https://dojo.foo).

Most users do not install this package directly. Set up dojofoo in a project instead:

```sh
npx dojofoo install
```

See the [documentation](https://dojo.foo/docs) to create or use a dojo.

## Course cards and chapters

Course card choices live in the manifest alongside its metadata:

```yaml
appearance:
  color: "#3677C9" # Exact color from the UIarc picker; hue remains a legacy fallback
  shader: waves # topography, network, waves, or opal
```

The SDK validates these fields. Authoring's course API patches them in the same
manifest while preserving comments; the file watcher refreshes the shared card
when an author or agent edits metadata. UIX owns the card's brief transition.
Chapters use the existing `chapters` curriculum: each chapter has an `id`, `title`,
`path`, and `lessons`. The authoring API preserves chapter ownership when adding
or renaming lessons, and derives its sidebar data from this curriculum.

## Harness defaults

Agent definitions live in the browser-safe `@dojofoo/config/agents`
catalog. `@dojofoo/config/agent-installations` owns executable discovery and runtime
PATH setup. It checks executable files in PATH, configured overrides and supported
installation directories without running agents. The CLI, API and native runtimes
use this same resolver; the UI renders the API inventory and has no scan controls.

Each workspace has one coding agent, for authoring and lessons alike. `@dojofoo/config/runtime` reads it with `resolveAgent(root)` and saves it with `writeAgent(root, agent)`, which keeps the file's other keys:

```json
{ "agent": "codex" }
```

`resolveAgent` returns an offered agent. Precedence, highest first: the workspace's `.dojo/runtimes.json` `agent`; the first offered agent in `~/.dojofoo/settings.json` `agents` (chosen at setup); the first offered agent whose CLI is installed; OpenCode. A saved agent that isn't offered is skipped with a warning, and the old `authoring`/`lesson` keys are ignored with a warning. The composer's agent menu writes the selection; credentials remain in each agent's native login store.

### Learner introductions

Courses use `README.md` at the course root (plain Markdown, not `README.mdx`). Every chapter and lesson directory requires `INTRO.md` or `INTRO.mdx`. `courseContent(root, manifest)` resolves these files and reports missing/empty entrypoints; `ensureCourseContent` creates missing files during scaffolding while preserving existing prose and MDX. `DOJO.md` and `SENSEI.md`/`.mdx` remain teaching guidance. YAML contains curriculum identity, metadata, paths and order. Missing introductions fail deterministic authoring readiness/preflight before evaluation.
