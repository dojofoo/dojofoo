# @dojofoo/ui

Shared Dojofoo UI components and the local lesson server.

## Agent boundary

Dojofoo is an ACP client. It launches
[`@agentclientprotocol/codex-acp`](https://github.com/agentclientprotocol/codex-acp)
and communicates through [`@agentclientprotocol/sdk`](https://github.com/agentclientprotocol/typescript-sdk).
`codex-acp` owns the translation to Codex App Server; Dojofoo does not implement
that private protocol.

The stable ACP session is the conversation source of truth. The browser-facing
AI SDK `UIMessage` stream is only a rendering projection:

```text
React / AI Elements
        │ AI SDK UI message stream
        ▼
Dojofoo local server (ACP client)
        │ ACP v1, capability-negotiated
        ▼
codex-acp
        │ Codex App Server protocol
        ▼
Codex
```

The client currently supports standard ACP message and thought chunks, tool
calls and results, permissions, session loading, and structured elicitation.
Lesson check evidence is attached to a normal `session/prompt` as an ACP
embedded JSON resource. The optional `dojo://` URI identifies the resource;
no custom JSON-RPC method or private message envelope is required.

ACP v2 support will be negotiated when `codex-acp` supports it. Do not infer a
protocol version from the npm package version.

## Running

```bash
pnpm install
pnpm --filter @dojofoo/ui dev
```

Normally the packaged CLI starts it with `dojofoo ui`.

## Verification

```bash
pnpm --filter @dojofoo/ui types:check
pnpm --filter @dojofoo/ui build
pnpm --filter @dojofoo/ui exec vitest run
```

## License

FSL-1.1-ALv2. The ACP SDK and `codex-acp` are Apache-2.0 dependencies.
