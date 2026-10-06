# Editor and teaching content

- [x] Replace CodeMirror with modern-monaco and its built-in Shiki integration.
  Preserve editing, project-aware TypeScript completions/diagnostics, undo, save,
  file isolation, coverage, line references, scrolling, and read-only website previews.
  Bundle editor assets locally; match the Cursor Vercel/Geist palette.
- [x] Integrate [Shiki Markdown Exit](https://shiki.style/packages/markdown-exit)
  for authored Markdown with the shared editor theme.
- [x] Explore [Magic Move](https://shiki.style/packages/magic-move) for animated
  code transitions, including Slidev teaching presentations.
- [x] Integrate [Twoslash](https://shiki.style/packages/twoslash) for type hovers
  and learning documentation. Explore explanatory green function/line annotations
  with sourced references (e.g. MDN), visually distinct from errors and test coverage.

Implemented and verified in authoring previews and lesson content. Examples,
supported syntax, Slidev integration boundaries, and verification commands are
documented in [packages/ui/EDITOR.md](packages/ui/EDITOR.md). Storybook's
`Components/Teaching Content` uses production-compiled Markdown fixtures.
