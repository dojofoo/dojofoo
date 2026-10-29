# Draft starter courses

These editable sources are the first content drafts for the UIX adoption plan. Both use the existing interactive manifest and lesson format. `marketplace: false` keeps them out of public registration. Neither is a finished curriculum or an invitation to publish.

- `create-your-own-dojo`: narrow an outcome, create an independent kata draft through the existing Kyoshi command, add a lesson, trial it, and review it.
- `how-to-run-a-dojo`: find a workspace and material, ask the Sensei, understand agent choices and checks, and resume later.

Install a source into a separate learning workspace with the existing local-path installer:

```sh
npx dojofoo add /absolute/path/to/dojo/courses/how-to-run-a-dojo --master
npx dojofoo
```

Use the corresponding path for `create-your-own-dojo`. `--master` keeps editable authoring source. A second installation requires an explicit update decision; these sources must not overwrite a learner's edited installation.

This is source-content preparation. Bundled offline installation, a starter selector, the independent authoring handoff, learner step-navigation presentation, and end-to-end trial/resume verification remain work in the adoption plan. The current local review UI intentionally omits the earlier Continue control. Do not advertise these drafts as a completed learner journey before the supported navigation and authoring flow are verified.

Run `pnpm --filter dojofoo exec vitest run test/starter-courses.test.ts` to validate local installation, content loading, recall/progress persistence, duplicate-install protection, and source isolation without an agent call.
