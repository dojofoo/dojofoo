import type { WebCourse } from "@dojofoo/uix/web/catalog";
import type { MarketplaceCourse } from "./courses";

/** Decorate real API data; artwork does not imply a rating or audit. */
export function toUIXCourse(course: MarketplaceCourse): WebCourse {
  const hue = [...course.id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 360, 0);
  const glyph = ({ TypeScript: "TS", JavaScript: "JS", Python: "PY", Rust: "RS" } as Record<string, string>)[course.language] ?? course.language.slice(0, 3).toUpperCase();
  return { ...course, art: { hue, glyph }, shader: "topography" };
}
