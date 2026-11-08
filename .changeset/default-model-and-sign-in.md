---
"dojofoo": patch
"@dojofoo/uix": patch
"@dojofoo/ui": patch
"@dojofoo/harness": patch
"@dojofoo/protocol": patch
---

The model menu names what runs. A conversation without a model shows the agent's own default as "Default (Opus 5.5)" with its effort, and checks it in the list; the agent's default is Claude Code's own "Default", the model a new conversation starts on (Codex's config.toml, Pi's settings, OpenCode's own pick), else the one Codex's catalog marks. A new conversation also starts at the effort the agent is configured with (Codex's model_reasoning_effort, Pi's defaultThinkingLevel), which Sensei, run without the user's configuration, didn't use before.

Sign-in appears only when the agent can't run: "Sign in to <agent>" when it is signed in to nothing, a model whose login lapsed opens that provider's sign-in, and a failed turn that needs a login offers it. The model menu has no "Sign in…" row, and the dialog offers only the agent's own browser or subscription sign-ins, no API keys.

The model menu's rows, labels and hover match the account menu's: 32px rows (44px with a second line), the body size in the text color, the hover color behind only the row under the pointer, the chosen row in a heavier weight. A coding agent's effort levels fit on a line of their own without shortening.
