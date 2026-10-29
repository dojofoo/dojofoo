import { afterEach, expect, it, vi } from "vitest";
import { authoringSessionLink, rememberAuthoringSession } from "./authoring-session-link";

afterEach(() => vi.unstubAllGlobals());

it("bookmarks only the native ID for its workspace and encodes it as a resumable URL", () => {
  const saved = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) } });
  rememberAuthoringSession("draft one", "native &/?#");
  const first = new URL(authoringSessionLink("draft one"), "http://localhost");
  expect(first.searchParams.get("workspace")).toBe("draft one");
  expect(first.searchParams.get("session")).toBe("native &/?#");
  expect(new URL(authoringSessionLink("draft two"), "http://localhost").searchParams.has("session")).toBe(false);
  expect([...saved.values()]).toEqual(["native &/?#"]);
});

it("keeps the workspace link usable during SSR and when browser storage is blocked", () => {
  expect(authoringSessionLink("draft")).toBe("/authoring?workspace=draft");
  vi.stubGlobal("window", { get localStorage() { throw new Error("Storage blocked"); } });
  expect(() => rememberAuthoringSession("draft", "native-id")).not.toThrow();
  expect(authoringSessionLink("draft")).toBe("/authoring?workspace=draft");
});
