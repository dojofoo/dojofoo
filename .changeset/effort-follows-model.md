---
"dojofoo": patch
"@dojofoo/uix": patch
"@dojofoo/ui": patch
"@dojofoo/config": patch
---

The model menu shows only an effort the chosen model takes, so a level picked for another model no longer sticks after a switch, and the effort row shows no selection when none applies. A conversation whose effort is cleared by a model change also clears the workspace's saved effort, so the next conversation starts at its model's default.
