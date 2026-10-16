# Editor color schemes – sources and licenses

Each file is the upstream VS Code / TextMate theme, copied unchanged. The "Vercel" scheme combines two of them in
`code-editor-theme.ts`: Linear's editor colors and comments with Vercel's syntax colors and text, dark and light.
`cursor-vercel.json` remains the main app's editor theme.

| File | Source | License |
|---|---|---|
| `cursor-vercel.json` | [FlameDevvv/vercelcursortheme](https://github.com/FlameDevvv/vercelcursortheme) @ 9961301 | none stated (the repository's LICENSE.md is empty) |
| `linear-dark.json`, `linear-light.json` | [pabueco/linear-vscode-theme](https://github.com/pabueco/linear-vscode-theme) @ ab540a0, `dist/linear-theme-{dark,light}-no-italics.json` | MIT – Copyright (c) 2022 pabueco |
| `vercel-dark.json`, `vercel-light.json` | [gantoreno/vscode-vercel](https://github.com/gantoreno/vscode-vercel) @ b47373e, `themes/` | MIT – Copyright (c) 2024 Gabriel Moreno |
| `github-dark-dimmed.json` | [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme), as built in [tm-themes](https://github.com/shikijs/textmate-grammars-themes) 1.12.12 | MIT – Copyright (c) 2020 Primer |
| `one-dark-pro-darker.json` | [Binaryify/OneDark-Pro](https://github.com/Binaryify/OneDark-Pro) @ ce79c5f, `themes/OneDark-Pro-darker.json` | MIT – Copyright (c) 2013-2022 Binaryify |
| `pierre-dark.json` | [pierrecomputer/pierre](https://github.com/pierrecomputer/pierre) – `@pierre/theme` 2.0.0, the code theme of T3 Code | Apache-2.0 – built on primer/github-vscode-theme (MIT, Copyright (c) 2020 Primer) |
| `material-theme-darker.json`, `material-theme-ocean.json` | [antfu/vsc-material-theme](https://github.com/antfu/vsc-material-theme), as published in tm-themes 1.12.12 | Apache-2.0 – Copyright Mattia Astorino and contributors |

Material Nova (Dhavalkurkutiya/material-nova) Darker and Ocean are the same palettes – the editor backgrounds, line
highlights and selections match exactly, the syntax colors in all but 9 rules – but Material Nova's terms forbid
redistribution, derivative works and use in SaaS, so the Apache-2.0 Material Theme versions are bundled instead.
