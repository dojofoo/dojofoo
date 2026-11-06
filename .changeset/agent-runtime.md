---
"dojofoo": minor
"@dojofoo/harness": minor
"@dojofoo/agents": minor
"@dojofoo/ui": minor
"@dojofoo/protocol": minor
"@dojofoo/config": patch
"@dojofoo/uix": patch
"@dojofoo/evals": patch
---

Sensei runs on Eve like Kyoshi, and every coding agent dojofoo offers runs both, after passing conformance. Each workspace has one coding agent, chosen in the composer.

Sensei cannot write the solution file, and a change made while Sensei works is restored and named.

Pages are addressed by draft and by course run, open their conversation by themselves, and list earlier ones in a history menu.

Course evaluation runs in the UI on the draft's coding agent, with one consent switch, and `dojofoo kyoshi evaluate` is gone.

The internal packages are `@dojofoo/harness` (formerly `@dojofoo/agent` and `@dojofoo/agent-api`) and `@dojofoo/agents` (formerly `@dojofoo/authoring`).
