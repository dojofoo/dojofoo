// Package dependency direction (docs/designs/agent-runtime.md, "Packages and dependency direction"):
// protocol <- harness (agent, agent-api) <- agents (authoring) <- (ui server, cli). Each exemption names the
// step of the design's roadmap that removes it.
const exempt = (...files) => files.map(file => `^${file.replaceAll(".", "\\.")}$`);
const relativeExemptions = exempt(
  "packages/authoring/src/eve/browser.fixture.mjs",              // loopback: step 8; ui/server/harness/opencode.ts: step 7
  "packages/authoring/src/eve/conformance.fixture.ts",           // loopback model: step 8
  "packages/authoring/src/eve/pi-workspace.test.ts",             // loopback model: step 8
  "packages/authoring/src/eve/runtime-turn.test.ts",             // loopback model: step 8
  "packages/cli/test/learner-notes.integration.test.ts",         // run coordinator and lesson MCP: step 7
  "packages/cli/test/starter-courses.test.ts",                   // permanent: checks starters with the UI's parser
  "packages/evals/src/authoring-continuation.live.test.ts",      // eve/prepare: step 8
  "packages/uix/.storybook/language-api.ts",                     // permanent: Storybook dev server only
);

module.exports = {
  forbidden: [
    { name: "no-relative-cross-package", severity: "error",
      from: { path: "^packages/([^/]+)/", pathNot: relativeExemptions },
      to: { dependencyTypes: ["local"], path: "^packages/", pathNot: "^packages/$1/" } },
    { name: "protocol-is-a-leaf", severity: "error", from: { path: "^packages/protocol/" }, to: { path: "^packages/(?!protocol/)" } },
    { name: "harness-imports-no-persona", severity: "error", from: { path: "^packages/(agent|agent-api)/" },
      to: { path: "^packages/(authoring|ui|cli|evals|uix|avatar)/" } },
    { name: "harness-reads-only-agent-installations-from-config", severity: "error", from: { path: "^packages/(agent|agent-api)/" },
      to: { path: "^packages/config/", pathNot: "^packages/config/(src|dist)/agent-installations\\.(ts|js)$" } },
    { name: "agents-below-ui-and-cli", severity: "error",
      from: { path: "^packages/authoring/", pathNot: exempt("packages/authoring/src/eve/browser.fixture.mjs") },   // step 7
      to: { path: "^packages/(ui|cli|evals|uix)/" } },
    { name: "config-depends-on-protocol-only", severity: "error", from: { path: "^packages/config/" }, to: { path: "^packages/(?!config/|protocol/)" } },
    { name: "uix-depends-on-protocol-only", severity: "error",
      from: { path: "^packages/uix/", pathNot: exempt("packages/uix/.storybook/language-api.ts") }, to: { path: "^packages/(?!uix/|protocol/)" } },
    { name: "evals-depend-on-harness-and-agents", severity: "error", from: { path: "^packages/evals/" }, to: { path: "^packages/(ui|cli|uix)/" } },
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
