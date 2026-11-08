---
"dojofoo": patch
"@dojofoo/uix": patch
"@dojofoo/harness": patch
---

OpenCode signs in from the composer too, through Sensei's OpenCode server: any of its providers takes an API key, and the ones with a sign-in of their own (ChatGPT, GitHub Copilot, GitLab, xAI, …) open it in the browser after their questions (GitHub.com or Enterprise, say), pasting back a code where the page shows one. OpenCode saves the login in the user's data folder, which Sensei's OpenCode reads. A provider whose key needs more than the key (Azure's resource name) points to OpenCode's own terminal. The sign-in dialog's fields get an outline outside the onboarding.
