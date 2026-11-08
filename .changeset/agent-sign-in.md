---
"dojofoo": patch
"@dojofoo/uix": patch
"@dojofoo/ui": patch
"@dojofoo/harness": patch
"@dojofoo/protocol": patch
---

Sign a coding agent in from the composer. Pi and Codex list the accounts they can use and sign in to one: a browser sign-in shows its page (or a code to enter), an API key is asked for in a password field. The agent saves the login where it keeps its own and renews it itself. An agent signed in to nothing shows "Sign in to <agent>" where the model menu would be, the model menu has a "Sign in…" row, and a failed turn that needs a login offers the same sign-in. A lapsed Pi login now reads "Sign in to GitHub Copilot again".

The harness's sign-in is Pi's interface: `agentAccess(agent)` from `@dojofoo/harness/adapters` lists providers as Pi's model runtime does and logs in through Pi's `AuthInteraction` (events to show, questions to answer). Pi runs its own login; Codex runs its app-server's (`account/read`, `account/login/start`). The session API serves it under `/agents/{id}/providers` and `/logins`, with the page's launch token. Protocol carries Pi's sign-in types in their JSON form, and the harness build fails if they stop matching Pi's.
