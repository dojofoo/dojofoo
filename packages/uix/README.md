# UIX

The successor UI library and page-design preview. The live learning/authoring app
has not been switched to these page fixtures.

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
