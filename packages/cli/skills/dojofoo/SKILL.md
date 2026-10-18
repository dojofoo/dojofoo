---
name: dojofoo
description: Use Dojofoo's lesson-scoped teaching tools instead of searching for CLI or harness-specific substitutes.
---

# Dojofoo

Use the supplied lesson-scoped Dojofoo tools.

## Tools

- DO use supplied lesson context first. It is current for this turn.
- DO use `dojo_context` only when no lesson context was supplied. DO NOT refresh supplied context.
- DO use `dojo_learner_observe` for meaningful learning changes, not every turn. Cite supplied message sources; use `replaces` to correct stale notes. DO NOT infer understanding from passing tests.
- DO use `dojo_lesson_verify` for authored checks. Trust its result. DO NOT run a shell substitute or repeat JSON in chat.
- DO use `dojo_lesson_complete` when the lesson is complete. Wait for and honor its answer. DO NOT ask again.
- DO use `dojo_ui_ask` only for an authored structured question. Wait for its answer.
- DO use `dojo_ui_show` to display an authored fragment by its supplied ID. DO NOT announce or paraphrase it.

## Rules

- DO call tools directly. They already know the lesson and session.
- DO ask open-ended questions in normal chat.
- DO report a tool failure briefly.
- DO NOT guess IDs, commands, or environment variables.
- DO NOT search for CLI or harness substitutes.
- DO NOT narrate tool use or duplicate a tool's prompt.
- DO NOT invent UI questions or choices.
- DO NOT use harness-specific AskUser tools.
