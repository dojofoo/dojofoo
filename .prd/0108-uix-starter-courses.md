# 0108: Draft starter courses and deliberate installation

Parent: UIX adoption (0100).
Status: draft content and local empty-shell/discovery presentation prepared; full installation/teaching integration still depends on 0106–0107. Local review remains unmerged.

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

## Local Explore and empty-shell checkpoint, 2026-10-27

The user explicitly requested two always-available empty starter shells and allowed temporary local discovery content. The dashboard now includes Create your own dojo and How to run a dojo even when installation discovery returns no courses. Their metadata reads the existing draft manifests at build time. A real installation with the same course ID takes precedence over its placeholder. The existing backend installation list is unchanged and continues to report only filesystem installations; no installation, progress or provider session is fabricated by browsing. Language filtering and workspace/session choices remain under the native controller.

/explore is a local route. Its CourseExplore presentation is shared with current Pages/Explore: featuring, the turning course card, catalog search/category/status controls and the course-card grid. The Storybook controller retains its preview installation timer; the native host supplies Open actions for the starter shells. Missing reviews, dates and ratings remain absent; a regression caught the shared CourseCard emitting a bare Updated label without a date, which is now omitted. /starter/$courseId provides the empty learner workspace with the shared course card, Dashboard crumb, account menu and disabled conversation. It does not execute the prepared lesson content, start an agent or claim an installed course. The seven-step source drafts remain intact for the real packaged installation/teaching work above.

Red-first evidence: the controlled Explore contract test failed before its component existed; the native browser test reproduced the absent dashboard starter link; the missing-date assertion failed before the CourseCard guard. Final gates: host 396 passed/4 skipped (37.00s); UIX 65 passed (32.38s); both type checks, full real CLI build and diff check passed. Four native browser checks passed (9.9s), including the isolated built-CLI local library gate: actual installation discovery, language filter, workspace choices, removal of real installations leaving both starter shells, and no owned teaching sessions. The new browser case checks local navigation/reload/search, both shell routes, Dashboard return, absent empty date and dashboard-only menu inside a course, disabled conversation, and zero writes/popups. Five Explore/corner/controller checks passed against current Storybook (7.8s), including actual preview installation state. Real canonical /explore probes passed desktop 1440px and phone 390px, working search, both cards, a fully visible mobile Open action and no horizontal overflow/page errors. Desktop/mobile/shell screenshots were inspected.

Evidence: `/tmp/dojo-explore{,-date}-red.log`, `/tmp/dojo-local-explore-red.log`, `/tmp/dojo-local-explore-final-{host-tests,uix-tests,build}.log`, `/tmp/dojo-local-explore-verified-{host-types,uix-types,stories,layout}.log`, `/tmp/dojo-local-explore-verified.log`, `/tmp/dojo-local-explore-verified-results/`, `/tmp/dojo-local-explore-{1440,390,mobile-grid}.png`. Review now runs as owned pueue task 2083 at https://dojo.localhost, backend 4321. Owned previous launchers/servers were stopped explicitly before rebuilds. The website docs still returned HTTP 200; both user Storybooks and all 18 concurrent root audit files were preserved. No merge or production promotion occurred.

The source installation/offline/context/progression/independent-draft gates above remain open. Next latest-user work is the coding-agent/model composer, real image/file attachment handling and a main-view authoring entry that creates an independent draft. The account/profile persistence and evaluation-report work in 0107 also remain incomplete.

## Starter-shell composer capabilities (local review)

Both empty starter shells disabled the message field while leaving the default file picker enabled and omitting the coding-agent control. They also inherited the command menu's Ask assistant fallback without a connected conversation handler. The starter route now passes the existing unavailable-attachments capability, an unavailable Coding agent entry and askAssistant=false to the shared UIX presenters. The + remains visible but disabled, no file input is mounted, agent/model controls remain disabled, and supported settings search remains available. Course metadata/cards, draft sources, navigation, installations and agents are unchanged. This does not implement either tutorial journey.

Red checks reproduced an enabled Add file button and one unsupported Ask assistant option. Fresh final local gates: host types and built CLI passed; host 415 passed / 4 skipped (26.70s); learner-page browser 5 passed (12.4s), gated on successful /api/health. The extended journey opens both shells through local discovery, verifies unavailable controls/no file input, checks no assistant search fallback with settings still discoverable, and records zero write requests or external popups. Starter screenshot inspected. Evidence: /tmp/dojo-ui-starter-composer-{red,final-types,final-build,final-tests,final-browser}.log; /tmp/dojo-ui-starter-search-red.log; /tmp/dojo-ui-starter-composer-final-browser-results/.

Concurrent branding is excluded; all 47 other preserved user files and 18 root audit files retain their hashes. The current agent/authoring/UI-server source diff is empty. A separate read-only branch audit confirms older runtime commits still affect 22 server/authoring paths relative to main; they were neither changed nor reverted. Keep the branch unmerged and distinguish that older history before any UI-only merge. Audit evidence: /tmp/dojo-ui-starter-composer-existing-core-{range,commits}.txt. Full UI parity, supported tutorial installation/handoff, clean CI/package and release acceptance remain open.
