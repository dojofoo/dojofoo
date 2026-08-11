import { describe, expect, it } from "vitest";
import { summarizeRoster } from "@/katas/003-summarize-roster/solution.js";

describe("003 — Summarize a roster", () => {
  it("summarizes total, active count, and handles in input order", () => {
    const registrations = [
      { handle: "ada-lovelace", active: true },
      { handle: "grace-hopper", active: false },
      { handle: "margaret-hamilton", active: true },
    ] as const;

    expect(summarizeRoster(registrations)).toEqual({
      total: 3,
      active: 2,
      handles: ["ada-lovelace", "grace-hopper", "margaret-hamilton"],
    });
  });

  it("returns a zeroed summary for an empty roster", () => {
    expect(summarizeRoster([])).toEqual({ total: 0, active: 0, handles: [] });
  });

  it("does not mutate the input array", () => {
    const registrations = Object.freeze([
      Object.freeze({ handle: "ada", active: true }),
      Object.freeze({ handle: "grace", active: false }),
    ]);
    const before = JSON.stringify(registrations);

    summarizeRoster(registrations);

    expect(JSON.stringify(registrations)).toBe(before);
  });
});
