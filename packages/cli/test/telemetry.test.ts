import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  flushCourseEvents,
  queueCourseEvent,
  resetCourseEventsForTest,
} from "../src/telemetry";
import { kata } from "../src/commands/kata";

describe("course lifecycle telemetry", () => {
  const roots: string[] = [];

  afterEach(() => {
    resetCourseEventsForTest();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  function projectRoot() {
    const root = mkdtempSync(join(tmpdir(), "dojo-telemetry-"));
    roots.push(root);
    return root;
  }

  it("uses a stable project instance and sends only the lifecycle event", async () => {
    const root = projectRoot();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DOJO_API_URL", "https://courses.example.test");

    queueCourseEvent(root, "@dojocho/effect-ts", "installed");
    queueCourseEvent(root, "@dojocho/effect-ts", "started", "001-hello-effect");
    await flushCourseEvents();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0]).toEqual({
      instanceId: expect.any(String),
      courseId: "dojocho/effect-ts",
      event: "installed",
      occurredAt: expect.any(String),
    });
    expect(bodies[1]).toEqual({
      instanceId: bodies[0].instanceId,
      courseId: "dojocho/effect-ts",
      event: "started",
      kata: "001-hello-effect",
      occurredAt: expect.any(String),
    });
    expect(Object.keys(bodies[0])).not.toContain("cwd");
    expect(Object.keys(bodies[0])).not.toContain("sessionId");

    const state = JSON.parse(readFileSync(resolve(root, ".dojo/instance.json"), "utf8"));
    expect(state).toEqual({ version: 1, instanceId: bodies[0].instanceId });
  });

  it("does not write state or send events when telemetry is disabled", async () => {
    const root = projectRoot();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("DO_NOT_TRACK", "1");

    queueCourseEvent(root, "effect-ts", "installed");
    await flushCourseEvents();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(resolve(root, ".dojo/instance.json"))).toBe(false);
  });

  it("does not fail the command when the metrics service is unavailable", async () => {
    const root = projectRoot();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    queueCourseEvent(root, "effect-ts", "started", "001-basics");

    await expect(flushCourseEvents()).resolves.toBeUndefined();
  });

  it("reports start, completion, and course finish from kata commands", async () => {
    const root = projectRoot();
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
      currentDojo: "effect-ts",
      currentKata: null,
      editor: null,
    }));
    const dojoKata = resolve(root, ".dojos/effect-ts/katas/001-basics");
    mkdirSync(dojoKata, { recursive: true });
    writeFileSync(resolve(root, ".dojos/effect-ts/dojo.json"), JSON.stringify({
      name: "@dojocho/effect-ts",
      version: "1.0.0",
      description: "test",
      runner: { adapter: "exit-code" },
      test: "true",
      katas: [{ name: "001-basics", template: "katas/001-basics/solution.ts" }],
    }));
    writeFileSync(resolve(dojoKata, "solution.ts"), "export const answer = 42;\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});

    kata(root, ["--start"]);
    kata(root, ["--check", "--reporter=json"]);
    await flushCourseEvents();

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.map(({ event, kata }) => ({ event, kata }))).toEqual([
      { event: "started", kata: "001-basics" },
      { event: "kata_completed", kata: "001-basics" },
      { event: "finished", kata: "001-basics" },
    ]);
  });
});
