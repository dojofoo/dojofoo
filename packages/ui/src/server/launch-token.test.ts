import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { LAUNCH_TOKEN_HEADER } from "@dojofoo/agent-api";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import { app } from "./app";
import { launchToken } from "./launch-token";

const temporaryPaths: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

const tokenRequest = (headers: Record<string, string> = {}) => app.fetch(new Request("http://localhost/api/control/launch-token", { headers }));

it("serves one token per process with no-store", async () => {
  const first = await tokenRequest({ "Sec-Fetch-Site": "same-origin" });
  expect(first.status).toBe(200);
  expect(first.headers.get("cache-control")).toBe("no-store");
  const { token } = await first.json() as { token: string };
  expect(token).toMatch(/^[\w-]{43}$/u);
  expect(token).toBe(launchToken());
  expect(await (await tokenRequest({ Origin: "http://localhost" })).json()).toEqual({ token });
});

it("refuses to hand the token to another site", async () => {
  for (const headers of [{ Origin: "https://attacker.example" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }] as Array<Record<string, string>>) {
    const response = await tokenRequest(headers);
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain(launchToken());
  }
});

it("the mounted select route refuses an earlier launch's token", async () => {
  const root = mkdtempSync(join(tmpdir(), "dojofoo-launch-workspace-"));
  const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-launch-home-"));
  temporaryPaths.push(root, stateHome);
  vi.stubEnv("DOJOFOO_HOME", stateHome);
  writeFileSync(resolve(root, "dojo.yaml"), "name: '@test/draft'\nversion: 1.0.0\n");
  mkdirSync(resolve(root, ".dojo"));
  writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "codex" }));
  const workspaceId = observeWorkspacePath(root, { stateHome, kind: "draft" });
  const select = (token: string) => app.fetch(new Request(`http://localhost/api/v1/workspaces/${workspaceId}/agents/opencode/select`, {
    method: "POST", headers: { [LAUNCH_TOKEN_HEADER]: token, Origin: "http://localhost" },
  }));

  const stale = await select("a-token-from-an-earlier-launch");
  expect(stale.status).toBe(403);
  expect(await stale.json()).toEqual({ error: "launch_token_invalid", message: "This page's launch token is out of date." });
  expect(JSON.parse(readFileSync(resolve(root, ".dojo", "runtimes.json"), "utf8")).agent).toBe("codex");

  const current = await select(launchToken());
  expect(current.status).toBe(200);
  expect(await current.json()).toMatchObject({ id: "opencode", selected: true });
  expect(JSON.parse(readFileSync(resolve(root, ".dojo", "runtimes.json"), "utf8")).agent).toBe("opencode");
});

it("the mounted default-session route refuses an earlier launch's token", async () => {
  const root = mkdtempSync(join(tmpdir(), "dojofoo-launch-learner-"));
  const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-launch-home-"));
  temporaryPaths.push(root, stateHome);
  vi.stubEnv("DOJOFOO_HOME", stateHome);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "first", currentKata: null, editor: null }));
  mkdirSync(resolve(root, ".dojo"));
  writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "codex" }));
  const workspaceId = observeWorkspacePath(root, { stateHome, kind: "learner" });
  const stale = await app.fetch(new Request(`http://localhost/api/v1/workspaces/${workspaceId}/sessions/default`, {
    method: "POST", headers: { [LAUNCH_TOKEN_HEADER]: "a-token-from-an-earlier-launch", Origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify({ course: "first" }),
  }));
  expect(stale.status).toBe(403);
  expect(await stale.json()).toEqual({ error: "launch_token_invalid", message: "This page's launch token is out of date." });
  expect(() => readFileSync(resolve(root, ".dojo", "agent-sessions.json"))).toThrow();
});
