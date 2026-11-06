import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reapProcessGroups } from "./process-groups.js";

/** What a persona host's `/eve/v1/info` reports, as far as dojofoo reads it. */
export interface PersonaHostInfo {
  readonly hooks: ReadonlyArray<{ readonly slug: string; readonly eventNames: readonly string[] }>;
  readonly [key: string]: unknown;
}
type ProductionServer = { url: string; wait(): Promise<void>; close(): Promise<void> };
type StartServer = (appDir: string, options: { host: string; port: number }) => Promise<ProductionServer>;
type ReadInfo = (url: string, auth: { basic: { username: string; password: string } }) => Promise<PersonaHostInfo>;

export interface PersonaHostOptions {
  /** The persona's app folder, `<workspace>/.dojo/<persona>-app/agents/<persona>` (prepared by the composition root) */
  appDir: string;
  /** Where this host's native process groups are recorded */
  processRecord: string;
  /** Called before every start; written to appDir/runtime.json, then chmod 0600 */
  runtimeConfig(start: { secret: string; processRecord: string }): Promise<Record<string, unknown>>;
  /** Called after the server answers /eve/v1/info, before the host counts as ready */
  verify?(info: PersonaHostInfo): void;
  /** Tests only: replaces Eve's production server and its info read. */
  internal?: { startServer?: StartServer; readInfo?: ReadInfo };
}

export interface PersonaHost {
  start(): Promise<{ url: string; auth: { basic: { username: string; password: string } }; secret: string; exited: Promise<void> }>;
  close(): Promise<void>;
}

const productionServer: StartServer = async (appDir, options) => {
  // The facade build-runtime.mjs writes next to this module
  const { startProductionServer } = await import(new URL("./server-production.js", import.meta.url).href) as { startProductionServer: StartServer };
  return startProductionServer(appDir, options);
};
const eveInfo: ReadInfo = async (url, auth) => {
  const { Client } = await import(new URL("./eve/dist/src/client/index.js", import.meta.url).href) as {
    Client: new (options: { baseUrl: string; auth: typeof auth }) => { info(options: { signal: AbortSignal }): Promise<PersonaHostInfo> };
  };
  return new Client({ baseUrl: url, auth }).info({ signal: AbortSignal.timeout(10_000) });
};

/** One Eve production server per (workspace, persona), with a new secret on every start. It never imports a persona (D11). */
export function createPersonaHost(options: PersonaHostOptions): PersonaHost {
  const startServer = options.internal?.startServer ?? productionServer;
  const readInfo = options.internal?.readInfo ?? eveInfo;
  const runtimePath = join(options.appDir, "runtime.json");
  let production: ProductionServer | undefined;
  let starting: ReturnType<PersonaHost["start"]> | undefined;
  let closing: Promise<void> | undefined;
  const stopServer = async () => {
    const server = production;
    production = undefined;
    await server?.close();
  };
  return {
    start() {
      if (closing) return Promise.reject(new Error("This persona host is closed."));
      return starting ??= (async () => {
        try {
          // Native processes a crashed earlier start left behind
          reapProcessGroups(options.processRecord);
          const secret = randomBytes(32).toString("hex");
          const auth = { basic: { username: "dojo-host", password: secret } };
          const config = await options.runtimeConfig({ secret, processRecord: options.processRecord });
          await writeFile(runtimePath, JSON.stringify({ ...config, auth: auth.basic, processRecord: options.processRecord }), { mode: 0o600 });
          // writeFile's mode applies only to a new file
          await chmod(runtimePath, 0o600);
          production = await startServer(options.appDir, { host: "127.0.0.1", port: 0 });
          // A bound port is not proof that Eve can load the authored agent
          const info = await readInfo(production.url, auth);
          options.verify?.(info);
          const started = production;
          // A server that exits on its own leaves this host to start a new one
          const exited = started.wait().finally(() => { if (!closing && production === started) { production = undefined; starting = undefined; } });
          exited.catch(() => {});
          return { url: started.url, auth, secret, exited };
        } catch (error) {
          await stopServer().catch(() => {});
          throw error;
        }
      })();
    },
    close() {
      return closing ??= (async () => {
        await starting?.catch(() => {});
        await stopServer();
      })();
    },
  };
}
