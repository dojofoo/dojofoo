# 0109: UIX review handoff and remaining acceptance

Parent: [0100](0100-uix-adoption.md).
Status: local presentation review prepared; full migration and release acceptance incomplete.

GOAL: review the current shared UI without including unrelated service/runtime changes or treating unsupported capabilities as complete.

## Review targets

- [Native application](https://dojo.localhost): dashboard, local Explore, starter shells, learner/authoring workspaces and account settings.
- [Website and documentation](https://dojo.td): landing, catalog, course details, docs and native API reference.
- [Current learner Page](http://127.0.0.1:6025/?path=/story/pages-dojo--learner-kata) and [authoring Page](http://127.0.0.1:6025/?path=/story/pages-dojo--course-authoring): presentation reference. Use current Pages rather than archived or standalone composer demos.

Automated checks already cover viewport bounds, keyboard behavior, retained editor/chat drafts, pane sizes/direction, theme fades, scrollbars, dropdowns and slide controls. Visual review should judge the intended presentation; it need not repeat HTTP or geometry probes.

## Verified production ownership

| Surface | Shared UIX presentation | Host binding |
| --- | --- | --- |
| Native dashboard | LearningLibrary, AppShell, command palette | [index.tsx](../packages/ui/src/routes/index.tsx) retains discovery, workspace/session choices and draft entry actions. |
| Native Explore and starters | CourseExplore, CourseCard, AgentChatWorkspace | [explore.tsx](../packages/ui/src/routes/explore.tsx) and [starter route](../packages/ui/src/routes/starter.$courseId.tsx) expose both local shells. |
| Learner and interactive courses | AgentChatWorkspace, Composer, CourseCard, CodeEditor, shared material/results/chat surfaces | [learner route](../packages/ui/src/routes/index.tsx), [interactive course](../packages/ui/src/components/interactive-course.tsx) and [chat renderer](../packages/ui/src/components/chat/streamed-message.tsx) retain existing host callbacks. |
| Authoring and evaluation | AgentChatWorkspace, CodeEditor, file palette, EvalsReportPanel | [authoring route](../packages/ui/src/routes/authoring.tsx) and [report adapter](../packages/ui/src/components/authoring-evaluation-report.tsx). |
| Native account settings | SettingsLayout, ProfileSettingsFields, AvatarUpload, AppearanceSettings | [account settings](../packages/ui/src/components/account-settings.tsx), shared between standalone Settings and mounted workspace account views. |
| Landing, catalog and details | LandingPage, LearningPreview, CoursesPage, CoursePage | [landing](../apps/web/src/routes/index.tsx), [catalog](../apps/web/src/routes/dojos.tsx), [course details](../apps/web/src/routes/courses.$source.$slug.tsx). |
| Documentation and API | DocsSite and the Fumadocs API renderer | [docs route](../apps/web/src/routes/$.tsx), [OpenAPI loader](../apps/web/src/lib/openapi.server.ts), [API presentation](../packages/uix/src/components/api-reference.tsx). The host preloads the generated Elysia document. |

Source audit: the original `/tmp/dojo-uix-review-scope.json` verifies eleven actual bindings. The fresh `/tmp/dojo-uix-readiness-current-scope.json` revalidates all eleven imports in the current working tree, all fifteen relative repository links in this handoff, and the unchanged older core-history exclusion. Its pending service changes are explicitly separated as the three approved host-read adapter files. This is a presentation-ownership inventory, not proof that every backend journey is implemented. Legacy exported primitives, types and archived demonstrations remain where compatibility still requires them; their presence alone is not a reason to delete them.

## Evidence and limits

Current working-tree audit, 2026-10-28: all **37 current Pages checks passed (3.5m)**, including the ten Pages in both themes; **69 UIX units** and **414 host units / 4 skipped** passed. UIX types, the fresh native UI/CLI build, Elysia spec equality and all ten Fumadocs prepared pages passed. The first Pages attempt passed 36 cases and timed out before the setup help region appeared; its two focused theme checks and the complete unchanged-source rerun passed without changing an assertion or application source.

The consolidated native browser run was **57 passed / 1 failed (3.3m)**. One authoring question selection did not submit its answer or display the continuing response. All three question/retry variants then passed unchanged in 6.5s. The trace contains asset 502s, but the authoring module recovered before the click, so those errors do not establish the cause of the missed answer. This remains an unresolved intermittent case, not a claimed 58-pass native gate. Direct and canonical native probes returned HTTP 200; the shared proxy's filtered log records socket hang-ups. No question/session workaround, proxy restart or dependency change was introduced to mask the result.

Follow-up inspection found the main CSS, app-shell CSS and Markdown CSS requests all returned 502, and both the recorded click frame and failure screenshot show an unformatted page. The recovered JavaScript module alone did not restore the expected layout. Two controlled loading journeys now verify answering while files or backend detection finish during a pointer press, including the actual continuation and an unsent note; both passed. The combined two loading cases plus three existing question/retry cases passed **5/5 (8.9s)** without application-source changes. The current direct/canonical main stylesheet requests both return 200 with identical 361,507-byte content/SHA-256. Intermittent asset delivery remains unresolved; these results do not justify a question/session-state workaround or convert the earlier full native group into a pass.

Current evidence: `/tmp/dojo-uix-readiness-current-evidence.json`, its referenced logs/results and `/tmp/dojo-uix-readiness-current-scope.json`. All **822 source files** in the recorded inventory remained unchanged through verification. The initial inventory also included two ignored fixture `node_modules` metadata files; one was regenerated by the existing host suite, so those generated entries are reported separately rather than treated as application-source changes. This pass changes plan/handoff documentation only. The older isolated-build and package evidence below remains historical; these current checks do not establish production-preview, installed-runtime, staging or release acceptance.

| Gate | Recorded result |
| --- | --- |
| Native presentation/adapter browser checks | 27 passed (1.1m); fixture-backed, no live model canary. |
| UIX browser coverage | 63 passed, 38 additional cases passed, then the two corrected corner audits passed (2.3m). The audits inspected all 59 active stories in both themes. These are 103 unique cases across recorded runs. |
| Canonical docs/API browser checks | Six docs cases passed; the originally failing API case passed after the web forwarding-header correction (9.3s). |
| Elysia/Fumadocs freshness | Generated spec and all ten prepared API pages verified. |
| Isolated production web build | Passed (33.58s), with 22 prerendered docs pages and all 502 inspected local HTML/CSS asset references present. |
| Isolated Storybook build | Passed (64.96s); its 80-story catalog matches the tested development catalog. |
| Isolated types and UIX units | Web/UIX types passed; 69 UIX tests passed (10.63s). Frozen offline dependency installation; all 1,304 copied source hashes and manifests retained. |
| Packed native UI assets | Local pack passed (9.41s). All 300 public UI files matched the archive; 17 canonical asset responses matched its bytes, including Inter/Iosevka and Monaco core/workers with correct MIME types. This does not verify a new installed CLI boot or runtime readiness. |

Detailed logs and snapshot paths are recorded in [0100](0100-uix-adoption.md) and `/tmp/dojo-ui-clean-build-evidence.json`. These gates include the pending UI/branding/auth/pricing source in the working tree. They are not committed-only Linux CI, a packed CLI, deployed staging or a production release.

The built production preview is not running at `127.0.0.1:4600`. Automatic approval review rejected launching it because command analysis failed unexpectedly. A manual launch was requested; production-browser hydration and runtime asset requests remain unverified. Static artifact validation does not replace that browser gate.

To start the already-built preview manually:

```sh
cd /tmp/dojo-web-ui-build-lsmk_cuw/apps/web
DOJO_API_ORIGIN=https://dojo.foo pnpm preview --host 127.0.0.1 --port 4600
```

The local archive and asset evidence are recorded in `/tmp/dojo-ui-cli-package-assets.json`. Existing compiled outputs were packed without rebuilding, modifying or starting Eve/core. The archive includes preexisting runtime bundles from the unmerged branch; asset validation does not approve those changes or constitute full CLI/package/release acceptance. The full package test starts an Eve runtime and was not run under the current constraint.

## Requirements that remain open

- Native first-run onboarding is not connected; the setup Page still demonstrates a preview controller. Profile editing/upload/save remain disabled, and sign-in/sign-out remain unavailable. Durable profile ownership must be resolved through supported contracts rather than an invented account or persistence layer.
- The two starters are always-visible draft shells. Independent tutorial drafts, packaged/offline installation, actual authored interactions and persistent grounded Sensei conversations are not accepted by the shell/browser checks.
- Unsupported native attachments and authoring agent/model capabilities remain unavailable. Existing agent-package contracts own execution; no Eve/core changes are authorized by UI review.
- Interactive authored question/step progression remains deferred after removal of the rejected Continue control. A question about connecting the existing question form and slide-style Next control to the existing APIs is pending. Historical learner aliases are listed by discovery but rejected by the current ownership/read contract; they are not accepted read-only resume support.
- Native installation/resume and packed CLI acceptance, clean CI, actual staging and release/tag verification remain outstanding. Preserve the full original acceptance criteria in 0100.

## Merge boundary

`main` is still the integration base. The local branch also contains 22 older authoring/native-server paths with **915 additions and 49 deletions**. They are explicitly listed in both source-audit artifacts; they remain unmerged and excluded from a UI-only review. The user subsequently approved the narrow learner host-read/preparation split, whose pending working changes are limited to `server/lesson/routes.ts`, `service.ts` and `service-state.test.ts`. Eve and agent/authoring-package working source remain unchanged. This exception does not authorize other service changes. Do not merge the branch wholesale or represent its entire history as presentation-only.

The approved adapter hunks in `service.ts` and `service-state.test.ts` sit on files that also contain older excluded history. Future integration must isolate the approved working hunks against main; copying or staging those entire files does not preserve this boundary.

The two CLI source changes are separately identifiable launcher/address work in `commands/ui.ts` and `portless-address.ts`, covered by the user's earlier explicit request for a stable `dojo.localhost` script/CLI address. They do not grant authorization for other CLI, agent or service changes.

Launcher verification, 2026-10-28: PATH selected global Portless 0.13.0 while the installed CLI dependency is 0.15.8. The root-owned shared daemon was started from that global installation on October 13; its entry file predates that start. `commands/ui.ts` now resolves and invokes the installed dependency with the current Node executable for both launch and route discovery, removing the global-command probe. The command-boundary regression failed on the global `portless` invocation before correction. Final CLI **161 passed (5.06s)**; launcher/address **8 passed**; CLI types and UI/CLI build passed. The owned native review service now runs the 0.15.8 entry, while the shared daemon/PID 14065 remains unchanged. Five canonical question/loading checks passed (12.4s); canonical HTTP 200 was verified.

The bounded asset comparison passed all 32 requests across direct/canonical origins, HTTP/1.1/HTTP/2 and requests with/without `curl --compressed`; all decoded bodies matched. The server returned no content-encoding header, so this does not establish compressed-response coverage. No repeated full browser run or proxy workaround was used to imply that the intermittent 502 is resolved. A shared-proxy refresh proposal is prepared at `/tmp/dojo-portless-proxy-refresh.md`, with current evidence in `/tmp/dojo-portless-version-evidence.json`. It requires a separate decision because the root-owned proxy serves other local apps. App processes/routes and existing HTTPS/td settings must be preserved; no shared restart has occurred.

Pending working-tree branding/auth/pricing/registry files and their manifests remain unstaged. Preserve them while preparing the eventual reviewed integration. UI approval does not authorize resuming Eve/core work, merging older service changes or publishing a release.

GATE for this handoff: verify all referenced repository paths and the eleven production imports; retain the recorded test/build evidence; confirm the service working diff contains exactly the three approved host-read adapter paths, agent/authoring-package working source is unchanged, and the older service-history exclusion still contains the documented 22 paths. Full 0109/0100 acceptance remains open.
