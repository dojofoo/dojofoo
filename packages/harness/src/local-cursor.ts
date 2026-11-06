import { createCursor } from "@ai-sdk/harness-cursor";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import { homedir } from "node:os";

/** Local launch binding only; the official adapter owns ACP, tools and sessions.
 * Empty auth explicitly bypasses subscription/keychain discovery. Cursor itself
 * uses its normal home and login. No credentials are read, copied or persisted.
 */
export function createLocalCursor(): ReturnType<typeof createCursor> {
  const harness = createCursor({ port: 0, auth: {} });
  return {
    ...harness,
    async getBootstrap(options) {
      const bootstrap = await harness.getBootstrap!(options);
      const installPath = `${bootstrap.bootstrapDir}/install.sh`;
      const installer = bootstrap.files?.find(file => file.path === installPath);
      const installs = bootstrap.commands?.filter(item => item.command === "bash install.sh");
      if (!installer?.content.includes("curl https://cursor.com/install -fsS | bash") || installs?.length !== 1) {
        throw new Error("Cursor bootstrap changed; review the local launch binding before upgrading the adapter.");
      }
      // The installer also puts an `agent` command on PATH, which other CLIs (Grok) share
      const binary = resolveAgentExecutable("cursor");
      if (!binary) throw new Error("Cursor CLI is not installed. Install it with `curl https://cursor.com/install -fsS | bash` and log in with `cursor-agent login`.");
      if (!binary.startsWith("/") || binary.includes("\n")) throw new Error("Cursor CLI must resolve to one absolute executable path.");
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      return {
        ...bootstrap,
        // The adapter's bootstrap runs `agent`; only the executable it links to changes
        files: [...bootstrap.files?.filter(file => file.path !== installPath) ?? [], {
          path: `${bootstrap.bootstrapDir}/home/.local/bin/agent`,
          content: `#!/bin/sh\nHOME=${quote(homedir())} exec ${quote(binary)} "$@"\n`,
        }],
        commands: bootstrap.commands?.map(item => item.command === "bash install.sh"
          ? { ...item, command: "chmod 700 home/.local/bin/agent" }
          : item),
      };
    },
  };
}
