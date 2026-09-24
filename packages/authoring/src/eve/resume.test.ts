import { Client, type MessageStreamEvent } from "@dojofoo/agent/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resumeEveEvents } from "./resume";

const stamp = <const T>(event: T, index: number) => ({ ...event, meta: { id: `event-${index}`, at: "2026-09-13T00:00:00Z" } });
const prefix = [
  stamp({ type: "message.received", data: { sequence: 1, turnId: "turn-1", message: "Teach this concept" } }, 0),
  stamp({ type: "message.appended", data: { sequence: 2, turnId: "turn-1", stepIndex: 0, messageDelta: "Start with " } }, 1),
];
const finish = [
  stamp({ type: "message.completed", data: { sequence: 3, turnId: "turn-1", stepIndex: 0, message: "Start with an example.", finishReason: "stop" } }, 2),
  stamp({ type: "session.waiting", data: { continuationToken: "session-1", wait: "next-user-message" } }, 3),
];

function fixture() {
  const requests: { start: number; method: string }[] = [];
  let open!: () => void;
  const opened = new Promise<void>(resolve => { open = resolve; });
  let live: ReadableStreamDefaultController<Uint8Array>;
  let history: MessageStreamEvent[] = [...prefix];
  const encoder = new TextEncoder();
  const encode = (events: MessageStreamEvent[]) => encoder.encode(events.map(event => JSON.stringify(event)).join("\n") + "\n");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const start = Number(new URL(String(input)).searchParams.get("startIndex") ?? 0);
    requests.push({ start, method: init?.method ?? "GET" });
    const headers = { "content-type": "application/x-ndjson", "x-eve-stream-version": "25", "x-eve-stream-tail-index": String(history.length - 1) };
    if (start === 0) return new Response(encode(history), { headers });
    let abort: () => void;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        live = controller;
        abort = () => controller.error(init?.signal?.reason);
        init?.signal?.addEventListener("abort", abort, { once: true });
        open();
      },
      cancel() { init?.signal?.removeEventListener("abort", abort); },
    }), { headers });
  });
  return {
    session: new Client({ host: "http://eve-fixture.local" }).sessions.attach("session-1"),
    atTail: new Client({ host: "http://eve-fixture.local" }).sessions.attach("session-1", { streamIndex: prefix.length }),
    requests, opened,
    finish() { history = [...history, ...finish]; live.enqueue(encode(finish)); },
  };
}

afterEach(() => { vi.restoreAllMocks(); });

async function collect(source: AsyncIterable<MessageStreamEvent>) {
  const events: MessageStreamEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

describe("read-only Eve observer using the public store", () => {
  it("follows a seeded projection without replaying its earlier message parts", async () => {
    const source = fixture();
    const result = collect(resumeEveEvents(source.atTail, new AbortController().signal, prefix));
    await vi.waitFor(() => expect(source.requests).toHaveLength(2));
    source.finish();
    expect(await result).toEqual(finish);
    expect(source.requests).toEqual([{ start: 2, method: "GET" }, { start: 2, method: "GET" }]);
  });

  it("replays the prefix then follows the active turn from the durable cursor", async () => {
    const source = fixture();
    const iterator = resumeEveEvents(source.session, new AbortController().signal)[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual(prefix[0]);
    expect((await iterator.next()).value).toEqual(prefix[1]);
    await source.opened;
    const pending = iterator.next();
    source.finish();
    expect((await pending).value).toEqual(finish[0]);
    expect((await iterator.next()).value).toEqual(finish[1]);
    expect((await iterator.next()).done).toBe(true);
    expect(source.requests).toEqual([{ start: 0, method: "GET" }, { start: 2, method: "GET" }]);
  });

  it("disconnects the observer without cancelling or resetting the native session", async () => {
    const source = fixture();
    const controller = new AbortController();
    const output = collect(resumeEveEvents(source.session, controller.signal));
    const rejected = expect(output).rejects.toThrow("View closed");
    await source.opened;
    controller.abort(new Error("View closed"));
    await rejected;
    expect(source.requests.every(request => request.method === "GET")).toBe(true);
    expect(source.session.state.sessionId).toBe("session-1");
  });

  it("does not connect an already aborted observer", async () => {
    const source = fixture();
    const controller = new AbortController();
    controller.abort(new Error("View already closed"));
    await expect(collect(resumeEveEvents(source.session, controller.signal))).rejects.toThrow("View already closed");
    expect(source.requests).toEqual([]);
  });
});
