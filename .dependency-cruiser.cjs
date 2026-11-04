// Package dependency direction (docs/designs/agent-runtime.md, "Packages and dependency direction"):
// protocol <- harness <- agents (authoring) <- (ui server, cli). Each exemption names the
// step of the design's roadmap that removes it.
const exempt = (...files) => files.map(file => `^${file.replaceAll(".", "\\.")}$`);
const relativeExemptions = exempt(
  "packages/authoring/src/eve/browser.fixture.mjs",              // loopback: step 8
  "packages/authoring/src/eve/conformance.fixture.ts",           // loopback model: step 8
  "packages/authoring/src/eve/pi-workspace.test.ts",             // loopback model: step 8
  "packages/authoring/src/eve/runtime-turn.test.ts",             // loopback model: step 8
  "packages/cli/test/starter-courses.test.ts",                   // permanent: checks starters with the UI's parser
  "packages/uix/.storybook/language-api.ts",                     // permanent: Storybook dev server only
);
// The harness's entry points (agent-runtime.steps/step-8.md, "The harness's entry points"): the UI server, the CLI and the browser
// import only the closed set (A), and the test entries (C) only in their tests. A package import resolves to its types target.
const testFiles = ["\\.(test|spec)\\.[cm]?[jt]sx?$", "\\.fixture\\.[cm]?[jt]sx?$", "/e2e/"];
const closedSet = "^packages/harness/(dist/(eve/dist/src/index|eve/dist/src/client/index|eve/dist/src/react/index|server|host-port/index|adapters|persona|messages)\\.(d\\.ts|js)|src/api/index\\.ts)$";
const testEntries = "^packages/harness/(dist/(host-port/fixture|scripted-harness|local-history)\\.(d\\.ts|js)|src/api/fixtures\\.ts)$";

module.exports = {
  forbidden: [
    { name: "no-relative-cross-package", severity: "error",
      from: { path: "^packages/([^/]+)/", pathNot: relativeExemptions },
      to: { dependencyTypes: ["local"], path: "^packages/", pathNot: "^packages/$1/" } },
    { name: "protocol-is-a-leaf", severity: "error", from: { path: "^packages/protocol/" }, to: { path: "^packages/(?!protocol/)" } },
    { name: "harness-imports-no-persona", severity: "error", from: { path: "^packages/harness/" },
      to: { path: "^packages/(authoring|ui|cli|evals|uix|avatar)/" } },
    { name: "harness-reads-only-agent-installations-from-config", severity: "error", from: { path: "^packages/harness/" },
      to: { path: "^packages/config/", pathNot: "^packages/config/(src|dist)/agent-installations\\.(ts|js)$" } },
    { name: "agents-below-ui-and-cli", severity: "error", from: { path: "^packages/authoring/" }, to: { path: "^packages/(ui|cli|evals|uix)/" } },
    { name: "config-depends-on-protocol-only", severity: "error", from: { path: "^packages/config/" }, to: { path: "^packages/(?!config/|protocol/)" } },
    { name: "uix-depends-on-protocol-only", severity: "error",
      from: { path: "^packages/uix/", pathNot: exempt("packages/uix/.storybook/language-api.ts") }, to: { path: "^packages/(?!uix/|protocol/)" } },
    { name: "evals-depend-on-harness-and-agents", severity: "error", from: { path: "^packages/evals/" }, to: { path: "^packages/(ui|cli|uix)/" } },
    { name: "harness-closed-surface", severity: "error", from: { path: "^packages/(ui|cli)/", pathNot: testFiles },
      to: { path: "^packages/harness/", pathNot: closedSet } },
    { name: "harness-closed-surface-in-tests", severity: "error", from: { path: testFiles.map(file => `^packages/(ui|cli)/.*${file}`) },
      to: { path: "^packages/harness/", pathNot: [closedSet, testEntries] } },
    { name: "harness-test-entries", severity: "error",
      from: { path: "^packages/", pathNot: ["^packages/harness/", "^packages/authoring/scripts/", "^packages/evals/", ...testFiles] },
      to: { path: testEntries } },
    // An entry point that is gone fails here too in the untyped .mjs scripts. The harness's experiments import packed packages; the
    // session API's fixture Eve project reaches the harness only through the link its run folder gets (startEve)
    { name: "dojofoo-imports-resolve", severity: "error", from: { pathNot: ["^packages/harness/experiments/", "^packages/harness/test/api/eve/"] },
      to: { couldNotResolve: true, path: "^@dojofoo/" } },
  ],
  options: {
    // Package imports resolve to dist; following into it would hide the importing package's edges
    doNotFollow: { path: "(^|/)(node_modules|dist)(/|$)" },
    exclude: { path: "(^|/)(node_modules|\\.output|\\.package|\\.eve|\\.runs|\\.turbo|test-results|storybook-static)(/|$)" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs", ".d.ts"] },
  },
};
