# Security policy

## Reporting a vulnerability

Please report security issues privately to **security@dojo.foo**, not in a public issue or pull request.

Include what an attacker can do, the steps or files that reproduce it, and the version or commit you tested. We
acknowledge reports within a week and keep you updated until the fix is released.

## Supported versions

Fixes go into the latest release of the `dojofoo` CLI and the `main` branch.

## Scope

dojofoo runs on your own machine: the CLI, the local web app it starts, and the AI coding agents it launches with
your sign-in. These are especially important:

- a web page reaching the local app's API (cross-site requests, DNS rebinding)
- an installed course writing outside its directory, or running code before you choose to run its setup
- a lesson trial writing into the author's draft, or copying secrets
- script running from chat messages or lesson content

That an agent you started edits files or runs commands in your workspace is intended behaviour, not a vulnerability.
