# Manifest-free Dojo project POC

Prove local Eve-style role definitions without a course-local package manifest,
dependency installation or symlink. This is an experiment, not a UI migration.

## Layout and ownership

```text
course/
  DOJO.md
  src/001-double/{SENSEI.md,kata.mjs,kata.test.mjs}
  .dojo/kyoshi/{agent.ts,instructions.ts,tools/,sandbox/,.eve/}

isolated-trial/
  DOJO.md
  SENSEI.md
  kata.mjs
  kata.test.mjs
  .dojo/sensei/{agent.ts,instructions.ts,tools/,sandbox/,.eve/}
```

- Definitions are ordinary Eve files. JavaScript and TypeScript compile as ESM.
- Installed `@dojofoo/agent` supplies package imports. No course package manager
  or ancestor `node_modules` is needed. Unknown packages fail resolution.
- Shared authored-module cache: `~/.dojo/cache/authored-modules`, with the existing
  `DOJOFOO_HOME` override supported. Dependencies stay in the CLI/package
  installation; this POC does not create another global dependency installation.
- Eve owns each role's local `.eve` events, questions and resume state.
- Kyoshi mounts the actual course. Sensei mounts a separate trial copy, including
  the course guidance and the selected lesson's SENSEI. History is not copied.
- Start with existing `createDevelopmentServer(roleDirectory, { resume: true })`.
  No replacement agent loop, session store, CLI command or custom module loader.

## Proven missing hooks

The first outside-repo fixture failed at Eve's package-root lookup. The next
real-host fixture completed a turn but caught generated `node_modules`, a
symlink and a manifest in Eve's development snapshot. Removing those exposed a
remaining bare `eve` runtime import. These were failures, not passing gates.

The experimental patch is restricted to `.dojo/kyoshi` and `.dojo/sensei`:

1. Recognize those role directories as application roots.
2. Resolve authored imports against the shipped installation, keeping package
   imports absolute in generated modules and caches outside the course.
3. Bound source snapshots to the role, without synthesizing a package manifest
   or mounting package links. Ordinary Eve application behavior stays unchanged.

Implementation: one small package helper and hooks in six pinned Eve files.
Consumers do not apply patches; the existing release assembly embeds it.

## Verification

```sh
# Node 24; no model credentials or paid inference required
pnpm --dir packages/agent build
node --test packages/agent/experiments/model-provider/manifest-free-project.test.mjs
node packages/agent/experiments/model-provider/packaging.mjs
```

The fixture runs outside the repository. It recursively rejects every local
`package.json`, `node_modules` and symlink, including inside `.eve`. Both roles
compile and run real Eve HTTP/workflow/tool handling through the official
HarnessAgent-backed provider. Questions resume after host restart with the same
native session ID and one answer. Role histories are distinct. Actual Node tests
fail on the trial stub and pass after a simulated learner edit; draft code stays
unchanged. The packaged-consumer run tests the shipped artifact, not source aliases.

Verified on 2026-10-21: packed consumer 77/77 passing (including both POC tests);
existing authoring preparation/runtime tests 9/9 passing; agent typecheck and
`git diff --check` passing. No paid inference, commits or pushes.

## Limits

- Inference/native storage use the existing deterministic fixture adapter. This
  proves orchestration, not teaching quality or native adapter matrix parity.
- Trial copying in this fixture is deliberately minimal; production trial safety
  and the learning UI remain on their existing path. No production Sensei migration.
- No automatic installer, global update mechanism, arbitrary third-party package
  support or authoring UI toggle is introduced. Installed-version selection remains
  the launcher's responsibility.
- The experimental hook needs review before making this the default layout.
