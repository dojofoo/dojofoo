import { describe, expect, it, vi } from "vitest";
import { SessionChannel, type SessionPeer } from "./delivery";

function peer(query: string): SessionPeer {
  return {
    request: new Request(`http://localhost/api/session?${query}`),
    send: vi.fn(),
    peers: [],
  };
}

describe("session websocket channel", () => {
  it("rejects a connection without a page key", () => {
    expect(() => new SessionChannel(peer(""))).toThrow("session-bound connection");
    expect(() => new SessionChannel(peer("session=lesson-a"))).toThrow("session-bound connection");
  });

  it("a page key's peers share a channel; another lesson or course does not", () => {
    const page = (query: string): SessionPeer => ({ request: new Request(`http://localhost/api/session?${query}`), send: vi.fn(), peers: [] });
    const sender = page("workspace=w1&course=c1&lesson=first");
    const tab = page("workspace=w1&course=c1&lesson=first");
    const other = page("workspace=w1&course=c1&lesson=second");
    const course = page("workspace=w1&course=c1");
    sender.peers = [sender, tab, other, course];
    new SessionChannel(sender).broadcast({ type: "check" });
    expect(tab.send).toHaveBeenCalledWith('{"type":"check"}');
    expect(other.send).not.toHaveBeenCalled();
    expect(course.send).not.toHaveBeenCalled();
  });
});
