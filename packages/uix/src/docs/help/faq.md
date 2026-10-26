---
title: FAQ
description: Short answers to common questions.
---

## Which agents work with dojofoo?

In the lesson UI, the sensei runs on OpenCode, Codex, Cursor, Grok or FX – see
[ui](/docs/commands/ui#the-senseis-agent).

## Will the sensei just give me the answer?

No. It explains, asks and hints, and narrows the problem down to the failing test. The code is
yours to write.

## Where's my progress?

In your project: your solutions in `katas/`, your progress in `.dojo/`. Commit them to keep them
or move between machines.

## Do I install anything globally?

No – the CLI runs through `npx`. `install` adds mise for your user if it's missing, without
touching your shell's startup files.

## What does dojofoo send?

Anonymous lifecycle events – a course installed, started, a kata completed, finished – with a
random project ID. Never your code, paths or conversations. See [Privacy](/docs/privacy) to turn
it off.

## Can I write my own course?

Yes – see [Authoring](/authoring).
