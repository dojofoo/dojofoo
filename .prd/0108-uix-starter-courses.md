# 0108: Draft starter courses and deliberate installation

Parent: UIX adoption (0100).
Status: content preparation only; depends on completed interactive and authoring integration (0106–0107).

Goal: ship the editable “Create your own dojo” and “How to run a dojo” starters through the packaged local application, with deliberate offline installation, actual Sensei context, saved progress, and an independent authoring-to-trial journey. Source content alone does not complete this goal.

Sources: `courses/create-your-own-dojo` and `courses/how-to-run-a-dojo`. Each has an existing-format interactive manifest, stable IDs, six short MDX presentation steps, one recall question, and draft teaching guidance. Both use `marketplace: false`. The current Kyoshi scaffold supports katas only; the authoring tutorial accurately creates an independent kata draft rather than promising an unsupported interactive authoring wizard or company interview backend.

Content gate:

```sh
DOJO_TELEMETRY_DISABLED=1 pnpm --filter dojofoo exec vitest run test/starter-courses.test.ts
```

Fresh result on 2026-10-27: 2 passed (714ms). The real local-path installer copies each source into an isolated temporary workspace. The test loads all seven steps through the interactive service, compiles all presentation content with the actual teaching Markdown/Shiki compiler, checks linked documentation source paths, exercises wrong/right recall answers and saved progression, reopens persisted state in a copied workspace, refuses duplicate installation, and verifies that the source hash is unchanged. No agent/model request is made. This proves source loading and service-level behavior, not the complete learner UI or a process-restart/native conversation journey.

Remaining acceptance:

- Bundle the source assets in the actual CLI distribution and expose deliberate installation using the existing workspace/installer ownership. Validate the installed tarball outside the monorepo, offline. Do not overwrite edited installations or auto-install courses on every launch.
- Connect the selected course's teaching guidance and relevant docs to its real Sensei context; the current interactive conversation sends the selected step/snapshot, not these separate `DOJO.md` files. Do not claim the guidance is already supplied to the agent.
- Use the approved Pages layout and settle the learner navigation/answer presentation under the user's no-Continue constraint. Verify progress, answers, conversation identity and model across reload and server restart with a native harness and scripted local inference.
- Demonstrate the tutorial-to-independent-draft handoff, real file edits/save, learner trial and return to that same draft without changing either tutorial's source or installation. Evaluation/publication stay explicit and must never be reported as successful before execution.
- Verify source/content/schema boundaries, actual help links and editable assets in the packed application. Public catalog registration remains deferred until reviewed content has a real distribution source.

Do not merge the local review or promote production ahead of the requested review and the remaining migration gates.
