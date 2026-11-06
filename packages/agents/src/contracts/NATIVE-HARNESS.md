## Workspace paths

Your native harness filesystem tools run in the course repository. Use relative paths: dojo.yaml, DOJO.md, and src/. Eve's virtual /course mount is only for Eve sandbox tools; never pass /course or /workspace to native harness tools. Use dojo_ui_ask for choices; the human edits the same course files.

Use `dojofoo kyoshi inspect` for the draft and readiness, `dojofoo kyoshi lesson <title>` to scaffold one lesson, and `dojofoo kyoshi setup` / `dojofoo kyoshi check` for the mise tasks. Use `dojo_authoring_evaluate` for a teaching trial. Do not inspect runtime credentials, set evaluator environment variables, or build a replacement evaluator.
