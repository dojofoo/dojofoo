import { describe, it, expect } from "vitest";

import { AGENT_PROMPT } from "../apps/web/src/components/install-prompt";
import { AGENTS_TABLE } from "./agents-table";
import { execScript } from "./container";

const LOCAL_LLMS_BASE = "https://dojocho.td";
const TEST_PROMPT = AGENT_PROMPT.replace("https://dojocho.ai", LOCAL_LLMS_BASE);

const IN_SCOPE = AGENTS_TABLE.filter((r) => r.agent !== "claude");

describe("frontpage AGENT_PROMPT bootstraps dojocho on each agent", () => {
  it.each(IN_SCOPE)(
    "$agent: fetches llms.txt + runs npx dojofoo install, leaves .dojorc",
    { timeout: 60_000, retry: 1 },
    async (row) => {
      const project = `/tmp/bootstrap-${row.agent}-${Date.now()}`;
      const envExports = row.envVars.map((v) => `export ${v}=1`).join("; ");

      const script = `
${envExports}
mkdir -p ${project} && cd ${project}
echo '{"name":"bootstrap-${row.agent}","private":true,"type":"module"}' > package.json
${row.headless(TEST_PROMPT)} || true
echo '<<<DOJORC>>>'
cat .dojorc 2>/dev/null
echo '<<<END_DOJORC>>>'
`;
      const { output, exitCode, timedOut } = execScript(script, { timeoutMs: 55_000 });

      const m = output.match(/<<<DOJORC>>>\n([\s\S]*?)\n<<<END_DOJORC>>>/);
      const dojorcRaw = m?.[1] ?? "";

      const diag = `exitCode=${exitCode} timedOut=${timedOut}\n`
        + `dojorc:\n${dojorcRaw || "(empty)"}\n`
        + `--- agent output (tail) ---\n${output.slice(-1500)}`;

      let rc: { currentDojo?: string; editor?: string } | null = null;
      try { rc = JSON.parse(dojorcRaw); } catch {
        throw new Error(`agent ${row.agent} never produced a valid .dojorc:\n${diag}`);
      }
      expect(rc, `.dojorc not a valid object:\n${diag}`).toBeTypeOf("object");
      expect(rc, `.dojorc missing editor (npx dojofoo install didn't run):\n${diag}`)
        .toMatchObject({ editor: expect.any(String) });
      expect(rc?.currentDojo, `currentDojo is empty (agent ran install but skipped npx dojofoo add):\n${diag}`)
        .toMatch(/.+/);
    },
  );
});
