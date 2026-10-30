import type { ToolCallPart, UIMessage } from "@tanstack/ai-client";

/*
 * The Sensei's chat in a lesson, as TanStack AI's messages: what the stories under Components/Organisms/Sensei Chat
 * replay through the real renderer. The lesson: merge a person's settings over the defaults (kata.ts below), where the
 * learner has the spread the wrong way round on line 6.
 */

export const kata = `export type Settings = { theme: "light" | "dark"; fontSize: number; wrap: boolean };

export const defaults: Settings = { theme: "light", fontSize: 14, wrap: false };

export function mergeSettings(input: Partial<Settings>): Settings {
  return { ...input, ...defaults };
}
`;

type Part = UIMessage["parts"][number];

export const user = (id: string, content: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", content }] });
export const sensei = (id: string, ...parts: Part[]): UIMessage => ({ id, role: "assistant", parts });
export const text = (content: string): Part => ({ type: "text", content });
export const thinking = (content: string): Part => ({ type: "thinking", content });

let calls = 0;
/** A tool call, complete unless `state` says otherwise; `durationMs` as the harness reports it */
export function tool(name: string, input: Record<string, unknown>, rest: Partial<ToolCallPart> & { durationMs?: number } = {}): Part {
  return { type: "tool-call", id: `call-${++calls}`, name, arguments: JSON.stringify(input), input, state: "complete", ...rest } as Part;
}

const report = (failed: boolean) => ({
  passed: failed ? 2 : 3, failed: failed ? 1 : 0, total: 3,
  tests: [
    { name: "keeps the defaults for what's left out", status: "passed", failureMessages: [] },
    { name: "takes the person's theme over the default", status: failed ? "failed" : "passed",
      failureMessages: failed ? ['Expected "dark" but received "light". The defaults are spread last, so they win.'] : [] },
    { name: "leaves the input unchanged", status: "passed", failureMessages: [] },
  ],
});

const ask = "Check my solution, please.";

/** The learner has asked; nothing has come back yet */
export const thinkingNow = [user("u1", ask)];

/** Reading and searching the lesson, thinking in between */
export const working = [user("u1", ask), sensei("a1",
  thinking("The learner wants a check. Read the kata first, then the tests, before running anything."),
  tool("read_file", { path: "kata.ts" }, { output: kata, durationMs: 40 }),
  tool("grep", { pattern: "mergeSettings", path: "." }, { state: "input-complete" }),
)];

/** Waiting on something outside the conversation */
export const waiting = [user("u1", ask), sensei("a1",
  tool("read_file", { path: "kata.ts" }, { output: kata, durationMs: 40 }),
  tool("wait", { seconds: 5, reason: "The test runner is still installing dependencies" }, { state: "input-complete" }),
)];

/** The lesson's checks, still running */
export const testing = [user("u1", ask), sensei("a1",
  tool("read_file", { path: "kata.ts" }, { output: kata, durationMs: 40 }),
  tool("dojo_lesson_verify", { lesson: "merge-settings" }, { state: "input-complete" }),
)];

/** The checks ran: one fails, and the Sensei points at the line without giving the fix away */
export const checksFailed = [user("u1", ask), sensei("a1",
  tool("read_file", { path: "kata.ts" }, { output: kata, durationMs: 40 }),
  tool("dojo_lesson_verify", { lesson: "merge-settings" }, { output: report(true), durationMs: 1840 }),
  text("Two of three pass. The one that fails is about **whose theme wins**: the person asked for `dark` and got `light`.\n\nLook at [highlight:L6] – when two spreads set the same key, which one does the object keep?"),
)];

/** The checks pass */
export const checksPassed = [user("u1", "Swapped them – check again?"), sensei("a1",
  tool("dojo_lesson_verify", { lesson: "merge-settings" }, { output: report(false), durationMs: 1620 }),
  text("All three pass. Spreading `input` last is what lets the person's choices win over the defaults."),
)];

/** The tools a session goes through, finished, with one that failed */
export const toolCalls = [user("u1", "Why does my theme come out light?"), sensei("a1",
  thinking("Start from the code, then the tests, then reproduce."),
  tool("read_file", { path: "kata.ts" }, { output: kata, durationMs: 38 }),
  tool("glob", { pattern: "**/*.test.ts" }, { output: "kata.test.ts", durationMs: 12 }),
  tool("grep", { pattern: "theme", path: "kata.test.ts" }, { output: 'kata.test.ts:9:  expect(mergeSettings({ theme: "dark" }).theme).toBe("dark");', durationMs: 21 }),
  tool("bash", { command: "node -e \"console.log(require('./kata').mergeSettings({ theme: 'dark' }))\"" }, { output: "{ theme: 'light', fontSize: 14, wrap: false }", durationMs: 412 }),
  tool("read_file", { path: "notes.md" }, { state: "error", output: "ENOENT: no such file or directory, open 'notes.md'", durationMs: 6 }),
  text("Running it shows the same thing your test does: you pass `dark`, and `light` comes back. The code that decides it is [highlight:L5-7]."),
)];

/** A question with one answer, from an ask-user tool */
export const askChoice = [user("u1", "I think it works now."), sensei("a1",
  text("Before we run the checks – a quick one."),
  tool("ask_user", { id: "spread", question: "Two spreads set `theme`. Which value ends up in the object?", options: [
    { id: "first", label: "The first spread's", description: "Earlier keys are kept" },
    { id: "last", label: "The last spread's", description: "Later keys overwrite earlier ones" },
    { id: "error", label: "Neither", description: "TypeScript reports a duplicate key" },
  ] }, { state: "input-complete" }),
)];

/** Several answers at once, then a second question */
export const askMany = [user("u1", "What should I test next?"), sensei("a1",
  tool("ask_user_question", { questions: [
    { id: "cases", question: "Which cases does your test cover already?", multiSelect: true, options: [
      { id: "empty", label: "An empty input" }, { id: "theme", label: "Only a theme" },
      { id: "all", label: "Every setting" }, { id: "extra", label: "A key that isn't a setting" },
    ] },
    { id: "next", question: "Which one would you add first?", allowOther: true, options: [
      { id: "empty", label: "An empty input" }, { id: "extra", label: "A key that isn't a setting" },
    ] },
  ] }, { state: "input-complete" }),
)];

/** An open question: the learner writes the answer */
export const askText = [user("u1", "Can I move on?"), sensei("a1",
  text("Almost. Explain it back to me first – it's how it sticks."),
  tool("request_user_input", { id: "why", question: "In one or two sentences: why does the order of the spreads matter?" }, { state: "input-complete" }),
)];

/** A question already answered: the form stays, read-only, with the answer */
export const askAnswered = [user("u1", "I think it works now."), sensei("a1",
  tool("ask_user", { id: "spread", question: "Two spreads set `theme`. Which value ends up in the object?", options: [
    { id: "first", label: "The first spread's" }, { id: "last", label: "The last spread's" }, { id: "error", label: "Neither" },
  ] }, { output: { answers: { spread: ["last"] } } }),
  text("Right – the last one wins. So which should come last in `mergeSettings`?"),
)];

/** Line references: each is a chip that highlights those lines in the editor */
export const highlights = [user("u1", "Where should I look?"), sensei("a1",
  text("Three places, in order:\n\n1. The shape of a setting – [highlight:L1]\n2. What you fall back to – [highlight:L3]\n3. Where the two meet – [highlight:L5-7]\n\nThe answer is in the last one, on [highlight:L6]."),
)];

/** Everything Markdown can say, as the Sensei might */
export const markdown = [user("u1", "Can you sum up what we covered?"), sensei("a1", text(`## Merging settings

You merged a person's **partial** settings over the *defaults*. Three things made it work:

1. **Spread order** – later spreads overwrite earlier keys
   - \`{ ...defaults, ...input }\` keeps the person's choices
   - \`{ ...input, ...defaults }\` throws them away
2. **\`Partial<Settings>\`** – every key optional, so callers pass only what they change
3. **Tests per rule** – one test for each thing that must hold

> A test that names the rule ("takes the person's theme") tells you *what* broke, not just *that* something did.

### What each test checks

| Test | Input | Expect |
| --- | --- | --- |
| Defaults stay | \`{}\` | \`defaults\` |
| Theme wins | \`{ theme: "dark" }\` | \`theme: "dark"\` |
| Input untouched | any | same object after |

\`\`\`ts
export function mergeSettings(input: Partial<Settings>): Settings {
  return { ...defaults, ...input };
}
\`\`\`

Run them again any time:

\`\`\`bash
npx vitest run kata.test.ts
\`\`\`

---

#### Next up

- [x] Spread order
- [x] Partial types
- [ ] ~~Deep merging~~ – nested settings, next lesson

More in the [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/2/objects.html).`))];

/** The reply the Streaming story types out, a few characters at a time */
export const streamingReply = `Good question. The **order of the spreads** decides it:

- \`{ ...a, ...b }\` – \`b\`'s keys win
- \`{ ...b, ...a }\` – \`a\`'s keys win

So in [highlight:L6], which object should come last?

\`\`\`ts
const merged = { ...defaults, ...input };
\`\`\``;

/** A whole exchange, from the first question to the passing checks */
export const lesson = [
  user("u1", "I don't get why my theme test fails."),
  sensei("a1",
    thinking("The learner's theme test fails. Read the kata, then run the checks to see the message."),
    tool("read_file", { path: "kata.ts" }, { output: kata, durationMs: 38 }),
    tool("dojo_lesson_verify", { lesson: "merge-settings" }, { output: report(true), durationMs: 1840 }),
    text("The failing test passes `{ theme: \"dark\" }` and gets `light` back.\n\nLook at [highlight:L6]. When two spreads set the same key, which one does the object keep?"),
  ),
  user("u2", "The last one? So defaults overwrite my input."),
  sensei("a2", text("Exactly. Change the order so the person's settings win, then check again.")),
  user("u3", "Done – check again?"),
  sensei("a3",
    tool("dojo_lesson_verify", { lesson: "merge-settings" }, { output: report(false), durationMs: 1620 }),
    text("All three pass. Want to try nested settings next, or recap first?"),
  ),
];
