import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processStartTime } from "@dojofoo/agent/persona";
import { acquireServerLock, releaseServerLock } from "./server-lock";

const homes: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const home = () => { const path = mkdtempSync(join(tmpdir(), "dojofoo-lock-")); homes.push(path); return path; };
const lock = (stateHome: string) => JSON.parse(readFileSync(join(stateHome, "ui.lock"), "utf8"));

describe("the single-UI-server lock", () => {
  it("takes a missing or stale lock", () => {
    const missing = home();
    expect(acquireServerLock({ stateHome: missing, url: "http://127.0.0.1:4567" })).toBe(true);
    expect(lock(missing)).toMatchObject({ pid: process.pid, url: "http://127.0.0.1:4567" });
    releaseServerLock(missing);
    const stale = home();
    // A pid no process has, and a live pid whose start time differs (a reused pid)
    for (const holder of [{ pid: 2 ** 22 + 7, startedAt: "never", url: "http://old" }, { pid: process.ppid, startedAt: "not its start time", url: "http://reused" }]) {
      writeFileSync(join(stale, "ui.lock"), JSON.stringify(holder));
      expect(acquireServerLock({ stateHome: stale, url: "http://new", waitMs: 0, exit: () => { throw new Error("must not exit"); } })).toBe(true);
      expect(lock(stale)).toMatchObject({ pid: process.pid, url: "http://new" });
    }
    releaseServerLock(stale);
  });

  it("a lock naming this process counts as taken", () => {
    const stateHome = home();
    writeFileSync(join(stateHome, "ui.lock"), JSON.stringify({ pid: process.pid, startedAt: processStartTime(process.pid), url: "http://first-load" }));
    const exit = vi.fn();
    expect(acquireServerLock({ stateHome, url: "http://second-load", waitMs: 0, exit })).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    releaseServerLock(stateHome);
  });

  it("releases only its own lock", () => {
    const stateHome = home();
    writeFileSync(join(stateHome, "ui.lock"), JSON.stringify({ pid: process.ppid, startedAt: processStartTime(process.ppid), url: "http://other" }));
    releaseServerLock(stateHome);
    expect(existsSync(join(stateHome, "ui.lock"))).toBe(true);
    rmSync(join(stateHome, "ui.lock"));
    acquireServerLock({ stateHome, url: "http://mine" });
    releaseServerLock(stateHome);
    expect(existsSync(join(stateHome, "ui.lock"))).toBe(false);
  });

  it("a second UI server on the same DOJOFOO_HOME waits, then refuses with the holder's URL", async () => {
    const stateHome = home();
    const holder = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      await new Promise(resolve => holder.once("spawn", resolve));
      writeFileSync(join(stateHome, "ui.lock"), JSON.stringify({ pid: holder.pid, startedAt: processStartTime(holder.pid!), url: "http://127.0.0.1:4999" }));
      const printed = vi.spyOn(console, "error").mockImplementation(() => {});
      const exit = vi.fn();
      const started = performance.now();
      expect(acquireServerLock({ stateHome, url: "http://127.0.0.1:5000", waitMs: 500, exit })).toBe(false);
      const waited = performance.now() - started;
      expect(waited).toBeGreaterThanOrEqual(450);
      expect(waited).toBeLessThan(3_000);
      expect(exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(printed).toHaveBeenCalledWith("Dojofoo is already running at http://127.0.0.1:4999.");
      expect(lock(stateHome)).toMatchObject({ pid: holder.pid });
    } finally { holder.kill("SIGKILL"); }
  });
});
