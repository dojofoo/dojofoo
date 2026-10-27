import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { acpClient } from "../lesson/codex-client";
import { advanceInteractiveLesson, answerInteractiveQuestion, getInteractiveLesson } from "./service";
import { getInteractiveConversation, selectInteractiveHarness, setInteractiveModel, streamInteractiveSensei } from "./conversation";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-interactive-chat-"));
  roots.push(root);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "first", currentKata: null, editor: null }));
  for (const course of ["first", "second"]) {
    const folder = resolve(root, ".dojos", course);
    mkdirSync(folder, { recursive: true });
    writeFileSync(resolve(folder, "dojo.json"), JSON.stringify({ mode: "interactive", name: course, version: "0.0.1", description: "Draft", lessons: "lesson.json" }));
    writeFileSync(resolve(folder, "lesson.json"), JSON.stringify({ id: "intro", title: `Learn ${course}`, steps: [
      { id: "read", type: "present", title: "Read", content: `Material for ${course}` },
      { id: "try", type: "question", title: "Try", prompt: "Which view shows resources?", answers: ["resources"], explanation: "Open Resources." },
    ] }));
  }
  vi.spyOn(acpClient, "startThread").mockResolvedValue("native-first");
  vi.spyOn(acpClient, "resumeThread").mockResolvedValue();
  vi.spyOn(acpClient, "history").mockResolvedValue([{ role: "assistant", kind: "message", text: "A real native reply" }]);
  vi.spyOn(acpClient, "send").mockResolvedValue("A real native reply");
  vi.spyOn(acpClient, "modelConfiguration").mockReturnValue(null);
  return root;
}

describe("interactive Sensei", () => {
  it("does not start an agent just to read course content or an empty conversation", async () => {
    const root = fixture();
    expect(getInteractiveLesson(root).current?.id).toBe("read");
    expect(await getInteractiveConversation(root, "first")).toMatchObject({ sessionId: null, messages: [], model: null, harness: "opencode", harnesses: expect.arrayContaining(["opencode", "codex"]) });
    expect(acpClient.startThread).not.toHaveBeenCalled();
  });

  it("uses one durable native session and fresh step context without advertising kata tools", async () => {
    const root = fixture();
    const onPart = vi.fn();
    await streamInteractiveSensei(root, "first", "Where do I begin?", onPart);
    const configuration = vi.mocked(acpClient.startThread).mock.calls[0][0];
    expect(configuration).toMatchObject({ root, harness: "opencode", toolProfile: "none" });
    expect(configuration.developerInstructions).toContain("Sensei");
    expect(acpClient.send).toHaveBeenLastCalledWith("native-first", "Where do I begin?", onPart, expect.objectContaining({
      context: [expect.objectContaining({ text: expect.stringContaining("Material for first") })],
    }));
    advanceInteractiveLesson(root, "first");
    answerInteractiveQuestion(root, "sidebar", "first");
    await streamInteractiveSensei(root, "first", "What did I miss?", onPart);
    expect(acpClient.startThread).toHaveBeenCalledTimes(1);
    const context = vi.mocked(acpClient.send).mock.calls.at(-1)![3]!.context![0];
    expect(context.text).toContain("Which view shows resources?");
    expect(context.text).toContain("sidebar");
    expect(context.text).not.toContain("Material for first");
    const restored = await getInteractiveConversation(root, "first");
    expect(restored).toMatchObject({ sessionId: "native-first", messages: [{ role: "assistant", parts: [{ type: "text", content: "A real native reply" }] }] });
    expect(acpClient.resumeThread).toHaveBeenCalledWith("native-first", expect.objectContaining({ runtimeKey: configuration.runtimeKey }));
    const persisted = JSON.parse(readFileSync(resolve(root, ".dojo/interactive.json"), "utf8"));
    expect(persisted.conversations.first).toMatchObject({ sessionId: "native-first", harness: "opencode" });
    expect(persisted.conversations.first.messages).toBeUndefined();
    expect(getInteractiveLesson(root, "first").response?.answer).toBe("sidebar");
  });

  it("does not substitute sessions across installed courses or failed resumes", async () => {
    const root = fixture();
    await streamInteractiveSensei(root, "first", "Hello", vi.fn());
    vi.mocked(acpClient.startThread).mockResolvedValueOnce("native-second");
    await streamInteractiveSensei(root, "second", "Hello", vi.fn());
    expect((await getInteractiveConversation(root, "first")).sessionId).toBe("native-first");
    expect((await getInteractiveConversation(root, "second")).sessionId).toBe("native-second");
    vi.mocked(acpClient.resumeThread).mockRejectedValueOnce(new Error("Provider offline"));
    await expect(getInteractiveConversation(root, "first")).rejects.toThrow("Provider offline");
    expect(acpClient.startThread).toHaveBeenCalledTimes(2);
    expect(getInteractiveLesson(root, "first").current?.id).toBe("read");
  });

  it("restores a successful model choice and preserves it after a failed change", async () => {
    const root = fixture();
    await streamInteractiveSensei(root, "first", "Hello", vi.fn());
    const model = { id: "model", name: "Model", currentValue: "provider/default", options: [
      { value: "provider/default", name: "Default" }, { value: "provider/chosen", name: "Chosen" },
    ] };
    vi.mocked(acpClient.modelConfiguration).mockReturnValue(model);
    const setModel = vi.spyOn(acpClient, "setModel").mockImplementation(async (_session, value) => {
      model.currentValue = value;
      return model;
    });
    await setInteractiveModel(root, "first", "provider/chosen");
    vi.mocked(acpClient.startThread).mockResolvedValueOnce("model-codex");
    await selectInteractiveHarness(root, "first", "codex");
    model.currentValue = "provider/default";
    await selectInteractiveHarness(root, "first", "opencode");
    expect((await getInteractiveConversation(root, "first")).model?.currentValue).toBe("provider/chosen");
    expect(setModel).toHaveBeenLastCalledWith("native-first", "provider/chosen");
    setModel.mockRejectedValueOnce(new Error("Model unavailable"));
    await expect(setInteractiveModel(root, "first", "provider/bad")).rejects.toThrow("Model unavailable");
    expect(JSON.parse(readFileSync(resolve(root, ".dojo/interactive.json"), "utf8")).conversations.first.model).toBe("provider/chosen");
  });

  it("forwards physical cancellation and does not retain a failed session start", async () => {
    const root = fixture();
    vi.mocked(acpClient.startThread).mockRejectedValueOnce(new Error("No provider configured"));
    await expect(streamInteractiveSensei(root, "first", "Hello", vi.fn())).rejects.toThrow("No provider configured");
    expect((await getInteractiveConversation(root, "first")).sessionId).toBeNull();
    const controller = new AbortController();
    await streamInteractiveSensei(root, "first", "Hello", vi.fn(), controller.signal);
    expect(acpClient.send).toHaveBeenLastCalledWith("native-first", "Hello", expect.any(Function), expect.objectContaining({ signal: controller.signal }));
  });
});

it("switches coding agents without a turn and restores each native session while preserving progress", async () => {
  const root = fixture();
  await streamInteractiveSensei(root, "first", "Hello", vi.fn());
  const before = getInteractiveLesson(root, "first");
  vi.mocked(acpClient.startThread).mockResolvedValueOnce("native-codex");
  const selected = await selectInteractiveHarness(root, "first", "codex");
  expect(selected).toMatchObject({ sessionId: "native-codex", harness: "codex" });
  const calls = vi.mocked(acpClient.startThread).mock.calls;
  expect(calls[1][0].runtimeKey).not.toBe(calls[0][0].runtimeKey);
  expect(calls[1][0]).toMatchObject({ harness: "codex", toolProfile: "none" });
  expect((await selectInteractiveHarness(root, "first", "opencode")).sessionId).toBe("native-first");
  expect((await selectInteractiveHarness(root, "first", "codex")).sessionId).toBe("native-codex");
  expect(acpClient.startThread).toHaveBeenCalledTimes(2);
  expect(acpClient.send).toHaveBeenCalledTimes(1);
  expect(getInteractiveLesson(root, "first")).toEqual(before);
  const state = JSON.parse(readFileSync(resolve(root, ".dojo/interactive.json"), "utf8"));
  expect(state.conversationAgents.first.opencode.sessionId).toBe("native-first");
  expect(state.conversationAgents.first.codex.sessionId).toBe("native-codex");
});

it("retains the active binding on unsupported choices and failed starts/resumes", async () => {
  const root = fixture();
  await streamInteractiveSensei(root, "first", "Hello", vi.fn());
  const path = resolve(root, ".dojo/interactive.json");
  const original = readFileSync(path, "utf8");
  await expect(selectInteractiveHarness(root, "first", "")).rejects.toThrow("coding agent");
  await expect(selectInteractiveHarness(root, "first", "pi")).rejects.toThrow("not by the ACP");
  vi.mocked(acpClient.startThread).mockRejectedValueOnce(new Error("Login required"));
  await expect(selectInteractiveHarness(root, "first", "codex")).rejects.toThrow("Login required");
  expect(readFileSync(path, "utf8")).toBe(original);
  vi.mocked(acpClient.startThread).mockResolvedValueOnce("codex-owned");
  await selectInteractiveHarness(root, "first", "codex");
  vi.mocked(acpClient.resumeThread).mockRejectedValueOnce(new Error("Old provider offline"));
  await expect(selectInteractiveHarness(root, "first", "opencode")).rejects.toThrow("Old provider offline");
  expect((await getInteractiveConversation(root, "first")).sessionId).toBe("codex-owned");
});

it("deduplicates a pending choice and rejects competing sends or selections", async () => {
  const root = fixture();
  let finish!: (id: string) => void;
  vi.mocked(acpClient.startThread).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = selectInteractiveHarness(root, "first", "codex");
  const duplicate = selectInteractiveHarness(root, "first", "codex");
  await expect(selectInteractiveHarness(root, "first", "opencode")).rejects.toThrow("busy");
  await expect(streamInteractiveSensei(root, "first", "Hello", vi.fn())).rejects.toThrow("busy");
  await expect(setInteractiveModel(root, "first", "any-model")).rejects.toThrow("busy");
  finish("one-native-session");
  expect((await first).sessionId).toBe("one-native-session");
  expect((await duplicate).sessionId).toBe("one-native-session");
  expect(acpClient.startThread).toHaveBeenCalledTimes(1);
});

it("keeps selection locked until an active turn settles, including after a failed turn", async () => {
  const root = fixture();
  let reject!: (error: Error) => void;
  let started!: () => void;
  const sending = new Promise<void>(resolve => { started = resolve; });
  vi.mocked(acpClient.send).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; started(); }));
  const turn = streamInteractiveSensei(root, "first", "Hello", vi.fn());
  const failure = expect(turn).rejects.toThrow("Connection lost");
  await sending;
  await expect(selectInteractiveHarness(root, "first", "codex")).rejects.toThrow("busy");
  reject(new Error("Connection lost"));
  await failure;
  vi.mocked(acpClient.startThread).mockResolvedValueOnce("after-failure");
  expect((await selectInteractiveHarness(root, "first", "codex")).sessionId).toBe("after-failure");
});

it("retains legacy single-conversation state when the first agent switch adds bindings", async () => {
  const root = fixture();
  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  const courses = { first: { step: 0, answers: {} } };
  writeFileSync(resolve(root, ".dojo/interactive.json"), JSON.stringify({ version: 1, courses,
    conversations: { first: { sessionId: "legacy-native", harness: "opencode" } } }));
  vi.mocked(acpClient.startThread).mockResolvedValueOnce("new-codex");
  await selectInteractiveHarness(root, "first", "codex");
  expect((await selectInteractiveHarness(root, "first", "opencode")).sessionId).toBe("legacy-native");
  expect(acpClient.startThread).toHaveBeenCalledTimes(1);
  expect(acpClient.resumeThread).toHaveBeenCalledWith("legacy-native", expect.objectContaining({ harness: "opencode" }));
  const saved = JSON.parse(readFileSync(resolve(root, ".dojo/interactive.json"), "utf8"));
  expect(saved.version).toBe(1);
  expect(saved.courses).toEqual(courses);
});

it("does not resume or recreate an unused selection from an older runtime while reading", async () => {
  const root = fixture();
  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  writeFileSync(resolve(root, ".dojo/interactive.json"), JSON.stringify({ version: 1, courses: {},
    conversations: { first: { sessionId: "unmaterialized-codex", harness: "codex", pendingRuntime: "previous-process" } } }));
  expect(await getInteractiveConversation(root, "first")).toMatchObject({ sessionId: null, harness: "codex", messages: [], model: null });
  expect(acpClient.resumeThread).not.toHaveBeenCalled();
  expect(acpClient.startThread).not.toHaveBeenCalled();
  vi.mocked(acpClient.startThread).mockResolvedValueOnce("first-submitted-codex");
  await streamInteractiveSensei(root, "first", "My first message", vi.fn());
  const state = JSON.parse(readFileSync(resolve(root, ".dojo/interactive.json"), "utf8"));
  expect(state.conversations.first).toEqual({ sessionId: "first-submitted-codex", harness: "codex" });
  expect(acpClient.send).toHaveBeenCalledWith("first-submitted-codex", "My first message", expect.any(Function), expect.any(Object));
});

it("retains a submitted provisional session after a provider error without substituting an ID", async () => {
  const root = fixture();
  await selectInteractiveHarness(root, "first", "codex");
  vi.mocked(acpClient.send).mockRejectedValueOnce(new Error("Provider interrupted"));
  await expect(streamInteractiveSensei(root, "first", "My first message", vi.fn())).rejects.toThrow("Provider interrupted");
  const state = JSON.parse(readFileSync(resolve(root, ".dojo/interactive.json"), "utf8"));
  expect(state.conversations.first).toEqual({ sessionId: "native-first", harness: "codex" });
  expect((await getInteractiveConversation(root, "first")).sessionId).toBe("native-first");
  expect(acpClient.startThread).toHaveBeenCalledTimes(1);
});
