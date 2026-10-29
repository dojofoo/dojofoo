import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RouteStore } from "portless";
import { pinPortlessAddress } from "../src/portless-address";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("keeps the UI at dojo.localhost without replacing the website's dojo.td route", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-portless-")); roots.push(root);
  const store = new RouteStore(root);
  store.addRoute("dojo.td", 4543, 0);
  store.addRoute("dojofoo-ui-dojo.td", 4760, process.pid);
  expect(pinPortlessAddress("https://dojofoo-ui-dojo.td", "dojo.localhost", root)).toBe("https://dojo.localhost");
  expect(store.loadRoutes()).toEqual(expect.arrayContaining([
    expect.objectContaining({ hostname: "dojo.td", port: 4543, pid: 0 }),
    expect.objectContaining({ hostname: "dojo.localhost", port: 4760, pid: process.pid }),
  ]));
});

it("preserves an HTTP proxy's scheme and port for an explicitly named UI", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-portless-")); roots.push(root);
  new RouteStore(root).addRoute("dojofoo-ui-team.test", 4780, process.pid);
  expect(pinPortlessAddress("http://dojofoo-ui-team.test:1355", "team.localhost", root)).toBe("http://team.localhost:1355");
});

it("does not advertise an address before the managed server registers", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-portless-")); roots.push(root);
  expect(pinPortlessAddress("https://missing.td", "dojo.localhost", root)).toBeNull();
  expect(new RouteStore(root).loadRoutes()).toEqual([]);
});

it("replaces a static alias without signaling process group zero", () => {
  const root = mkdtempSync(join(tmpdir(), "dojo-portless-")); roots.push(root);
  const store = new RouteStore(root);
  store.addRoute("dojo.localhost", 4567, 0);
  store.addRoute("dojofoo-ui-dojo.td", 4780, process.pid);
  const kill = vi.spyOn(process, "kill").mockReturnValue(true);
  expect(pinPortlessAddress("https://dojofoo-ui-dojo.td", "dojo.localhost", root)).toBe("https://dojo.localhost");
  expect(kill).not.toHaveBeenCalledWith(0, "SIGTERM");
});
