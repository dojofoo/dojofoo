---
title: Troubleshooting
description: Fixes for the problems learners hit most.
---

## `install` set up the wrong agent, or none

`install` detects the agent it runs in and asks otherwise. Name it yourself:

```sh
npx dojofoo install --claude
```

The options are `--claude`, `--opencode`, `--codex`, `--gemini` and `--pi`.

## `/kata` doesn't exist in my agent

`/kata` is deprecated. Run `npx dojofoo ui` in the project instead – it opens the lesson in your
browser.

## The lesson UI doesn't open

`https://dojo.localhost` needs Portless. Without it, the UI runs at `http://localhost:4567`; to
skip Portless:

```sh
npx dojofoo ui --no-portless
```

If Portless is installed but the address fails:

```sh
portless doctor      # check its health
portless trust       # repair certificate trust
portless hosts sync  # repair .localhost resolution, e.g. in Safari
portless prune       # clear routes left by crashed processes
```

Port `4567` taken? Add `--port 4570`.

## A course's tools fail to install

dojofoo runs `mise install` and the course's `setup` task. Run them yourself in
`courses/<name>/` to see the full error:

```sh
mise install
mise run setup
```

mise may first ask you to trust the course's configuration. On Windows, install mise with
`winget install jdx.mise` before `npx dojofoo install`.

## `update` refuses to run

You've changed files inside `courses/<name>/`. Move your changes out, then
`npx dojofoo add <source> --force` to reinstall.

## I want to start a course over

```sh
npx dojofoo remove effect-ts
npx dojofoo add dojofoo/effect-ts
```

Your old solutions stay in `katas/`; move them away first for a clean start.
