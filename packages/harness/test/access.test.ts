import type * as Pi from "@earendil-works/pi-ai";
import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codexAccess, openCodeAccess, piAccess } from "../src/access.ts";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });
const folder = async () => { const made = await mkdtemp(join(tmpdir(), "dojo-access-")); folders.push(made); return made; };

/** Answers each question with the next of `answers` and keeps what the sign-in showed */
function interaction(answers: string[] = [], signal?: AbortSignal) {
  const shown: Pi.AuthEvent[] = [];
  const asked: Pi.AuthPrompt[] = [];
  const value: Pi.AuthInteraction = {
    ...(signal ? { signal } : {}),
    notify: event => { shown.push(event); },
    prompt: async prompt => { asked.push(prompt); return answers.shift() ?? ""; },
  };
  return { value, shown, asked };
}

describe("Pi's sign-in", () => {
  it("lists Pi's providers with the sign-ins each offers", async () => {
    const providers = await piAccess(await folder()).providers(AbortSignal.timeout(10_000));
    expect(providers.find(item => item.id === "github-copilot")).toMatchObject({
      name: "GitHub Copilot", auth: { apiKey: { login: true }, oauth: { name: "GitHub Copilot" } } });
    expect(providers.find(item => item.id === "mistral")?.auth.oauth).toBeUndefined();
  });

  it("saves an API key in the agent folder's auth.json, where Pi reads it", async () => {
    const agentDir = await folder();
    const access = piAccess(agentDir);
    const { value, asked } = interaction(["mistral-key-for-the-test"]);
    await access.login("mistral", "api_key", value);
    expect(asked).toMatchObject([{ type: "secret" }]);
    expect(readStoredCredential("mistral", join(agentDir, "auth.json"))).toMatchObject({ type: "api_key", key: "mistral-key-for-the-test" });
    expect((await access.providers(AbortSignal.timeout(10_000))).find(item => item.id === "mistral")?.status).toMatchObject({ configured: true, source: "stored" });
  });
});

/** A Codex app-server that keeps its account in `accountFile`; a ChatGPT sign-in completes as `outcome` */
async function fakeCodex(outcome: { success: boolean; error?: string } | "never" = { success: true }) {
  const directory = await folder();
  const accountFile = join(directory, "account.json");
  const script = join(directory, "app-server.mjs");
  await writeFile(script, `
    import { createInterface } from "node:readline";
    import { existsSync, readFileSync, writeFileSync } from "node:fs";
    const send = message => process.stdout.write(JSON.stringify(message) + "\\n");
    const account = () => existsSync(${JSON.stringify(accountFile)}) ? JSON.parse(readFileSync(${JSON.stringify(accountFile)}, "utf8")) : null;
    createInterface({ input: process.stdin }).on("line", line => {
      const request = JSON.parse(line);
      if (request.id === undefined) return;
      const reply = result => send({ jsonrpc: "2.0", id: request.id, result });
      if (request.method === "initialize") return reply({});
      if (request.method === "account/read") return reply({ account: account(), requiresOpenaiAuth: true });
      if (request.method === "account/login/start" && request.params.type === "apiKey") {
        writeFileSync(${JSON.stringify(accountFile)}, JSON.stringify({ type: "apiKey" }));
        return reply({ type: "apiKey" });
      }
      if (request.method === "account/login/start" && request.params.type === "chatgpt") {
        reply({ type: "chatgpt", loginId: "login-1", authUrl: "https://auth.example/oauth/authorize?state=1" });
        const outcome = ${JSON.stringify(outcome)};
        if (outcome === "never") return;
        if (outcome.success) writeFileSync(${JSON.stringify(accountFile)}, JSON.stringify({ type: "chatgpt", planType: "plus" }));
        setTimeout(() => send({ jsonrpc: "2.0", method: "account/login/completed", params: { loginId: "login-1", ...outcome } }), 20);
      }
    });
  `);
  return codexAccess(process.execPath, [script]);
}

describe("Codex's sign-in", () => {
  it("reports whether Codex is signed in, and saves an API key through Codex", async () => {
    const access = await fakeCodex();
    expect(await access.providers(AbortSignal.timeout(5_000))).toEqual([{ id: "openai", name: "OpenAI",
      auth: { oauth: { name: "ChatGPT", loginLabel: "Sign in with ChatGPT", isSubscription: true }, apiKey: { name: "OpenAI API key", login: true } },
      status: { configured: false } }]);
    const { value, asked } = interaction(["sk-test"]);
    await access.login("openai", "api_key", value);
    expect(asked).toMatchObject([{ type: "secret", message: "Enter your OpenAI API key" }]);
    expect((await access.providers(AbortSignal.timeout(5_000)))[0]?.status).toEqual({ configured: true, source: "stored", label: "API key" });
  });

  it("shows ChatGPT's sign-in page and finishes when Codex reports it done", async () => {
    const access = await fakeCodex();
    const { value, shown } = interaction();
    await access.login("openai", "oauth", value);
    expect(shown).toMatchObject([{ type: "auth_url", url: "https://auth.example/oauth/authorize?state=1" }]);
    expect((await access.providers(AbortSignal.timeout(5_000)))[0]?.status).toMatchObject({ configured: true, label: "ChatGPT" });
  });

  it("fails with Codex's reason, and stops when cancelled", async () => {
    await expect((await fakeCodex({ success: false, error: "Access denied" })).login("openai", "oauth", interaction().value)).rejects.toThrow("Access denied");
    const controller = new AbortController();
    const waiting = (await fakeCodex("never")).login("openai", "oauth", interaction([], controller.signal).value);
    setTimeout(() => controller.abort(), 100);
    await expect(waiting).rejects.toThrow("cancelled");
  });
});

/** An OpenCode whose server answers as OpenCode 1.18 does, and logs each sign-in request it gets in `requests.jsonl` */
async function fakeOpenCode(callback: { status: number; body: unknown } = { status: 200, body: true }) {
  const directory = await folder();
  const log = join(directory, "requests.jsonl");
  const executable = join(directory, "opencode");
  const catalog = {
    all: [
      { id: "deepseek", name: "DeepSeek", source: "env", env: ["DEEPSEEK_API_KEY"] },
      { id: "openai", name: "OpenAI", source: "api" },
      { id: "github-copilot", name: "GitHub Copilot", source: "custom" },
      { id: "azure", name: "Azure", source: "custom" },
    ],
    connected: ["deepseek", "openai"],
  };
  const methods = {
    openai: [{ type: "oauth", label: "ChatGPT Pro/Plus (browser)" }, { type: "oauth", label: "ChatGPT Pro/Plus (headless)" }, { type: "api", label: "Manually enter API Key" }],
    "github-copilot": [{ type: "oauth", label: "Login with GitHub Copilot", prompts: [
      { type: "select", key: "deploymentType", message: "Select GitHub deployment type",
        options: [{ label: "GitHub.com", value: "github.com", hint: "Public" }, { label: "GitHub Enterprise", value: "enterprise" }] },
      { type: "text", key: "enterpriseUrl", message: "Enter your GitHub Enterprise URL", when: { key: "deploymentType", op: "eq", value: "enterprise" } },
    ] }],
    azure: [{ type: "api", label: "API key", prompts: [{ type: "text", key: "resourceName", message: "Enter your resource name" }] }],
  };
  await writeFile(executable, `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
require("node:http").createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const path = request.url.split("?")[0];
  const send = (value, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
  if (request.method !== "GET") appendFileSync(${JSON.stringify(log)}, JSON.stringify({ method: request.method, path, body: body ? JSON.parse(body) : undefined }) + "\\n");
  if (path === "/config/providers") return send({ providers: [], default: {} });
  if (path === "/provider") return send(${JSON.stringify(catalog)});
  if (path === "/provider/auth") return send(${JSON.stringify(methods)});
  if (path.startsWith("/auth/")) return send(true);
  if (path.endsWith("/oauth/authorize")) return send(JSON.parse(body).method === 1
    ? { url: "https://auth.example/headless", method: "code", instructions: "Paste the code" }
    : { url: "https://github.com/login/device", method: "auto", instructions: "Enter code: F204-1E43" });
  if (path.endsWith("/oauth/callback")) return send(${JSON.stringify(callback.body)}, ${callback.status});
  send({ message: "not found" }, 404);
}).listen(port, "127.0.0.1");
`, { mode: 0o755 });
  const requests = async () => (await readFile(log, "utf8").catch(() => "")).split("\n").filter(Boolean).map(line => JSON.parse(line));
  return { access: openCodeAccess({ executable, environment: { PATH: process.env.PATH } }), requests };
}

describe("OpenCode's sign-in", () => {
  it("lists OpenCode's providers with how each is signed in and the sign-ins it offers", async () => {
    const providers = await (await fakeOpenCode()).access.providers(AbortSignal.timeout(10_000));
    expect(providers).toEqual([
      { id: "deepseek", name: "DeepSeek", auth: { apiKey: { name: "DeepSeek API key", login: true } }, status: { configured: true, source: "environment", label: "DEEPSEEK_API_KEY" } },
      { id: "openai", name: "OpenAI", auth: { apiKey: { name: "OpenAI API key", login: true }, oauth: { name: "OpenAI", loginLabel: "Sign in to OpenAI" } },
        status: { configured: true, source: "stored" } },
      { id: "github-copilot", name: "GitHub Copilot", auth: { apiKey: { name: "GitHub Copilot API key", login: false },
        oauth: { name: "GitHub Copilot", loginLabel: "Login with GitHub Copilot" } }, status: { configured: false } },
      // A key that needs a resource name too is left to OpenCode's CLI
      { id: "azure", name: "Azure", auth: { apiKey: { name: "Azure API key", login: false } }, status: { configured: false } },
    ]);
  });

  it("saves an API key through OpenCode", async () => {
    const opencode = await fakeOpenCode();
    const { value, asked } = interaction(["sk-deepseek"]);
    await opencode.access.login("deepseek", "api_key", value);
    expect(asked).toMatchObject([{ type: "secret" }]);
    expect(await opencode.requests()).toEqual([{ method: "PUT", path: "/auth/deepseek", body: { type: "api", key: "sk-deepseek" } }]);
  });

  it("asks the method's questions, only those whose condition holds, then waits for the browser", async () => {
    const opencode = await fakeOpenCode();
    const enterprise = interaction(["enterprise", "company.ghe.com"]);
    await opencode.access.login("github-copilot", "oauth", enterprise.value);
    expect(enterprise.asked).toMatchObject([
      { type: "select", options: [{ id: "github.com", label: "GitHub.com", description: "Public" }, { id: "enterprise", label: "GitHub Enterprise" }] },
      { type: "text", message: "Enter your GitHub Enterprise URL" }]);
    expect(enterprise.shown).toEqual([{ type: "auth_url", url: "https://github.com/login/device", instructions: "Enter code: F204-1E43" }]);
    const github = interaction(["github.com"]);
    await opencode.access.login("github-copilot", "oauth", github.value);
    expect(github.asked).toHaveLength(1);
    expect(await opencode.requests()).toEqual([
      { method: "POST", path: "/provider/github-copilot/oauth/authorize", body: { method: 0, inputs: { deploymentType: "enterprise", enterpriseUrl: "company.ghe.com" } } },
      { method: "POST", path: "/provider/github-copilot/oauth/callback", body: { method: 0 } },
      { method: "POST", path: "/provider/github-copilot/oauth/authorize", body: { method: 0, inputs: { deploymentType: "github.com" } } },
      { method: "POST", path: "/provider/github-copilot/oauth/callback", body: { method: 0 } },
    ]);
  });

  it("lets the user pick among sign-in methods and pastes back a code the page shows", async () => {
    const opencode = await fakeOpenCode();
    const { value, asked } = interaction(["1", "code-from-the-page"]);
    await opencode.access.login("openai", "oauth", value);
    expect(asked).toMatchObject([{ type: "select", options: [{ id: "0", label: "ChatGPT Pro/Plus (browser)" }, { id: "1", label: "ChatGPT Pro/Plus (headless)" }] },
      { type: "manual_code" }]);
    expect((await opencode.requests()).at(-1)).toEqual({ method: "POST", path: "/provider/openai/oauth/callback", body: { method: 1, code: "code-from-the-page" } });
  });

  it("fails with OpenCode's reason", async () => {
    const opencode = await fakeOpenCode({ status: 400, body: { name: "ProviderAuthOauthCallbackFailed", data: { providerID: "github-copilot", message: "Device code expired" } } });
    await expect(opencode.access.login("github-copilot", "oauth", interaction(["github.com"]).value)).rejects.toThrow("Device code expired");
  });
});
