# @dojofoo/ui

Shared Dojofoo UI components and the local lesson server.

## Routing and navigation

The local app (`packages/ui/src/routes`) and website (`apps/web/src/routes`) each
own a TanStack file route tree and router. Generated `routeTree.gen.ts` files are
outputs; edit route files instead. UIX owns shared presentation, including the
sidebar, site header, course cards and docs chrome. Each app passes its TanStack
`RouterLink` to `UIXProvider`; UIX's `NavigationLink` delegates internal links to
that adapter. Storybook keeps its in-memory callbacks without depending on an
application's route tree.

Use TanStack `Link` for links and `useNavigate` for explicit actions such as
installing a course or selecting a command-palette result. Let the router push
history, preload and restore scroll. Do not replace the current entry when
background requests create or refresh agent conversations; persist those in the
local store. `replace` is reserved for deliberate redirects.

Local `/course/<course-id>` shows Details for an uninstalled course and redirects
to its durable `/learn/<run-id>` once installed (`/learn/<run-id>?lesson=<lesson-id>` for a kata
lesson). The run resumes the saved lesson and slide; Courses cards expose that position and measured progress.
Explore features only uninstalled courses; installed results offer Continue.
Native conversation IDs remain server state.
The website's `/courses/<source>/<slug>` is its public course page. The dashboard sidebar contains global navigation. The course sidebar contains
course sections only, matching UIX `CourseWorkspace` in `pages/learner.tsx`; its
Dashboard breadcrumb returns to the library. Lesson/material controls change
state within the current run.

The learn route loads its course and initial lesson through TanStack before
committing navigation, so the transition captures the populated course sidebar
and workspace. Native agent startup remains separate and asynchronous.

Route transitions are configured once through each router's
`defaultViewTransition`. UIX's state-transition helpers are for drawers, themes
and other in-place changes, not another wrapper around route navigation. Embedded
Slidev decks use `routerMode: memory`: slide changes must never add entries to the
browser's joint history. The local router also names its nested scrolling panels
for TanStack scroll restoration.

References: [navigation](https://tanstack.com/router/latest/docs/guide/navigation),
[custom links](https://tanstack.com/router/latest/docs/guide/custom-link),
[view transitions](https://tanstack.com/router/latest/docs/framework/react/examples/view-transitions),
[scroll restoration](https://tanstack.com/router/latest/docs/guide/scroll-restoration).

## Authoring composition

Authoring has one Course root with its source files and a live UIX
`AuthoringCourseCard`, followed by Chapters containing their lessons and files.
Legacy flat lessons remain a Lessons section until the author defines chapters.
The Evals navigation item opens the shared Storybook evaluation panel inside the
workspace as a preview; existing lesson evaluation reports remain available.
The card and its color control use manifest metadata supplied by the authoring
API, and watcher refreshes keep the card current while preserving unsaved edits.

## Agent boundary

Sensei and Kyoshi run on Eve: each workspace's persona host is a prepared Eve
application whose model is the AI SDK harness model over the workspace's coding
agent, through that agent's official AI SDK harness adapter. The UI server owns
the session API under `/api/v1` (session records, the default conversation of a
page, and a session's Eve routes) and the host port the persona hosts call back
into. Eve owns each conversation and its history; the browser reads them through
Eve's client on the session's routes.

## Running

```bash
pnpm install
pnpm --filter @dojofoo/ui dev
```

Normally the packaged CLI starts it with `dojofoo ui`.

## Verification

```bash
pnpm --filter @dojofoo/ui types:check
pnpm --filter @dojofoo/ui build
pnpm --filter @dojofoo/ui exec vitest run
```

## License

FSL-1.1-ALv2.

Authoring keeps one course with a renameable Default chapter. The Chapters tree owns each chapter’s lesson list and New lesson action; New chapter appends to this course. Flat manifests become chapter manifests when split, retaining existing lesson IDs and paths. Learner sidebars show chapter headings only for courses with multiple chapters. File tabs switch without view transitions; the course row’s ellipsis menu contains the file filter.

The official authoring sidebar and its Storybook sandbox use the shared `CourseAuthoringSidebar`. Course files are at root, then Chapters → numbered chapters → numbered lessons. Course README.md and chapter/lesson INTRO.md(x) are first-class content files. Extra files are classified by the authoring service, hidden by default, and shown at 50% opacity with muted icons when Show all files is enabled. Chapter/lesson names support double-click and Rename menus; tabs switch without page transitions.
