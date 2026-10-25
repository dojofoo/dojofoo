import { describe, expect, it } from "vitest";
import { visualizedLines } from "./editor-lines";

describe("editor run feedback", () => {
  it("keeps failed lines visible, prefers failures over coverage, and ignores invalid lines", () => {
    expect(visualizedLines(4, { "0": 1, "1": 0, "2": 3, "3": 2, "8": 1 }, [3, 3, -1, 4, 10]))
      .toEqual([{ line: 2, status: "covered" }, { line: 3, status: "failed" }, { line: 4, status: "failed" }]);
  });
  it("shows failures even when coverage is disabled", () => {
    expect(visualizedLines(2, undefined, [2])).toEqual([{ line: 2, status: "failed" }]);
  });
});
