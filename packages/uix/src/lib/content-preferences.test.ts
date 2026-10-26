import { expect, it } from "vitest";
import { defaultContentPreferences, parseContentPreferences } from "./content-preferences";

it("recovers invalid saved fields without discarding valid preferences", () => {
  const preferences = parseContentPreferences({
    material: { textSize: -100, width: "wide", resources: "overlay", previews: false },
    video: { speed: 1000, resume: "yes", captions: true },
    code: { wrap: true },
    unknown: { surprise: true },
  });
  expect(preferences.material).toEqual({ textSize: 15, width: "wide", resources: "inline", previews: false });
  expect(preferences.video).toEqual({ speed: 1, resume: true, captions: true, autoplay: false });
  expect(preferences.code.wrap).toBe(true);
  expect(preferences).not.toHaveProperty("unknown");
});

it("uses independent defaults for missing or malformed saved data", () => {
  for (const value of [null, false, "broken", { material: null, code: [] }]) {
    const preferences = parseContentPreferences(value);
    expect(preferences).toEqual(defaultContentPreferences);
    preferences.material.previews = false;
    expect(defaultContentPreferences.material.previews).toBe(true);
  }
});
