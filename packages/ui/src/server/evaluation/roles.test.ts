import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { OneShotRequest } from "@dojofoo/harness/adapters";
import { criterionIds } from "@dojofoo/agents/evaluation/judges";
import { oneShotRoles } from "./roles";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function roles(answer: (request: OneShotRequest) => string) {
  const root = mkdtempSync(join(tmpdir(), "dojo-roles-")); roots.push(root);
  const requests: OneShotRequest[] = [];
  const oneShot = vi.fn(async (request: OneShotRequest) => {
    // Each call gets its own working folder with an empty scratch/
    expect(readdirSync(join(request.directory, "scratch"))).toEqual([]);
    requests.push(request);
    return { text: answer(request) };
  });
  const evidenceRoot = join(root, "evidence");
  const stateDirectory = join(root, "state");
  mkdirSync(evidenceRoot);
  return { requests, evidenceRoot, stateDirectory, roles: oneShotRoles({ agent: "opencode", model: "openai/gpt-4o", evidenceRoot, stateDirectory, oneShot }) };
}

const verdict = JSON.stringify({ criteria: criterionIds.map(id => ({ id, pass: true, evidence: "e", improvement: "none" })), overall: "pass", limitation: "Fixture" });

it("the learner's one-shot never receives SENSEI or the policy", async () => {
  const r = roles(() => "I think the total starts at zero.");
  const dialogue = [{ role: "assistant" as const, content: "What does the total start at?" }];
  expect(await r.roles.reply(dialogue, "export const total = 0;", AbortSignal.timeout(5000))).toBe("I think the total starts at zero.");
  const [request] = r.requests;
  expect(request).toMatchObject({ agent: "opencode", model: "openai/gpt-4o", stateDirectory: r.stateDirectory, timeoutMs: 120_000 });
  expect(JSON.parse(request!.prompt)).toEqual({ dialogue, source: "export const total = 0;" });
  expect(`${request!.instructions}${request!.prompt}`).not.toMatch(/SENSEI|production-teaching-policy|Sensei lesson source/u);
  expect(JSON.parse(readFileSync(join(r.evidenceRoot, "learner-1-input.json"), "utf8"))).toMatchObject({ dialogue });
  expect(readFileSync(join(r.evidenceRoot, "learner-1-response.txt"), "utf8")).toBe("I think the total starts at zero.");
  // The call's working folder is removed afterwards
  expect(existsSync(request!.directory)).toBe(false);
  const questions = [{ id: "q1", title: "Which?", options: [{ title: "A" }, { title: "B" }], allowOther: false }];
  const answered = roles(() => JSON.stringify({ q1: ["B"] }));
  expect(await answered.roles.answer(questions, dialogue, "code", AbortSignal.timeout(5000))).toEqual({ q1: ["B"] });
  expect(JSON.parse(answered.requests[0]!.prompt)).toEqual({ dialogue, source: "code", questions });
});

it("an empty learner reply fails", async () => {
  const r = roles(() => "  ");
  await expect(r.roles.reply([], "code", AbortSignal.timeout(5000))).rejects.toThrow("Learner returned no answer");
  const invalid = roles(() => JSON.stringify({ q1: ["C"] }));
  await expect(invalid.roles.answer([{ id: "q1", title: "Which?", options: [{ title: "A" }], allowOther: false }], [], "code", AbortSignal.timeout(5000)))
    .rejects.toThrow("Invalid learner selection for q1");
});

it("judges run on the course's agent and model", async () => {
  const r = roles(() => verdict);
  const material = await r.roles.judge({ "SENSEI.md": "guidance" }, AbortSignal.timeout(5000));
  const teaching = await r.roles.judge({ transcript: "[]" }, AbortSignal.timeout(5000));
  expect(material.map(result => result.judge)).toEqual(["judge-1", "judge-2"]);
  expect(teaching[0]!.root).toBe(join(r.evidenceRoot, "panel-2"));
  expect(material[0]!.root).toBe(join(r.evidenceRoot, "panel-1"));
  expect(r.requests).toHaveLength(4);
  for (const request of r.requests) {
    expect(request).toMatchObject({ agent: "opencode", model: "openai/gpt-4o", timeoutMs: 180_000 });
    // A judge's prompt is whole, with its schema
    expect(request.instructions).toBeUndefined();
    expect(request.prompt).toContain('"criteria"');
  }
});
