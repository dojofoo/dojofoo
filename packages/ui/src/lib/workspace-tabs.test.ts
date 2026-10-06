import { expect, it } from "vitest";
import { updateTabs, type TabState } from "./workspace-tabs";

const initial: TabState = { paths: ["a", "b", "c"], active: "b" };
it("opens once and selects existing tabs without reordering", () => {
  expect(updateTabs(initial, { type: "open", path: "b" }, "authoring")).toEqual(initial);
  expect(updateTabs(initial, { type: "open", path: "d" }, "authoring")).toEqual({ paths: ["a", "b", "c", "d"], active: "d" });
});
it("selects the nearest remaining file on close and permits an empty workspace", () => {
  expect(updateTabs(initial, { type: "close", path: "b" }, "authoring")).toEqual({ paths: ["a", "c"], active: "c" });
  expect(updateTabs(initial, { type: "close", path: "a" }, "authoring").active).toBe("b");
  expect(updateTabs({ paths: ["a"], active: "a" }, { type: "close", path: "a" }, "authoring")).toEqual({ paths: [], active: null });
});
it("moves left or right without changing the active file", () => {
  expect(updateTabs(initial, { type: "move", path: "b", index: 0 }, "authoring")).toEqual({ paths: ["b", "a", "c"], active: "b" });
  expect(updateTabs(initial, { type: "move", path: "b", index: 2 }, "authoring")).toEqual({ paths: ["a", "c", "b"], active: "b" });
});
it("learning mode rejects opening, closing and moving, but allows selecting an approved tab", () => {
  expect(updateTabs(initial, { type: "open", path: "hidden-tests" }, "learning")).toBe(initial);
  expect(updateTabs(initial, { type: "close", path: "b" }, "learning")).toBe(initial);
  expect(updateTabs(initial, { type: "move", path: "b", index: 0 }, "learning")).toBe(initial);
  expect(updateTabs(initial, { type: "select", path: "hidden-tests" }, "learning")).toBe(initial);
  expect(updateTabs(initial, { type: "select", path: "a" }, "learning").active).toBe("a");
});
