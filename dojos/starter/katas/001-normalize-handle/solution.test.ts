import { describe, expect, it } from "vitest";
import { normalizeHandle } from "@/katas/001-normalize-handle/solution.js";

describe("001 — Normalize a handle", () => {
  it("trims and lowercases a display name", () => {
    expect(normalizeHandle("  Ada Lovelace  ")).toBe("ada-lovelace");
  });

  it("collapses mixed whitespace into one hyphen", () => {
    expect(normalizeHandle("Grace\t  Brewster\nMurray Hopper")).toBe(
      "grace-brewster-murray-hopper",
    );
  });

  it("leaves a canonical handle unchanged", () => {
    expect(normalizeHandle("linus-torvalds")).toBe("linus-torvalds");
  });

  it("returns an empty handle for whitespace-only input", () => {
    expect(normalizeHandle(" \t\n ")).toBe("");
  });
});
