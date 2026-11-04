import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalSandbox } from "../src/local-sandbox.ts";
import { processStartTime, reapProcessGroups, recordProcessGroup } from "../src/process-groups.ts";

const roots: string[] = [];
const leftovers: number[] = [];
afterEach(async () => {
  for (const pid of leftovers.splice(0)) { try { process.kill(-pid, "SIGKILL"); } catch {} }
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const temporary = async () => { const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-process-groups-"))); roots.push(root); return root; };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const lines = (record: string) => readFileSync(record, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));

async function waitFor(check: () => boolean) {
  for (const deadline = Date.now() + 5_000; !check() && Date.now() < deadline;) await delay(25);
  return check();
}

describe("process-group records", () => {
  it("records and forgets a spawned group", async () => {
    const root = await temporary();
    const record = join(root, "processes/workspace.sensei.jsonl");
    const sandbox = await createLocalSandbox(root, { processRecord: record });
    const child = await sandbox.spawn({ command: "sleep 0.2" });
    expect(lines(record)).toEqual([{ op: "add", pid: child.pid, startedAt: expect.any(String) }]);
    await child.wait();
    await sandbox.stop();
    expect(lines(record)).toEqual([{ op: "add", pid: child.pid, startedAt: expect.any(String) }, { op: "remove", pid: child.pid }]);
    expect(reapProcessGroups(record)).toEqual([]);
  });

  it("reaps a recorded group that is still running, with the groups it started", async () => {
    const root = await temporary();
    const record = join(root, "host.jsonl");
    const pidFile = join(root, "grandchild.pid");
    // The leader starts a child in a group of its own, as OpenCode's bridge does with its server
    const leader = spawn(process.execPath, ["-e", `
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
      require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
      setInterval(() => {}, 1000);
    `], { detached: true, stdio: "ignore" });
    leftovers.push(leader.pid!);
    expect(await waitFor(() => { try { return Boolean(readFileSync(pidFile, "utf8")); } catch { return false; } })).toBe(true);
    const grandchild = Number(readFileSync(pidFile, "utf8"));
    leftovers.push(grandchild);
    recordProcessGroup(record, leader.pid!);
    expect(reapProcessGroups(record)).toEqual([leader.pid]);
    expect(await waitFor(() => !alive(leader.pid!) && !alive(grandchild))).toBe(true);
    expect(readFileSync(record, "utf8")).toBe("");
  });

  it("never kills a recorded pid whose start time changed", async () => {
    const root = await temporary();
    const record = join(root, "host.jsonl");
    const sleeper = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
    leftovers.push(sleeper.pid!);
    expect(await waitFor(() => processStartTime(sleeper.pid!) !== undefined)).toBe(true);
    writeFileSync(record, `${JSON.stringify({ op: "add", pid: sleeper.pid, startedAt: "a different start" })}\n`);
    expect(reapProcessGroups(record)).toEqual([]);
    await delay(100);
    expect(alive(sleeper.pid!)).toBe(true);
  });
});
