---
"dojofoo": patch
"@dojofoo/config": patch
"@dojofoo/build-llm": patch
"@dojofoo/effect-ts": patch
"@dojofoo/pydantic-agents": patch
---

Move all first-party packages, dojos, registry metadata, and telemetry course IDs from the legacy `@dojocho` scope to `@dojofoo`.

Fix the packed CLI release gate so it verifies the current package version instead of a hard-coded historical version.
