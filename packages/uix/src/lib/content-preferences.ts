import { useSyncExternalStore } from "react";

export type ContentKind = "material" | "video" | "slides" | "code";
export type ContentPreferences = {
  material: { textSize: number; width: "comfortable" | "wide"; resources: "inline" | "panel"; previews: boolean };
  video: { speed: number; captions: boolean; resume: boolean; autoplay: boolean };
  slides: { fit: "window" | "width"; thumbnails: boolean; progress: boolean; reducedMotion: boolean };
  code: { wrap: boolean; lineNumbers: boolean; indentationGuides: boolean; coverage: boolean };
};
export const defaultContentPreferences: ContentPreferences = {
  material: { textSize: 15, width: "comfortable", resources: "inline", previews: true },
  video: { speed: 1, captions: false, resume: true, autoplay: false },
  slides: { fit: "window", thumbnails: false, progress: true, reducedMotion: false },
  code: { wrap: false, lineNumbers: true, indentationGuides: true, coverage: true },
};
const choices: Record<string, readonly unknown[]> = {
  "material.textSize": [13, 15, 17], "material.width": ["comfortable", "wide"], "material.resources": ["inline", "panel"],
  "video.speed": [.75, 1, 1.25, 1.5, 1.75, 2], "slides.fit": ["window", "width"],
};

/** Accept known settings only; old or malformed storage falls back field by field. */
export function parseContentPreferences(value: unknown): ContentPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultContentPreferences).map(([section, defaults]) => {
    const candidate = source[section];
    const saved = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    return [section, Object.fromEntries(Object.entries(defaults).map(([field, fallback]) => {
      const entry = saved[field], allowed = choices[`${section}.${field}`];
      return [field, (allowed ? allowed.includes(entry) : typeof entry === typeof fallback) ? entry : fallback];
    }))];
  })) as ContentPreferences;
}
const key = "uix:content-preferences";
function load() {
  try { return parseContentPreferences(JSON.parse(localStorage.getItem(key) ?? "null")); }
  catch { return parseContentPreferences(null); }
}
let state = typeof window === "undefined" ? defaultContentPreferences : load();
const listeners = new Set<() => void>();
export function setContentPreferences<K extends ContentKind>(section: K, patch: Partial<ContentPreferences[K]>) {
  state = parseContentPreferences({ ...state, [section]: { ...state[section], ...patch } });
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Keep choices for this visit when storage is unavailable. */ }
  listeners.forEach(listener => listener());
}
export function resetContentPreferences(section: ContentKind) {
  setContentPreferences(section, defaultContentPreferences[section]);
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useContentPreferences() {
  return useSyncExternalStore(subscribe, () => state, () => defaultContentPreferences);
}
