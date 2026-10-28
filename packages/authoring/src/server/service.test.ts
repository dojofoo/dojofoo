import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { scaffoldAuthoringWorkspace } from "../scaffold";
import { writeAuthoringFile } from "./files";
import { createAuthoringService, createAuthoringLesson, readAuthoringDraft } from "./service";
import { authoringMessageText, isAuthoringBootstrapMessage } from "./types";
import type { AuthoringAgent } from "./types";
import { kataTestTemplate } from "@dojofoo/config";

describe("authoring service", () => {
  it("keeps both lessons when creation requests arrive together", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-concurrent-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Concurrent lessons", style: "katas" });
    await Promise.all([createAuthoringLesson(root, "First lesson"), createAuthoringLesson(root, "Second lesson")]);
    expect(readAuthoringDraft(root).lessons.map(lesson => lesson.title)).toEqual(["First lesson", "Second lesson"]);
  });
  it.each([
    ["src/first/kata.ts", "src/first/kata.test.ts"],
    ["src/first/solution.ts", "src/first/solution.test.ts"],
    ["src/first/kata.browser.ts", "src/first/kata.test.browser.ts"],
    ["src/first/kata", "src/first/kata.test"],
  ])("shares production test naming for %s", (template, expected) => {
    expect(kataTestTemplate(template)).toBe(expected);
  });
  it("creates kata files that the production resolver recognizes without treating a test path as a command", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-kata-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Kata naming", style: "katas" });
    const id = createAuthoringLesson(root, "First lesson");
    const lesson = readAuthoringDraft(root).lessons[0];
    expect(lesson.templatePath).toBe(`src/${id}/kata.ts`);
    expect(lesson.testPath).toBe(`src/${id}/kata.test.ts`);
    expect(readFileSync(resolve(root, "dojo.yaml"), "utf8")).not.toContain(`test: src/${id}`);
  });
  it("starts every new lesson with its basic evals in place", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-evals-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Evals", style: "katas" });
    const id = createAuthoringLesson(root, "First lesson");
    const lesson = readAuthoringDraft(root).lessons[0]!;
    expect(lesson.sensei).toMatch(/^# First lesson\n/u);
    expect(readFileSync(resolve(root, `src/${id}/kata.test.ts`), "utf8")).toContain("it.todo(");
    const findings = Object.fromEntries(lesson.checks.map(check => [check.id, check.findings?.join(" ")]));
    expect(findings.sensei).toContain("placeholders");
    expect(findings.scaffold).toContain("todo");
    writeAuthoringFile(root, `src/${id}/kata.test.ts`, 'it("returns the largest", () => {});');
    expect(readAuthoringDraft(root).lessons[0]!.checks.find(check => check.id === "scaffold")?.ready).toBe(true);
  });
  for (const operation of ["getWorkspace", "startSession", "streamMessage"] as const) {
    it(`preserves the session when ${operation} cannot resume it`, async () => {
      const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-recovery-"));
      onTestFinished(() => rmSync(root, { recursive: true, force: true }));
      scaffoldAuthoringWorkspace({ root, name: "recovery-course", style: "katas" });
      const start = vi.fn(async () => "original-session");
      const resume = vi.fn(async () => {});
      const send = vi.fn(async () => {});
      const agent: AuthoringAgent = {
        currentHarness: () => "test-harness", start, resume, send,
        history: async () => [], answer: () => {},
      };
      const service = createAuthoringService(agent);
      await service.startSession(root);
      const pointerPath = resolve(root, ".dojo/kyoshi.json");
      const pointer = readFileSync(pointerPath, "utf8");
      const failure = new Error("Harness temporarily unavailable");
      resume.mockRejectedValueOnce(failure);
      const result = operation === "streamMessage"
        ? service.streamMessage(root, "Continue", () => {})
        : service[operation](root);
      await expect(result).rejects.toBe(failure);
      expect(start).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
      expect(readFileSync(pointerPath, "utf8")).toBe(pointer);
      await service.streamMessage(root, "Continue", () => {});
      expect(send).toHaveBeenCalledWith("original-session", "Continue", expect.any(Function), { signal: undefined });
      expect(start).toHaveBeenCalledTimes(1);
    });
  }

  it("keeps an existing session on its own harness when the default changes", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-default-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "default-course", style: "katas" });
    let harness = "original-harness";
    const start = vi.fn(async () => "original-session");
    const resume = vi.fn(async () => {});
    const agent: AuthoringAgent = {
      currentHarness: () => harness, start, resume,
      send: async () => {}, history: async () => [], answer: () => {},
    };
    const service = createAuthoringService(agent);
    await service.startSession(root);
    harness = "different-default";
    await service.streamMessage(root, "Continue", () => {});
    expect(start).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenLastCalledWith("original-session", expect.objectContaining({ harness: "original-harness" }));
  });

  it("identifies bootstrap prompts so protocol context never leaks into author chat", () => {
    expect(isAuthoringBootstrapMessage({
      role: "user",
      text: "[dojo:begin-authoring]\nBegin this authoring session.",
    })).toBe(true);
    expect(isAuthoringBootstrapMessage({ role: "user", text: "Help me outline the course." })).toBe(false);
    expect(authoringMessageText({
      role: "user",
      text: '[dojo:author-edits] ["DOJO.md"]\nDoes this direction work?',
    })).toBe("Does this direction work?");
  });

  it("persists one native session while keeping messaging agent-owned", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-session-"));
    scaffoldAuthoringWorkspace({ root, name: "session-course", style: "katas" });
    const start = vi.fn(async () => "native-session");
    const resume = vi.fn(async () => {});
    const send = vi.fn(async () => "response");
    const agent: AuthoringAgent = {
      currentHarness: () => "test-harness",
      start,
      resume,
      history: async () => [],
      send,
      answer: () => {},
    };
    const service = createAuthoringService(agent);

    const first = await service.startSession(root);
    const second = await service.startSession(root);
    await service.streamMessage(root, "Create the first lesson.", () => {});

    expect(first.sessionId).toBe("native-session");
    expect(second.sessionId).toBe("native-session");
    expect(start).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      "native-session",
      "Create the first lesson.",
      expect.any(Function),
      { signal: undefined }
    );
  });

  it("keeps bootstrap discovery tool-free so hidden streaming cannot await UI input", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-bootstrap-"));
    scaffoldAuthoringWorkspace({ root, name: "bootstrap-course", style: "katas" });
    const send = vi.fn(async () => "response");
    const agent: AuthoringAgent = {
      currentHarness: () => "test-harness",
      start: async () => "native-session",
      resume: async () => {},
      history: async () => [],
      send,
      answer: () => {},
    };

    await createAuthoringService(agent).streamIntroduction(root, () => {});

    expect(send).toHaveBeenCalledWith(
      "native-session",
      expect.stringContaining("Do not invoke a tool during this hidden bootstrap turn"),
      expect.any(Function),
      { visible: false, signal: undefined }
    );
  });

  it("attaches saved UI files to the next natural author message once", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-edits-"));
    scaffoldAuthoringWorkspace({ root, name: "editable-course", style: "katas" });
    const send = vi.fn(async () => "response");
    const agent: AuthoringAgent = {
      currentHarness: () => "test-harness",
      start: async () => "native-session",
      resume: async () => {},
      history: async () => [],
      send,
      answer: () => {},
    };
    const service = createAuthoringService(agent);

    writeAuthoringFile(root, "DOJO.md", "# Course intent");
    await service.streamMessage(root, "Does this direction work?", () => {});
    await service.streamMessage(root, "What next?", () => {});

    const calls = send.mock.calls as unknown[][];
    expect(calls[0]?.[1]).toBe(
      '[dojo:author-edits] ["DOJO.md"]\nDoes this direction work?'
    );
    expect(calls[1]?.[1]).toBe("What next?");
  });
});
