---
"dojofoo": minor
---

Run `npx dojofoo` in a terminal to start learning: it sets the folder up first when needed, then opens the local lesson UI, and takes the same options as `ui` (`--no-open`, `--background`, `--port`, `--authoring` and the others). Without a terminal – in scripts, CI or pipes – it still prints the help. `npx dojofoo ui` keeps working for scripts and agents, including `ui prompt` and `ui --skill`.
