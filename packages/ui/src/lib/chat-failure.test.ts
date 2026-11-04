import { describe, expect, it } from "vitest";
import { ChatApiError, chatApiError, chatFailure, classifyTurnFailure } from "./chat-failure";

const api = (status: number, code: string, message = "Refused.") => new ChatApiError(status, code, message);
const notActive = (retryable: boolean) => Object.assign(new Error("The session is no longer active. Start a new session."), { name: "SessionNotActiveError", retryable });
const turn = (code: string, message: string) => Object.assign(new Error(message), { name: code });

describe("chat failures (D33)", () => {
  it("409 agent_unavailable and 404 session_not_found open the default conversation", () => {
    expect(chatFailure(api(409, "agent_unavailable"))).toEqual({ kind: "default-open" });
    expect(chatFailure(api(404, "session_not_found"))).toEqual({ kind: "default-open" });
  });

  it("a session that can't continue is replaced", () => {
    expect(chatFailure(notActive(false))).toEqual({ kind: "replace" });
    expect(chatFailure(api(409, "session_not_active"))).toEqual({ kind: "replace" });
    expect(chatFailure(api(409, "session_stranded"))).toEqual({ kind: "replace" });
    expect(chatFailure(api(409, "session_version_unsupported"))).toEqual({ kind: "replace" });
    expect(chatFailure(api(410, "session_expired"))).toEqual({ kind: "replace" });
  });

  it("409 session_not_active on cancel shows the turn as stopped, with no alert", () => {
    expect(chatFailure(notActive(false), { operation: "cancel" })).toEqual({ kind: "stopped" });
    expect(chatFailure(api(409, "session_not_active"), { operation: "cancel" })).toEqual({ kind: "stopped" });
  });

  it("404 workspace_not_found goes back to the dashboard", () => {
    expect(chatFailure(api(404, "workspace_not_found"))).toMatchObject({ kind: "alert", actions: ["dashboard"] });
  });

  it("400 invalid_request, 404 agent_not_found and 404 not_found reload the page", () => {
    for (const [status, code] of [[400, "invalid_request"], [404, "agent_not_found"], [404, "not_found"]] as const) {
      expect(chatFailure(api(status, code))).toMatchObject({ kind: "alert", actions: ["reload-page"] });
    }
  });

  it("403 launch_token_invalid reloads the page once launchFetch's retry is spent", () => {
    expect(chatFailure(api(403, "launch_token_invalid"))).toMatchObject({ kind: "alert", actions: ["reload-page"] });
    expect(chatFailure(Object.assign(new Error("This page is out of date."), { name: "LaunchTokenError" }))).toMatchObject({ actions: ["reload-page"] });
  });

  it("413 and 415 keep the message and name the file", () => {
    expect(chatFailure(api(413, "payload_too_large"), { file: "notes.pdf" })).toEqual({ kind: "alert", message: "Remove notes.pdf and send again.", actions: [] });
    expect(chatFailure(api(415, "unsupported_media_type"), { file: "clip.mov" })).toMatchObject({ message: "Remove clip.mov and send again." });
  });

  it("503 agent_failed offers another agent and trying again", () => {
    expect(chatFailure(api(503, "agent_failed", "The coding agent could not start."))).toMatchObject({ kind: "alert", actions: ["choose-agent", "try-again"] });
  });

  it("409 agent_not_offered offers the other agents, never the refused one", () => {
    expect(chatFailure(api(409, "agent_not_offered", "Cursor can't teach here yet."), { agentName: "cursor" }))
      .toEqual({ kind: "alert", message: "Cursor can't teach here yet.", actions: ["choose-agent"], refusedAgent: "cursor" });
  });

  it("a failed turn that needs a login offers it and trying again", () => {
    expect(chatFailure(turn("AUTH_REQUIRED", "Not logged in."))).toMatchObject({ kind: "alert", actions: ["login", "try-again"] });
  });

  it("a rate-limited turn tries again, with the provider's retry time", () => {
    expect(chatFailure(turn("Error", "Rate limit reached. Retry after 30s."))).toEqual({ kind: "alert", message: "Rate limit reached. Retry after 30s.", actions: ["try-again"], retryAfter: "30s" });
  });

  it("a native crash tries again; the second in a row also offers another agent", () => {
    expect(chatFailure(turn("Error", "The CLI exited with code 1."), { crashes: 1 })).toMatchObject({ actions: ["try-again"] });
    expect(chatFailure(turn("Error", "The CLI exited with code 1."), { crashes: 2 })).toMatchObject({ actions: ["try-again", "choose-agent"] });
  });

  it("other 5xx and network failures try again", () => {
    expect(chatFailure(api(502, "agent_unreachable"))).toMatchObject({ kind: "alert", actions: ["try-again"] });
    expect(chatFailure(new TypeError("fetch failed"))).toMatchObject({ kind: "alert", actions: ["try-again"] });
  });

  it("classifies sign-in, rate-limit and native-crash turn failures from code, then message", () => {
    expect(classifyTurnFailure({ code: "unauthorized", message: "Rate limit reached" })).toBe("sign-in");
    expect(classifyTurnFailure({ code: "rate_limit_exceeded" })).toBe("rate-limit");
    expect(classifyTurnFailure({ code: "provider_error", message: "Please log in again." })).toBe("sign-in");
    expect(classifyTurnFailure({ message: "HTTP 429 from the provider" })).toBe("rate-limit");
    expect(classifyTurnFailure({ message: "read ECONNRESET" })).toBe("native-crash");
    expect(classifyTurnFailure({ message: "spawn opencode ENOENT" })).toBe("native-crash");
  });

  it("an unknown failure is Try again", () => {
    expect(classifyTurnFailure({ message: "Something odd happened." })).toBe("other");
    expect(chatFailure(turn("Error", "Something odd happened."))).toMatchObject({ kind: "alert", actions: ["try-again"] });
  });

  it("reads both the public and Eve's error shapes", async () => {
    expect(await chatApiError(new Response(JSON.stringify({ error: "agent_not_offered", message: "Choose another." }), { status: 409 })))
      .toMatchObject({ status: 409, code: "agent_not_offered", message: "Choose another." });
    expect(await chatApiError(new Response(JSON.stringify({ error: "Session not found.", code: "session_not_found" }), { status: 404 })))
      .toMatchObject({ status: 404, code: "session_not_found", message: "Session not found." });
    expect(await chatApiError(new Response("Bad gateway", { status: 502 }))).toMatchObject({ status: 502, code: undefined, message: "Bad gateway" });
  });
});
