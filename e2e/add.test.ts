import { describe, it, expect } from "vitest";

import { execScript } from "./container";

interface AddCase {
  name: string;
  prep: string;
  expectStdoutMatches?: RegExp;
}

const CASES: AddCase[] = [
  {
    name: "installs a local dojo from a path source",
    prep: "npx dojofoo add /workspace/dojos/effect-ts",
  },
  {
    name: "rejects re-adding an existing dojo without --force",
    prep:
      "npx dojofoo add /workspace/dojos/effect-ts >/dev/null 2>&1\n" +
      "if npx dojofoo add /workspace/dojos/effect-ts; then echo 'expected non-zero'; exit 1; fi",
    expectStdoutMatches: /already exists/i,
  },
  {
    name: "--force replaces an existing dojo",
    prep:
      "npx dojofoo add /workspace/dojos/effect-ts >/dev/null 2>&1\n" +
      "npx dojofoo add /workspace/dojos/effect-ts --force",
  },
];

describe("npx dojofoo add (per scenario)", () => {
  it.each(CASES)("$name", (c) => {
    const dir = `/tmp/add-${c.name.replace(/[^a-z0-9]+/gi, "-")}`;
    const script = `
export CLAUDECODE=1
rm -rf ${dir}
mkdir -p ${dir} && cd ${dir}
echo '{"name":"add","private":true,"type":"module"}' > package.json
npx dojofoo install >/dev/null 2>&1
${c.prep}
echo '<<<DOJORC>>>'
cat .dojorc 2>/dev/null
echo '<<<END_DOJORC>>>'
echo '<<<DOJO_JSON>>>'
cat .dojos/effect-ts/dojo.json 2>/dev/null
echo '<<<END_DOJO_JSON>>>'
`;
    const { output, exitCode } = execScript(script);
    expect(exitCode, `script exited non-zero:\n${output}`).toBe(0);

    if (c.expectStdoutMatches) expect(output).toMatch(c.expectStdoutMatches);

    const section = (name: string) => {
      const m = output.match(new RegExp(`<<<${name}>>>\\n([\\s\\S]*?)\\n<<<END_${name}>>>`));
      return m?.[1] ?? "";
    };

    const rc = JSON.parse(section("DOJORC"));
    expect(rc.currentDojo, ".dojorc.currentDojo not set").toBe("effect-ts");

    const manifest = JSON.parse(section("DOJO_JSON"));
    expect(manifest.name, "manifest.name does not reference effect-ts").toMatch(/(^|\/)effect-ts$/);
  }, 60_000);
});
