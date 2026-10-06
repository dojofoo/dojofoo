import { expect, it } from "vitest";
import { visibleTreeItems } from "./tree-view";

it("keeps stable identities and parent links while excluding closed descendants", () => {
  const items = [
    {
      id: "course",
      label: "Renamed course",
      children: [
        {
          id: "lesson",
          label: "Lesson",
          children: [{ id: "file", label: "kata.ts" }],
        },
      ],
    },
    { id: "empty", label: "Empty", children: [] },
  ];
  expect(
    visibleTreeItems(items, new Set(["course"])).map(({ item, parent }) => [
      item.id,
      parent,
    ]),
  ).toEqual([
    ["course", null],
    ["lesson", "course"],
    ["empty", null],
  ]);
  expect(
    visibleTreeItems(items, new Set(["course", "lesson"])).map(
      ({ item }) => item.id,
    ),
  ).toEqual(["course", "lesson", "file", "empty"]);
});
