# @dojofoo/protocol

## 0.1.1

### Patch Changes

- 1af0002: Every coding agent gets the same model menu. A long model list can be searched, and a model the agent can't run now is listed last, muted, with what to do ("Sign in to GitHub Copilot again: run pi, then /login", "Not in your GitHub Copilot plan"). A conversation without a model no longer shows the first model as chosen, and a model without a default effort of its own shows Default until a level is picked.
  
  Pi starts a new conversation on the default model in its settings.json while that model can run, else on the first one that can, instead of on a model whose expired sign-in Sensei can't renew. OpenCode lists its models by name with their reasoning variants as efforts, from the copy Sensei runs, and a new conversation names the model OpenCode picks itself. Kyoshi's conversations start on the same configured model as Sensei's.
  
  Onboarding shows an agent found on this machine that Dojo can't teach through yet (Cursor, Antigravity) as not supported instead of offering it.
- f08214c: Kyoshi's composer has the same model and effort menu as Sensei's: Kyoshi runs on the conversation's model and effort from the next turn, and a new conversation starts on the workspace's last choice.

## 0.1.0

### Minor Changes

- ea5f1db: Sensei runs on Eve like Kyoshi, and every coding agent dojofoo offers runs both, after passing conformance. Each workspace has one coding agent, chosen in the composer.
  
  Sensei cannot write the solution file, and a change made while Sensei works is restored and named.
  
  Pages are addressed by draft and by course run, open their conversation by themselves, and list earlier ones in a history menu.
  
  Course evaluation runs in the UI on the draft's coding agent, with one consent switch, and `dojofoo kyoshi evaluate` is gone.
  
  The internal packages are `@dojofoo/harness` (formerly `@dojofoo/agent` and `@dojofoo/agent-api`) and `@dojofoo/agents` (formerly `@dojofoo/authoring`).
- ef7bae5: Sensei's model menu lists each model with its version and description, as the coding agent does (Claude Code through its Agent SDK), and lets the learner choose the model's effort.
