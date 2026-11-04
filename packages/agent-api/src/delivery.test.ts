import { describe, expect, it } from "vitest";
import { classifyEveRequest } from "./delivery";

describe("Eve request classification", () => {
  it("a message, an answer, a prepare, the four controls and a stream read are told apart", () => {
    const session = "/v1/session/wrun_1";
    expect(classifyEveRequest("POST", session, { message: "Hi", idempotencyKey: "k1" })).toEqual({ kind: "delivery", delivery: { kind: "message", text: "Hi", idempotencyKey: "k1" } });
    expect(classifyEveRequest("POST", session, { answers: [{ interactionId: "q1", text: "Beginner" }] })).toEqual({ kind: "delivery", delivery: { kind: "answer" } });
    expect(classifyEveRequest("POST", session, undefined)).toEqual({ kind: "prepare" });
    expect(classifyEveRequest("POST", session, {})).toEqual({ kind: "prepare" });
    for (const control of ["cancel", "clear", "compact", "end"] as const) {
      expect(classifyEveRequest("POST", `${session}/${control}`, {})).toEqual({ kind: "control", control });
    }
    expect(classifyEveRequest("GET", `${session}/stream`, undefined)).toEqual({ kind: "read" });
    expect(classifyEveRequest("GET", session, undefined)).toEqual({ kind: "read" });
    expect(classifyEveRequest("POST", `${session}/unknown`, {})).toEqual({ kind: "other" });
    expect(classifyEveRequest("POST", "/v1/info", {})).toEqual({ kind: "other" });
    expect(classifyEveRequest("POST", session, { title: "x" })).toEqual({ kind: "other" });
  });

  it("a message's text is read from a string or its text parts", () => {
    const session = "/v1/session/wrun_1";
    const text = (message: unknown) => {
      const classified = classifyEveRequest("POST", session, { message });
      return classified.kind === "delivery" && classified.delivery.kind === "message" ? classified.delivery.text : undefined;
    };
    expect(text("[dojo:begin] Begin the lesson.")).toBe("[dojo:begin] Begin the lesson.");
    expect(text([{ type: "text", text: "Explain " }, { type: "file", url: "data:," }, { type: "text", text: "this." }])).toBe("Explain this.");
    expect(text({ parts: [{ type: "text", text: "From parts" }] })).toBe("From parts");
  });
});
