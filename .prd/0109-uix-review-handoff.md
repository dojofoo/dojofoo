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

Source audit: `/tmp/dojo-uix-review-scope.json` verifies eleven actual bindings. This is a presentation-ownership inventory, not proof that every backend journey is implemented. Legacy exported primitives, types and archived demonstrations remain where compatibility still requires them; their presence alone is not a reason to delete them.

## Evidence and limits

| Gate | Recorded result |
| --- | --- |
| Native presentation/adapter browser checks | 27 passed (1.1m); fixture-backed, no live model canary. |
| UIX browser coverage | 63 passed, 38 additional cases passed, then the two corrected corner audits passed (2.3m). The audits inspected all 59 active stories in both themes. These are 103 unique cases across recorded runs. |
| Canonical docs/API browser checks | Six docs cases passed; the originally failing API case passed after the web forwarding-header correction (9.3s). |
| Elysia/Fumadocs freshness | Generated spec and all ten prepared API pages verified. |
| Isolated production web build | Passed (33.58s), with 22 prerendered docs pages and all 502 inspected local HTML/CSS asset references present. |
| Isolated Storybook build | Passed (64.96s); its 80-story catalog matches the tested development catalog. |
| Isolated types and UIX units | Web/UIX types passed; 69 UIX tests passed (10.63s). Frozen offline dependency installation; all 1,304 copied source hashes and manifests retained. |

Detailed logs and snapshot paths are recorded in [0100](0100-uix-adoption.md) and `/tmp/dojo-ui-clean-build-evidence.json`. These gates include the pending UI/branding/auth/pricing source in the working tree. They are not committed-only Linux CI, a packed CLI, deployed staging or a production release.

The built production preview is not running at `127.0.0.1:4600`. Automatic approval review rejected launching it because command analysis failed unexpectedly. A manual launch was requested; production-browser hydration and runtime asset requests remain unverified. Static artifact validation does not replace that browser gate.

## Requirements that remain open

- Native first-run onboarding is not connected; the setup Page still demonstrates a preview controller. Profile editing/upload/save remain disabled, and sign-in/sign-out remain unavailable. Durable profile ownership must be resolved through supported contracts rather than an invented account or persistence layer.
- The two starters are always-visible draft shells. Independent tutorial drafts, packaged/offline installation, actual authored interactions and persistent grounded Sensei conversations are not accepted by the shell/browser checks.
- Unsupported native attachments and authoring agent/model capabilities remain unavailable. Existing agent-package contracts own execution; no Eve/core changes are authorized by UI review.
- Native installation/resume and packed CLI acceptance, clean CI, actual staging and release/tag verification remain outstanding. Preserve the full original acceptance criteria in 0100.

## Merge boundary

`main` is still the integration base. The local branch also contains 22 older authoring/native-server paths with **915 additions and 49 deletions**. They are explicitly listed in `/tmp/dojo-uix-review-scope.json`; they remain unmerged and excluded from a UI-only review. No further service changes have been made under the user's core freeze. Do not merge the branch wholesale or represent its entire history as presentation-only.

The two CLI source changes are separately identifiable launcher/address work in `commands/ui.ts` and `portless-address.ts`, covered by the user's earlier explicit request for a stable `dojo.localhost` script/CLI address. They do not grant authorization for other CLI, agent or service changes.

Pending working-tree branding/auth/pricing/registry files and their manifests remain unstaged. Preserve them while preparing the eventual reviewed integration. UI approval does not authorize resuming Eve/core work, merging older service changes or publishing a release.

GATE for this handoff: verify all referenced repository paths and the eleven production imports; retain the recorded test/build evidence; confirm the current service working diff is empty and the older service-history exclusion still contains the documented 22 paths. Full 0109/0100 acceptance remains open.
