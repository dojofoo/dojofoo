# @dojofoo/starter

A minimal but complete TypeScript dojo. Use it to try dojofoo or as the reference structure for authoring a new course.

## Try the dojo

```sh
npx dojofoo install
npx dojofoo add starter
```

Then run `/kata` in your configured coding agent or start `npx dojofoo ui`.

## Use it as an authoring template

1. Copy this directory into a new repository.
2. Rename the npm package and `dojo.json` manifest.
3. Replace the course description and `DOJO.md` teaching rules.
4. Replace the sample katas while retaining their file contract.
5. Run the kata tests against private reference implementations, restore the learner scaffolds, then run `npm pack --dry-run` before publishing.

Every kata contains:

- `KATA.md` — the learner-visible goal and contract.
- `SENSEI.md` — private teaching prompts, test map, pitfalls, and completion bridge.
- `solution.ts` — the only file the learner edits.
- `solution.test.ts` — deterministic checks consumed by the dojofoo reporter.

The package intentionally contains no completed solutions.

## Required package contract

- `dojo.json` defines ordered kata templates and runner behavior.
- `DOJO.md` defines course-wide teaching boundaries.
- `skills/` contains optional domain context linked into supported harnesses.
- `vitest.config.ts` aliases learner work from the host project's `katas/` directory.
- The npm `files` allowlist includes only material learners and agents need.

Keep tests deterministic, keep learner briefs free of answers, and make every `SENSEI.md` useful without requiring the agent to infer the lesson design.

The short name works through the registry document at `https://dojo.foo/r/starter.json`. Publishing a package does not silently make it official: add the matching registry document and index entry when a dojo should be discoverable as `npx dojofoo add <name>`.
