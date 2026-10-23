# Course layout production work

Status: installation and trial layout implemented; role-runtime adoption incomplete.

## Layout

```text
author-course/
  dojo.yaml
  DOJO.md
  chapters/<chapter>/README.md
  chapters/<chapter>/lessons/<lesson>/{README.md,SENSEI.md,kata.*,kata.test.*}
  .dojo/kyoshi/                  author-only definitions
  .dojo/sensei/                  published teaching definitions

learner-repository/
  courses/<installation>/       visible material, learner edits, YAML progress
  .dojo/config.yaml             workspace selection
  .dojo/state/.gitignore        installed before private data
  .dojo/state/<installation>/   starter baselines and installation digest

system-temp/dojofoo-trial-*/    disposable, independent learner workspace
```

Chapter and lesson READMEs are optional learner material. SENSEI.md is teacher guidance. Chapter lessons use course-wide stable IDs; template paths remain course-relative and inside their chapter.

## Implemented and checked

- Shared chapter parsing for installation, lesson resolution and authoring discovery.
- Authors publish through Git. There is no custom archive publisher or automatic secret scanner. Authors own ignore rules and review tracked/outgoing files before pushing.
- Installation into visible `courses/`, with no generated root package.json, tsconfig.json or dojo.config.ts.
- Independent YAML progress for two installed courses, tested through real Node lesson checks.
- Trials use the same visible layout in system temp. Internal file links are materialized; external/private links are rejected. Draft files remain unchanged.
- Local installs, Giget downloads and trials use Globby's nested Git ignore rules. Dojo-specific exclusions remain for runtime state and authoring definitions; no hardcoded secret-filename classifier remains.
- Normal installs exclude Kyoshi. `add --master` retains authored Kyoshi definitions, respects ignore rules, and preserves license files. Updates retain the installation mode. This copies editable sources, not a remote Git fork or a license grant.
- Authoring loads an installed `.dojo/kyoshi/` directly through Eve. Its instructions, tools and skills are authoritative. Missing host defaults are filled without overwriting authored modules; generated connection bindings live under ignored `.eve/`. Definitions remain portable across installations, without a local package manifest or dependency directory.
- Updates stop when the installed publication content differs from its saved installation digest. Unchanged updates preserve YAML progress. No automatic merge of learner changes is attempted.
- Private state gets its own Git ignore rule before creation; verified with a real Git repository.

## Cleanup decisions

Removed:

- Root JavaScript/TypeScript workspace generator and its config/welcome templates: the course owns its language/toolchain; installing a course must not turn the learner repository into a JavaScript app.
- Duplicate `katas/<lesson>` trial copy: the trial's installed course contains the editable exercise already.
- Hardcoded `.dojos` lookups in UI lesson, interactive, project and control services: use the shared resolver instead.
- Separate directory enumeration in update: use shared course discovery.
- Custom `pack` command, its archive-only regression and direct `tar` dependency: publication uses Git and acquisition already uses Giget.
- Duplicated secret/configuration filename lists in copy filters and authoring file access: authors declare exclusions in `.gitignore`, interpreted by Globby. Update protection still considers ignored local files so it cannot silently delete them.

Retained deliberately:

- Legacy `.dojos` and `.dojorc` readers/writer: existing installations still use them. Removing them before an explicit migration would hide courses/progress. New clean installations do not create them.
- Existing ACP learning runtime and the generated Kyoshi fallback for courses without `.dojo/kyoshi`: installed master definitions now use the manifest-free Eve path, but Sensei runtime migration and legacy session migration are separate remaining work. Removing those paths now would break working teaching/authoring.
- Legacy learner `katas/` resolution and TypeScript integration: needed by existing legacy workspaces, not by new course installations.
- Existing state/session readers: not yet migrated to `.dojo/state`; no silent deletion or speculative relocation.

## Required before declaring the whole goal done

- Adopt manifest-free `.dojo/sensei` through production teaching, and migrate the generated Kyoshi fallback/session locations. Installed `.dojo/kyoshi` role loading is implemented without replacing authored definitions.
- Put durable runtime state in the ignored state boundary while preserving role definitions as publishable source.
- Verify custom Sensei tools/skills through actual production teaching and trial sessions. Installation preservation alone does not prove execution.
- Add chapter creation/editing to authoring operations and grouping to the UI. Discovery already supports chapters; lesson creation still follows the legacy flat template.
- Support a standalone author course as a normal learning workspace, not only installed courses.
- Define expired-trial cleanup and friendly resume errors; trials currently live until system/temp cleanup.
- Extend migration coverage before retiring legacy paths.
- Broaden installed-package acceptance to the full browser journey and other harnesses. The built-CLI journey and packed startup below do not establish cross-harness reliability.

No paid model calls are needed for these structural regression tests.

## Master authoring acceptance (2026-10-23)

- The browser test installs a master into a fresh temporary learner workspace with the built CLI, then starts `ui --authoring` from that installed course. It uses the production UI and explicitly unsets `NODE_PATH`.
- Course-owned instructions and a custom question tool reach the real Eve/OpenCode runtime. Questions survive a server restart; queued messages and a new message after refresh reach durable history.
- Two lessons are edited through Monaco. An isolated trial fails checks, passes after an edit, supports review, advances to the next lesson and resumes after another restart. The author's exercise stays unchanged.
- A separate plain-Node regression boots the retained Kyoshi without monorepo module paths. Packed CLI installation and HTTP startup also pass.
- Inference is scripted locally. This verifies integration behavior, not teaching quality, every harness or the published npm release.

The reconnect observer now uses Eve's public session stream (60 → 20 LOC). The existing TanStack patch adds four source lines to drain queued messages after a successful rejoin; its regression reproduces the failure through the public chat client and HTTP transport.
