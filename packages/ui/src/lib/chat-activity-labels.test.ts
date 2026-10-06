import { expect, it } from "vitest";
import { toolActivity, reasoningLabels } from "./chat-activity-labels";

it.each([
  ["edit_file", { path: "src/001/SENSEI.md" }, "teaching"],
  ["write", { filePath: "src/001/SENSEI.mdx" }, "teaching"],
  ["functions.apply_patch", "*** Update File: src/001/SENSEI.md\n@@", "teaching"],
  ["apply_patch", { patchText: "*** Add File: src/kata.test.ts\n+test()" }, "preparing"],
  ["edit_file", { file_path: "src/solution.py" }, "preparing"],
  ["edit", { filePath: "C:\\course\\kata.test.ts" }, "preparing"],
  ["custom_tool", { kind: "edit", rawInput: { path: "SENSEI.md" } }, "teaching"],
  ["read_file", { path: "SENSEI.md" }, "working"],
  ["run_command", { command: "echo edit SENSEI.md" }, "working"],
  ["edit_file", { content: "SENSEI.md", path: "README.md" }, "working"],
  ["edit_file", '{"path":', "working"],
  ["run_tests", {}, "testing"],
  ["dojo_lesson_verify", {}, "testing"],
  ["sleep", { seconds: 10 }, "waiting"],
  ["unknown", undefined, "working"],
] as const)("classifies %s from its tool contract", (name, input, expected) => {
  expect(toolActivity(name, input)).toBe(expected);
});

it("has exactly five distinct reasoning labels", () => {
  expect(new Set(reasoningLabels.map(frame => frame.label)).size).toBe(5);
});
