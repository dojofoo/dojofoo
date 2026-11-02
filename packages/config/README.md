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

Use `~/.dojofoo/runtimes.json` for global defaults, or `.dojo/runtimes.json` in a workspace to override either role:

```json
{ "authoring": "pi", "lesson": "codex" }
```

Precedence: agents selected during setup → global → project → `DOJOFOO_HARNESS` → role-specific `DOJOFOO_AUTHORING_HARNESS` / `DOJOFOO_LESSON_HARNESS`. The same selected harness can be used for authoring and lessons. An explicit runtime selection in the UI takes priority and stays with that conversation. New conversations read the configuration again. Existing conversations retain their own harness.

Pi supports authoring. Lesson trials currently require Codex, OpenCode, Cursor, Grok or FX. These settings select installed harnesses; credentials remain in their native login stores.

### Learner introductions

Courses use `README.md` at the course root (plain Markdown, not `README.mdx`). Every chapter and lesson directory requires `INTRO.md` or `INTRO.mdx`. `courseContent(root, manifest)` resolves these files and reports missing/empty entrypoints; `ensureCourseContent` creates missing files during scaffolding while preserving existing prose and MDX. `DOJO.md` and `SENSEI.md`/`.mdx` remain teaching guidance. YAML contains curriculum identity, metadata, paths and order. Missing introductions fail deterministic authoring readiness/preflight before evaluation.
