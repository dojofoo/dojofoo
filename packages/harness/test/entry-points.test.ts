import { describe, expect, it } from "vitest";

const barrels = {
  persona: [import("../src/persona.ts"), [import("../src/persona-host.ts"), import("../src/lifecycle.ts"), import("../src/process-groups.ts"),
    import("../src/file-guard.ts"), import("../src/read-only.ts")]],
  adapters: [import("../src/adapters.ts"), [import("../src/harness.ts"), import("../src/harness-model.ts"), import("../src/local-runtime.ts"),
    import("../src/one-shot.ts")]],
} as const;

describe("entry points", () => {
  it("./persona and ./adapters export every name of the modules they gather", async () => {
    for (const [barrel, sources] of Object.values(barrels)) {
      const entry: Record<string, unknown> = await barrel;
      for (const source of await Promise.all(sources)) {
        const names = Object.keys(source);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) expect(entry[name], name).toBe((source as Record<string, unknown>)[name]);
      }
    }
  });

  it("./messages carries Eve's event helpers", async () => {
    // The built entries: the message projection re-exports the patched Eve's own functions
    const [messages, events] = await Promise.all([import("@dojofoo/harness/messages"), import("@dojofoo/harness/events")]);
    for (const name of ["activeTurn", "delivery", "emptySessionView", "foldEvents", "openInteractions", "turn"] as const) {
      expect(typeof events[name], name).toBe("function");
      expect(messages[name], name).toBe(events[name]);
    }
  });
});
