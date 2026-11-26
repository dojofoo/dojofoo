---
"dojofoo": patch
"@dojofoo/agents": patch
---

Publish the CLI again: its prepared Kyoshi and Sensei servers no longer carry the Claude Agent SDK's native binary for the machine that built them (about 220 MB each). Nothing ran it, since model discovery uses the installed Claude CLI, and it pushed the package past npm's publish limit. The tarball drops from 296 MB to 92 MB.
