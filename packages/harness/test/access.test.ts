import type * as Pi from "@earendil-works/pi-ai";
import { readStoredCredential } from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { codexAccess, piAccess } from "../src/access.ts";

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
