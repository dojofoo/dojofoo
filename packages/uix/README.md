# UIX

The successor UI library and page-design preview. The live learning/authoring app
has not been switched to these page fixtures.

Production entry points are `@dojofoo/uix/provider`, `fonts.css`, `styles.css`,
`web/site`, `web/landing`, `web/learning-preview`, `web/courses`, `web/course`, `web/catalog`,
`docs/layout`, and `docs/content`, alongside the shared components/containers.
The website and local runtime share `UIXProvider` with Storybook. Leave its
`mode` unset when an application theme provider already owns light/dark mode.
Import `fonts.css` with the UIX stylesheet when adopting the UIX page design.
The website registers `documentTransitionScript` from `lib/view-transition` in a
synchronous head script: document lifecycle events may fire before React hydration.
This handles expected animation aborts while reporting other transition failures.

The documentation frame takes its controlled path and compiled TOC from the host;
keep it mounted while the application swaps its compiled MDX content. Stories use
the same frame with their own explicit navigation and Markdown projection.

Applications supply course data, navigation/search adapters, compiled MDX and
prepared OpenAPI props. The API renderer requires its document explicitly;
generated schema lookup belongs to `src/stories/fixtures/api-reference.tsx`.
Raw docs projection, simulated catalog data, search and the demo website router
also live in `src/stories/fixtures/`. The page demos remain previews, not local
runtime controllers. Do not mount their simulated conversations in production.

Brand/agent graphics used by UIX are library assets, available through
`@dojofoo/uix/assets/*`. The root `assets:logo` script updates its generated
brand SVG together with the existing website/local copies during migration.

- `components/`: installed UI primitives and presentational compositions. Internal
  interaction state is fine; no course persistence, network orchestration or page controllers.
- `containers/`: Monaco lifecycle/language services, video cues, setup and chat orchestration.
- `pages/`: the learner and authoring page compositions with local demonstration data.
- `templates/`: reusable layout/theme sandbox.
- `styles/`: the shared stylesheet, editor overrides, typography and CSS-derived corners.
  `styles/themes/` owns each light/dark palette and its overrides.

Use Tailwind radius tokens for surfaces. Custom CSS radii use `--squircle-factor`;
`all: unset` must restore `corner-shape: inherit`. Hover/selected edge layers inherit
their surface's radius. Circles/pills use `rounded-full` or explicit `corner-shape: round`.
- `archive/`: preserved animated controls, particles and sound. Original AffectUI
  screen examples remain under **Archive** in Storybook, not the product page list.

`pnpm --filter @dojofoo/uix storybook` serves <https://ui.dojofoo.td> through Portless.
Storybook contains seven product pages under **Pages**, plus Templates, Components
and Archive. Materials is deliberately absent. Page data, chat replies and eval
results are previews, not a live server or paid inference.

Components are grouped into Atoms, Molecules and Organisms. The Editor organism's
Playground combines language-highlighted file tabs, edit/save/undo, coverage and
failure marks, line references and a separate Test results tab with sample failure
details. The learner preview also has a Test results tab.
Test output uses AffectUI's clean data table with themed status marks in place of
selection checkboxes, no header/footer, and Shiki-highlighted Markdown failures.

Install AffectUI components with `pnpm --filter @dojofoo/uix ui:add @affectui/<name>`.
Varlock loads `AFFECTUI_TOKEN` from the 1Password reference in `.env.schema`; the
token is never stored in the repository. Unlock the desktop app when prompted.

The left sidebar has a fixed width and retains its collapse/expand control.
UIarc resizable panels control the editor/chat split: drag the divider or use
its arrow keys to resize; double-click resets the split.
Narrow screens retain the sidebar and conversation drawers.
The editor toolbar toggles desktop chat. Settings use the same right-hand pane,
so resizing either view keeps its width when switching, hiding, or restoring chat.

In Storybook development, `/uix-language` uses the original UI's TypeScript language
service for diagnostics, completion and JSDoc hovers, including examples and links.
Learner and authoring stories use its hover endpoint as well. Static Storybook
builds need a running language API: set the editor's `lessonApiBase` or
`documentationUrl`, or the page's `documentationUrl`, to that service.

The video uses the installed `@videocn` player (native, YouTube and Shaka engines).
Slides embed a real hosted Slidev build; change `slideSource` to a course's own deck.
The Slidev fixture is built locally before Storybook starts, with the editor's Shiki
themes and local fonts. Rebuild it with `pnpm --filter @dojofoo/uix slides:build`
after changing `fixtures/slides.md`. External video fixtures require internet access.

Monaco ships its workers and grammars locally. The current UI re-exports these
helpers from UIX, so syntax themes and language-service behavior have one owner.
Configure `lessonApiBase` and/or
`documentationUrl` to connect the copied language-service contract: diagnostics,
completion and safely rendered JSDoc/signatures/examples/references. With no API,
the editor still supports syntax colors, editing/undo, coverage/failure marks,
line highlights, per-theme schemes, scrolling and keyboard save callbacks.

Verification: `pnpm --filter @dojofoo/uix types:check`, `test`, `storybook:build`.
With Storybook running, browser checks: `pnpm --filter @dojofoo/uix test:browser`.

Avatar → Settings opens the installed AffectUI settings page, with onboarding
appearance controls replacing Billing. Storybook and the TanStack website share
native view-transition styles: themes fade, navigation moves the main content,
and side panes enter from their respective edges. Content settings emerge from
behind the main window toward the right, then return underneath it. Reduced
motion uses fades.
Local tabs and segmented selections do not start document transitions. Selection
menus reuse the avatar dropdown’s styling, focus handling and keyboard controls.
Website search reuses the Dojo command palette, with Courses/Docs segments and
contextual placeholders. The TanStack site keeps its existing marketplace API
and docs index; Storybook uses the preview catalog and docs content.
The shared Switch atom is shown in Components/Atoms/Switch;
the theme sandbox, onboarding and settings all use it.

Pages/Dojo/Settings shares onboarding’s name/handle fields and the supplied Arc
avatar cropper. Profile edits and cropped photos stay in the current preview
session across settings tabs; no storage service is connected. Each settings tab
has contextual help on the right, stacked beneath the controls on narrow screens.

The content-window gear opens learning preferences, separate from avatar account
settings: Material plus the current Code, Video or Slides section. Choices apply
immediately and persist in browser storage, with a reset for each section. Code
font size continues to use the shared editor preference. The panel preserves the
chat/settings divider width and the mounted editor’s draft.

Stories: Pages/Dojo/Content Window Settings and Components/Organisms/Content
Settings (playground, material, video and slides). The Slidev fixture includes an
origin-checked bridge for real thumbnails, progress, reduced motion and navigation.
Rectangular Previous/Next buttons sit below the 16:9 deck around a centered
page/total counter. A thin brand-colored progress bar runs along the top; both
stay synchronized with keyboard and thumbnail navigation. External
decks need the same bridge for those controls. Frame fitting
works independently of the bridge. Vimeo retains its embedded player’s own
playback preferences.


`web/learning-preview` is the immutable, inert landing illustration. It composes
shared workspace/editor/chat presentation and owns its explicitly illustrative
identity, course and model names. It imports no learner page controller or
simulated conversation hook. Production navigation supplies section/course hrefs
and a single search owner through `SiteContext`; story adapters own their search
state. Unsupported marketplace ratings, hours, provenance and audits may be
omitted. A missing installation source renders no runnable command.
