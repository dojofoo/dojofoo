---
"dojofoo": patch
"@dojofoo/uix": patch
"@dojofoo/ui": patch
"@dojofoo/agents": patch
"@dojofoo/harness": patch
"@dojofoo/protocol": patch
---

Every coding agent gets the same model menu. A long model list can be searched, and a model the agent can't run now is listed last, muted, with what to do ("Sign in to GitHub Copilot again: run pi, then /login", "Not in your GitHub Copilot plan"). A conversation without a model no longer shows the first model as chosen, and a model without a default effort of its own shows Default until a level is picked.

Pi starts a new conversation on the default model in its settings.json while that model can run, else on the first one that can, instead of on a model whose expired sign-in Sensei can't renew. OpenCode lists its models by name with their reasoning variants as efforts, from the copy Sensei runs, and a new conversation names the model OpenCode picks itself. Kyoshi's conversations start on the same configured model as Sensei's.

Onboarding shows an agent found on this machine that Dojo can't teach through yet (Cursor, Antigravity) as not supported instead of offering it.
