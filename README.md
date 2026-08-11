<p align="center">
  <img src="assets/dojocho.svg" alt="dojocho" width="360" />
</p>

<p align="center">
  Installable coding dojos that turn your AI agent into a sensei.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dojofoo"><img src="https://img.shields.io/npm/v/dojofoo?style=flat-square&color=ff0056" alt="npm" /></a>
  <a href="https://github.com/tomsiwik/dojocho/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT" /></a>
</p>

<p align="center">
  <a href="https://dojocho.ai/docs">Documentation</a> &middot; <a href="https://dojocho.ai/dojos">Dojos</a>
</p>

---

Reading tutorials feels like progress. It isn't. You only learn a stack by writing it badly, getting stuck, and figuring out why. dojocho gives your AI agent the role of a patient sensei: it runs your tests, points at the symptoms when you're stuck, and asks the kind of questions a teacher would — but it never types for you.

## What it does

dojocho is a CLI you run with `npx` and a set of dojos you bolt onto any project. A dojo is a curated set of katas (small exercises) for a specific stack — Effect-TS, pydantic-agents, etc. Run `npx dojofoo install` to wire your agent into a repo, `npx dojofoo add <dojo>` to install a training pack, then ask your agent for a kata.

```sh
npx dojofoo install          # one-time: auto-detects your agent via env vars
npx dojofoo add effect-ts    # add a ryū (training pack) you want to study
claude /kata                 # let the agent walk you through an exercise
```

The agent reads the kata's `SENSEI.md`, runs your tests, and reacts to what you wrote. It won't auto-solve the kata. You do the typing.

See the [docs](https://dojocho.ai/docs) for installation details, the full command reference, and how to author your own dojo.

## Special thanks

[PaulJPhilp/EffectPatterns](https://github.com/PaulJPhilp/EffectPatterns) — 700+ Effect-TS patterns, useful on its own. Paul's skills work also unblocked the kata authoring loop that made dojocho possible in the first place.
