# @dojofoo/protocol

## 0.1.3

### Patch Changes

- 584bd27: The model menu names what runs. A conversation without a model shows the agent's own default as "Default (Opus 5.5)" with its effort, and checks it in the list; the agent's default is Claude Code's own "Default", the model a new conversation starts on (Codex's config.toml, Pi's settings, OpenCode's own pick), else the one Codex's catalog marks. A new conversation also starts at the effort the agent is configured with (Codex's model_reasoning_effort, Pi's defaultThinkingLevel), which Sensei, run without the user's configuration, didn't use before.

  Sign-in appears only when the agent can't run: "Sign in to <agent>" when it is signed in to nothing, a model whose login lapsed opens that provider's sign-in, and a failed turn that needs a login offers it. The model menu has no "Sign in…" row, and the dialog offers only the agent's own browser or subscription sign-ins, no API keys.

  The model menu's rows, labels and hover match the account menu's: 32px rows (44px with a second line), the body size in the text color, the hover color behind only the row under the pointer, the chosen row in a heavier weight. A coding agent's effort levels fit on a line of their own without shortening.

## 0.1.2

### Patch Changes

- 48af084: Sign a coding agent in from the composer. Pi and Codex list the accounts they can use and sign in to one: a browser sign-in shows its page (or a code to enter), an API key is asked for in a password field. The agent saves the login where it keeps its own and renews it itself. An agent signed in to nothing shows "Sign in to <agent>" where the model menu would be, the model menu has a "Sign in…" row, and a failed turn that needs a login offers the same sign-in. A lapsed Pi login now reads "Sign in to GitHub Copilot again".

  The harness's sign-in is Pi's interface: `agentAccess(agent)` from `@dojofoo/harness/adapters` lists providers as Pi's model runtime does and logs in through Pi's `AuthInteraction` (events to show, questions to answer). Pi runs its own login; Codex runs its app-server's (`account/read`, `account/login/start`). The session API serves it under `/agents/{id}/providers` and `/logins`, with the page's launch token. Protocol carries Pi's sign-in types in their JSON form, and the harness build fails if they stop matching Pi's.

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
