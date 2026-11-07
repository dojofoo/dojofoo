# Designs

| Design | Status | Summary |
| --- | --- | --- |
| [agent-runtime.md](agent-runtime.md) | Approved | One runtime for Sensei and Kyoshi: `@dojofoo/harness` and `@dojofoo/agents`, with an implementation roadmap in nine steps. Traceability: [agent-runtime.traceability.md](agent-runtime.traceability.md). |
| [antigravity-adapter.md](antigravity-adapter.md) | Brief | Antigravity (`agy`) as a coding agent for both personas: a HarnessV1 adapter, its write prevention, and the spike that comes first. |
| [local-api-hardening.md](local-api-hardening.md) | Brief | Host, Origin and per-launch token checks across the local UI server's routes and socket. |
| [state-ownership.md](state-ownership.md) | Brief | One owner per piece of state, locked writes to shared files, catch-up after missed notifications, and per-action busy and error state: the rules behind the 2026-11-07 survey of implicit state machines. |
