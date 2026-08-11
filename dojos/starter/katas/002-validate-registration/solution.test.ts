import { describe, expect, it } from "vitest";
import { validateRegistration } from "@/katas/002-validate-registration/solution.js";

describe("002 — Validate a registration", () => {
  it("returns the canonical handle for valid input", () => {
    expect(validateRegistration("  Ada Lovelace  ")).toEqual({
      ok: true,
      handle: "ada-lovelace",
    });
  });

  it("distinguishes empty input", () => {
    expect(validateRegistration(" \t ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a canonical handle shorter than three characters", () => {
    expect(validateRegistration(" AB ")).toEqual({ ok: false, reason: "too-short" });
  });

  it("accepts a canonical handle of exactly three characters", () => {
    expect(validateRegistration(" Ada ")).toEqual({ ok: true, handle: "ada" });
  });
});
