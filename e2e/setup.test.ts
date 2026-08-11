import { describe, it, expect } from "vitest";

import { AGENTS_TABLE } from "./agents-table";
import { execScript } from "./container";

describe("npx dojos install writes the contracted scaffold", () => {
  it.each(AGENTS_TABLE)(
    "$agent: detects env, writes canonical commands + per-agent symlinks + settings",
    (row) => {
      const project = `/tmp/setup-${row.agent}`;
      const envExports = row.envVars.map((v) => `export ${v}=1`).join("; ");
      const script = `
${envExports}
rm -rf ${project}
mkdir -p ${project} && cd ${project}
echo '{"name":"setup-${row.agent}","private":true,"type":"module"}' > package.json
npx dojos install
echo '<<<DOJO_MD>>>'
cat .agents/commands/dojo.md
echo '<<<END_DOJO_MD>>>'
echo '<<<KATA_MD>>>'
cat .agents/commands/kata.md
echo '<<<END_KATA_MD>>>'
echo '<<<DOJO_SYMLINK>>>'
readlink ${row.dir}/${row.commandsDir}/dojo.md
echo '<<<END_DOJO_SYMLINK>>>'
echo '<<<KATA_SYMLINK>>>'
readlink ${row.dir}/${row.commandsDir}/kata.md
echo '<<<END_KATA_SYMLINK>>>'
echo '<<<SETTINGS>>>'
cat ${row.dir}/settings.json 2>/dev/null || echo '(no settings.json)'
echo '<<<END_SETTINGS>>>'
`;
      const { output, exitCode } = execScript(script);
      expect(exitCode, `npx dojos install for ${row.agent} failed:\n${output}`).toBe(0);

      const section = (name: string) => {
        const m = output.match(new RegExp(`<<<${name}>>>\\n([\\s\\S]*?)\\n<<<END_${name}>>>`));
        return m?.[1] ?? "";
      };

      expect(section("DOJO_MD").trim(), "dojo.md is empty").not.toBe("");
      expect(section("KATA_MD").trim(), "kata.md is empty").not.toBe("");

      expect(section("DOJO_SYMLINK")).toMatch(/\.agents\/commands\/dojo\.md$/);
      expect(section("KATA_SYMLINK")).toMatch(/\.agents\/commands\/kata\.md$/);

      const settings = section("SETTINGS").trim();
      if (row.hasSettings) {
        const parsed = JSON.parse(settings);
        expect(parsed.permissions?.allow, `${row.agent} settings missing allow list`)
          .toContain("Bash(npx dojos *)");
      } else {
        expect(settings).toBe("(no settings.json)");
      }

    },
    60_000,
  );

  it("setup falls back to the AskUserQuestion prompt when no agent env present", () => {
    const unsets = AGENTS_TABLE.flatMap((r) => r.envVars).map((v) => `unset ${v}`).join("; ");
    const script = `
${unsets}
rm -rf /tmp/setup-prompt
mkdir -p /tmp/setup-prompt && cd /tmp/setup-prompt
echo '{"name":"setup-prompt","private":true,"type":"module"}' > package.json
npx dojos install
`;
    const { output, exitCode } = execScript(script);
    expect(exitCode, output).toBe(0);
    expect(output).toMatch(/AskUserQuestion/);
    expect(output).toMatch(/Claude Code/);
    expect(output).toMatch(/Pi/);
  }, 60_000);
});
