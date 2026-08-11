import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bun SQL course event store", () => {
  it("persists idempotent events without storing the raw project identifier", () => {
    const output = execFileSync("bun", [resolve("test/bun-store.integration.ts")], {
      cwd: resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });

    expect(output.trim()).toBe("bun sql event store: ok");
  });
});
