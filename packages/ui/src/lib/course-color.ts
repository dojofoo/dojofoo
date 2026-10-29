import type { CourseArtwork } from "@dojofoo/uix/components/course-card";
import { starterCourses } from "./starter-courses";

/**
 * A course's one color, the same wherever it shows – its card on the dashboard, in its lessons, in Explore: a starter's
 * own hue, else one drawn from the course's id (FNV-1a, spread around the wheel by the golden ratio).
 */
export function courseHue(id: string): number {
  const starter = starterCourses.find(item => item.id === id);
  if (starter) return starter.art.hue;
  let hash = 0x811c9dc5;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return Math.round((hash * 0.618033988749895 % 1) * 360);
}

export const courseArt = (id: string): CourseArtwork => ({ hue: courseHue(id), glyph: "" });
