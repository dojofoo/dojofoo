# Source editor

Learning, authoring, the website preview, and Storybook share `CodeEditor`.
It uses modern-monaco 0.4.2 (Monaco + Shiki), without a separate React editor wrapper.
The existing lesson TypeScript service supplies installed-project completions and
diagnostics. Markdown preview remains separate from source editing.

`src/lib/themes/cursor-vercel.json` is the unmodified theme data from
[Cursor Vercel](https://github.com/FlameDevvv/vercelcursortheme/tree/99613015c8e4e39dedbcbfafb3d7b41942e3fc1b),
normalized from JSONC. The adapter changes only the registered name and dark type.
Source tabs use the same background token. Semantic coloring is disabled so it
does not replace the authored TextMate colors.

`monaco-assets.ts` serves and emits upstream editor/worker modules and the
supported grammars' embedded dependencies. modern-monaco's documented import-map
and CDN options point to these local assets. No runtime esm.sh dependency, extra
IndexedDB workspace, or second file persistence layer is introduced. Keep the
grammar version aligned with modern-monaco when upgrading either dependency.

Each mounted file owns one explicit Monaco URI, model, editor, and disposable
language provider. File changes dispose them; React/server state owns drafts.
Stale diagnostics are aborted and ignored. Monaco owns undo within the open file.

## Verification

Run `pnpm --filter @dojofoo/ui test:editor` for the isolated browser suite. It
starts Storybook automatically, blocks esm.sh, and mocks only the existing lesson
language endpoints. No coding harness or model quota is used. The fixture uses
the real shared editor and app stylesheet, not a separate imitation.

The suite replaces the obsolete `editor-load.spec.ts` fixture tied to the removed
`/api/lesson` routes. It covers editing/undo/reset, save shortcuts, file isolation,
all six languages, theme/font, scrolling, coverage, line flashes, completion,
diagnostic hovers, folding, and read-only previews. Existing live lesson and
authoring integration tests still cover the real save/routes workflow.

Unit tests cover marker conversion, stale requests, provider isolation, theme
tokenization (including TypeScript arrows), and the server TypeScript service.

## Authored Markdown and teaching code

Authoring file previews and lesson `CourseContent` use Markdown Exit with
`@shikijs/markdown-exit` and the same Cursor Vercel theme as the editor.
The local server compiles content through `POST /api/teaching/preview`.
TypeScript/Twoslash stays server-side; code examples are analyzed, never executed.
The client aborts obsolete requests when the source or workspace changes and
shows compilation errors rather than an indefinite loader. There is no new
database or persisted preview cache.

Ordinary fenced code is highlighted without type-checking. Opt in to Twoslash
for self-contained TypeScript/JavaScript examples:

````md
```ts twoslash
const word = "hello";
word.toUpperCase();
//   ^^^^^^^^^^^
// @annotate: Creates a new string. [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toUpperCase).
```
````

Twoslash's standard caret notation highlights the function; `@annotate` adds a
green **Learning note**, distinct from red type errors and editor test coverage.
Annotations and JSDoc support Markdown links. Authors supply and verify sources;
the renderer does not claim to fact-check or automatically fetch documentation.
Hover or keyboard-focus a token for type/JSDoc information. Shared Radix tooltips
portal these popups outside scrollable code blocks so they are not clipped.
For deliberately invalid examples, use Twoslash's `// @errors: <code>` directive.
Unexpected type errors are reported to the author.

Magic Move uses the same top-level nested fences as Slidev:

`````md
````md magic-move
```ts
const score = 2;
```
```ts
const score = 2;
const doubled = score * 2;
```
````
`````

The server precompiles each frame into keyed Shiki tokens. The official
`@shikijs/magic-move/react` renderer animates Previous/Next transitions; reduced
motion switches frames immediately. This integrates the code-transition syntax,
not Slidev's full presentation runtime, slide layouts, or click choreography.
The example fences can be reused in a Slidev deck. Use the shared theme when
configuring Shiki there to keep the palette consistent.

KaTeX renders inline/display math; top-level Mermaid fences retain the existing
diagram component. Relative links/images retain the workspace asset boundary.
Existing Artifact, Video, Interactive and RegexWorkbench components remain
handled by CourseContent. Arbitrary MDX JavaScript and raw HTML are not executed.

### Stories and regression coverage

`Components/Teaching Content` contains the full lesson, code transitions, async
authored preview, and a failed-preview story. The Markdown fixture is compiled
by the production compiler during Storybook dev/build, not manually recreated
as HTML. Async stories use Storybook's MSW addon and those compiled responses;
they also work in static Storybook without a local daemon. The mock worker lives
under `.storybook/public`, never in the shipped app's public assets.

`test:editor` also covers mouse/keyboard type hovers, sourced annotations, list
spacing, math/diagrams, code-step navigation, reduced motion, async file changes,
and visible errors. `teaching-markdown.test.ts` and `teaching-routes.test.ts`
exercise the real compiler/API, including opt-in checking, raw-HTML escaping,
unsafe links, course assets, same-origin requests, and document-size limits.

### Workspace tabs

Authoring opens files from the sidebar. Close tabs with ×, drag them left/right,
or use Alt+Left/Right on a focused tab. Plain arrow keys select adjacent tabs.
Only open files appear in the strip; closing the last tab leaves an empty editor.
Unsaved drafts are kept per file in memory, including closed tabs, and restored
when reopened. Reloading with unsaved drafts triggers the browser warning;
closing a tab never deletes a file. Cmd/Ctrl+S saves the active file only.

Learning uses the same strip with an explicit locked policy: only the lesson's
fixed code/results tabs are available, with no opening, closing or reordering.
`Components/Workspace Files` and `workspace-tabs.spec.ts` exercise both policies.

### Editable TypeScript documentation

Monaco's native Markdown hover shows inferred signatures, JSDoc, `@param` and
`@returns` from the workspace TypeScript language service. Authoring files such
as `vitest.config.ts` resolve declarations from the course's installed packages;
lesson editors use the lesson workspace. Requests include the unsaved active
buffer, are cancelled on disposal, and reject results from obsolete revisions.
Missing dependency declarations must be installed by the course setup; no CDN
types or invented documentation are substituted. Markdown is untrusted, with
HTML and command permissions disabled. Twoslash remains the renderer for
authored Markdown code blocks, rather than replacing Monaco's live hover.

Documentation hovers use a body-level Monaco overlay above neighboring panes.
The card is capped at 520px wide: API signature first, independently scrollable
documentation/examples second, then compact parameter/return segments and
authored reference links. Fenced examples use Monaco's registered Shiki tokenizer
and the editor theme. A new hover resets scrolling; overlays are removed when
the editor unmounts. The hover contribution's `goToTop` integration is covered
by the editor browser tests to catch upstream Monaco changes.
