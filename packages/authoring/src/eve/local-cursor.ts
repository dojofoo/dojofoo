import { execFileSync } from "node:child_process";
import { createCursor } from "@ai-sdk/harness-cursor";

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
      const descriptorPath = `${bootstrap.bootstrapDir}/implementation/implementation.json`;
      const installPath = `${bootstrap.bootstrapDir}/implementation/install.sh`;
      const descriptorFile = bootstrap.files?.find(file => file.path === descriptorPath);
      const descriptor = descriptorFile && JSON.parse(String(descriptorFile.content));
      const installs = bootstrap.commands?.filter(item => item.command === "bash implementation/install.sh");
      if (descriptor?.executablePath !== "home/.local/bin/agent" || descriptor.privateHome !== true || installs?.length !== 1) {
        throw new Error("Cursor bootstrap changed; review the local launch binding before upgrading the adapter.");
      }
      let binary: string;
      try { binary = execFileSync("which", ["agent"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
      catch { throw new Error("Cursor CLI is not installed. Install `agent` and log in with `agent login`."); }
      if (!binary.startsWith("/") || binary.includes("\n")) throw new Error("Cursor CLI must resolve to one absolute executable path.");
      const quoted = `'${binary.replaceAll("'", "'\\''")}'`;
      return {
        ...bootstrap,
        files: bootstrap.files?.filter(file => file.path !== installPath).map(file => file.path === descriptorPath
          ? { ...file, content: JSON.stringify({ ...descriptor, privateHome: false, envKeys: [] }) }
          : file),
        commands: bootstrap.commands?.map(item => item.command === "bash implementation/install.sh"
          ? { ...item, command: `mkdir -p implementation/home/.local/bin && ln -sf ${quoted} implementation/home/.local/bin/agent` }
          : item),
      };
    },
  };
}
