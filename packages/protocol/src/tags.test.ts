import { describe, expect, it } from "vitest";
import { dojoTags, isTaggedTurn, tagged } from ".";

describe("dojo tags", () => {
  it("hides tagged turns but not dojo:// links", () => {
    expect(tagged(dojoTags.begin, "Begin the lesson.")).toBe("[dojo:begin] Begin the lesson.");
    expect(isTaggedTurn(tagged(dojoTags.begin, "Begin the lesson."))).toBe(true);
    expect(isTaggedTurn("[dojo:begin-authoring] Help me author a course.")).toBe(true);
    expect(isTaggedTurn("[dojo:check]")).toBe(true);
    expect(isTaggedTurn("See [the slide](dojo://courses/first/slides/intro).")).toBe(false);
    expect(isTaggedTurn("dojo://courses/first")).toBe(false);
    expect(isTaggedTurn(" [dojo:begin] indented")).toBe(false);
    expect(isTaggedTurn("Why is [dojo:begin] here?")).toBe(false);
  });
});
