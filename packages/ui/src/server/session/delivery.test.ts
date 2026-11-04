import { describe, expect, it, vi } from "vitest";
import { SessionChannel, type SessionPeer } from "./delivery";

function peer(sessionId: string): SessionPeer {
  return {
    request: new Request(`http://localhost/api/session?session=${sessionId}`),
    send: vi.fn(),
    peers: [],
  };
}

describe("session websocket channel", () => {
  it("delivers notifications to every other peer in the same session", () => {
    const sender = peer("lesson-a");
    const browser = peer("lesson-a");
    const secondTab = peer("lesson-a");
    const otherLesson = peer("lesson-b");
    sender.peers = [sender, browser, secondTab, otherLesson];

    new SessionChannel(sender).broadcast({ type: "prompt" });

    expect(sender.send).not.toHaveBeenCalled();
    expect(browser.send).toHaveBeenCalledWith('{"type":"prompt"}');
    expect(secondTab.send).toHaveBeenCalledWith('{"type":"prompt"}');
    expect(otherLesson.send).not.toHaveBeenCalled();
  });

  it("rejects an unbound connection", () => {
    const connection = peer("");
    connection.request = new Request("http://localhost/api/session");
    expect(() => new SessionChannel(connection)).toThrow("session-bound connection");
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
