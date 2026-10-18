# @dojofoo/config

Shared configuration and Vitest integration for [dojofoo](https://dojo.foo).

Most users do not install this package directly. Set up dojofoo in a project instead:

```sh
npx dojofoo install
```

See the [documentation](https://dojo.foo/docs) to create or use a dojo.

## Harness defaults

Use `~/.dojofoo/runtimes.json` for global defaults, or `.dojo/runtimes.json` in a workspace to override either role:

```json
{ "authoring": "pi", "lesson": "codex" }
```

Precedence: global → project → `DOJOFOO_HARNESS` → role-specific `DOJOFOO_AUTHORING_HARNESS` / `DOJOFOO_LESSON_HARNESS`. An explicit runtime selection in the UI takes priority and stays with that conversation. New conversations read the configuration again. Existing conversations retain their own harness.

Pi supports authoring. Lesson trials currently require Codex, OpenCode, Cursor, Grok or FX. These settings select installed harnesses; credentials remain in their native login stores.
