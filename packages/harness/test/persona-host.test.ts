import { spawn } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createPersonaHost, type PersonaHostOptions } from "../src/persona-host.ts";
import { recordProcessGroup } from "../src/process-groups.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function host(overrides: Partial<PersonaHostOptions> = {}) {
  const appDir = await realpath(await mkdtemp(join(tmpdir(), "dojo-persona-host-")));
  roots.push(appDir);
  const servers: Array<{ exit(): void; closed: boolean }> = [];
  const events: string[] = [];
  const options: PersonaHostOptions = {
    appDir,
    processRecord: join(appDir, "processes/w1.sensei.jsonl"),
    runtimeConfig: async ({ secret }) => { events.push("config"); return { hostPort: { secret } }; },
    internal: {
      startServer: async () => {
        events.push("server");
        const exit = Promise.withResolvers<void>();
        const server = { closed: false, exit: () => exit.resolve() };
        servers.push(server);
        return { url: `http://127.0.0.1:${servers.length}`, wait: () => exit.promise, close: async () => { server.closed = true; exit.resolve(); } };
      },
      readInfo: async () => ({ hooks: [{ slug: "dojofoo-lifecycle", eventNames: ["turn.settled"] }] }),
    },
    ...overrides,
  };
  return { appDir, servers, events, options, host: createPersonaHost(options) };
}

describe("persona host", () => {
  it("a new secret on every start", async () => {
    const { host: persona, appDir } = await host();
    const first = await persona.start();
    expect(first.secret).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.auth).toEqual({ basic: { username: "dojo-host", password: first.secret } });
    const written = JSON.parse(readFileSync(join(appDir, "runtime.json"), "utf8"));
    expect(written).toMatchObject({ auth: { username: "dojo-host", password: first.secret }, hostPort: { secret: first.secret }, processRecord: join(appDir, "processes/w1.sensei.jsonl") });
    await persona.close();
    const { host: again } = await host({ appDir });
    const second = await again.start();
    expect(second.secret).not.toBe(first.secret);
    await again.close();
  });

  it("runtime.json is mode 0600 after every write, also when it already existed", async () => {
    const { host: persona, appDir } = await host();
    writeFileSync(join(appDir, "runtime.json"), "{}", { mode: 0o644 });
    await persona.start();
    expect(statSync(join(appDir, "runtime.json")).mode & 0o777).toBe(0o600);
    await persona.close();
  });

  it("reaps recorded groups before starting", async () => {
    const { host: persona, options, events } = await host();
    const sleeper = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
    try {
      for (const deadline = Date.now() + 5_000; Date.now() < deadline; await delay(25)) {
        recordProcessGroup(options.processRecord, sleeper.pid!);
        if (readFileSync(options.processRecord, "utf8")) break;
      }
      const exited = new Promise(resolve => sleeper.once("exit", resolve));
      await persona.start();
      await expect(Promise.race([exited.then(() => "exited"), delay(5_000).then(() => "running")])).resolves.toBe("exited");
      expect(events).toEqual(["config", "server"]);
      expect(readFileSync(options.processRecord, "utf8")).toBe("");
    } finally {
      try { process.kill(-sleeper.pid!, "SIGKILL"); } catch {}
      await persona.close();
    }
  });

  it("a host that exits on its own starts again", async () => {
    const { host: persona, servers } = await host();
    const first = await persona.start();
    expect(await persona.start()).toBe(first);
    servers[0]!.exit();
    await first.exited;
    const second = await persona.start();
    expect(second.url).not.toBe(first.url);
    expect(second.secret).not.toBe(first.secret);
    await persona.close();
    expect(servers[1]!.closed).toBe(true);
    await expect(persona.start()).rejects.toThrow("closed");
  });

  it("refuses a host whose info fails verification and closes its server", async () => {
    const { host: persona, servers } = await host({ verify: () => { throw new Error("The prepared build lacks dojofoo's lifecycle hook."); } });
    await expect(persona.start()).rejects.toThrow("lifecycle hook");
    expect(servers[0]!.closed).toBe(true);
  });
});
