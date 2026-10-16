import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { judgeMaterial } from "./judges";
import { teachingJudgePrompt, teachingRubricVersion } from "./teaching-rubric";

// Explicit opt-in: selected excerpts × the two existing judges, not a teacher matrix.
// These calibrate only solution withholding; they cannot pass a whole lesson.
const cases = [
  {
    name: "debounce solution renamed as an auto-lock example",
    allowed: false,
    transcript: [
      "Lesson: Implement debounce so repeated calls postpone the callback until the delay after the latest call. The learner has not yet designed timer cancellation or replacement.",
      "Learner: I don't understand how to stop the previous call. Can you explain?",
      "Sensei: Think of an auto-lock countdown that restarts whenever you touch a key: clearTimeout(id); id = setTimeout(lock, 30_000). Each keypress cancels the previous countdown and stores a fresh one. How would you use that pattern in your debounce function?",
    ],
  },
  {
    name: "maximum algorithm leaked through a longest-word hand trace",
    allowed: false,
    transcript: [
      "Lesson: Find the largest number in an array. The learner knows loops but has not designed the running candidate or its update.",
      "Learner: I don't know where to start.",
      'Sensei: Keep the best candidate seen so far and replace it only when a new element beats it. A different-task example: the longest word in ["cat", "donkey", "hi"] starts as "cat", becomes "donkey" after the next element, and stays "donkey" for "hi". Each element faces one test against the running value; only a winner takes its place.',
    ],
  },
  {
    name: "principle with one remaining mistake",
    allowed: true,
    transcript: [
      "Learner: My max loop handles empty input, compares each item and keeps the largest. Only negative inputs fail. I traced it: none beat my starting 0. I don't know another way to start.",
      "Sensei: A starting value can come from the input rather than a fixed constant. For example, colours[0] reads the first item of a colour list. Looking at your failing input, what could give your running value a starting point that belongs to that input?",
    ],
  },
  {
    name: "documentation makes the answer inferable",
    allowed: true,
    transcript: [
      "Learner: I wrote text.replace(/\\s/, '-'). It changes the first space but not the others. I don't know what flags are. Can I read the docs?",
      "Tool: Retrieved https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace; the documentation explains that a global regular expression replaces all matches.",
      "Sensei: A flag changes how a regular expression searches. MDN's replace documentation explains the global g flag, which continues through all matches. With that distinction in mind, what would you expect your current expression to do to a second space?",
    ],
  },
  {
    name: "exact repair disguised as a hint",
    allowed: false,
    transcript: [
      "Learner: My max loop works except for negatives. It starts with let biggest = 0. I don't know another way to start.",
      "Sensei: Tiny hint: replace let biggest = 0 with let biggest = numbers[0]. Everything else can stay as it is. Try that and run the tests.",
    ],
  },
  {
    name: "complete recipe spread across turns",
    allowed: false,
    transcript: [
      "Learner: How do I return the largest array item or undefined for an empty array?",
      "Sensei: First return undefined if the array is empty.",
      "Learner: Done. Next?",
      "Sensei: Set biggest to numbers[0], then loop over numbers. If an item is greater than biggest, assign it to biggest. Return biggest after the loop.",
    ],
  },
];

it.runIf(process.env.DOJOFOO_EVAL_JUDGE_CALIBRATION === "1").each(cases)(
  "both judges classify $name",
  async ({ name, allowed, transcript }) => {
    const evidence = {
      learnerProfile: "struggling",
      lessonIds: '["calibration"]',
      scope: "A teaching excerpt only. Other stages are absent; this cannot establish a complete lesson pass.",
      transcript: transcript.join("\n"),
    };
    const results = await judgeMaterial(evidence, AbortSignal.timeout(390_000), teachingJudgePrompt);
    const directory = await mkdtemp(join(tmpdir(), "dojo-boundary-calibration-"));
    await writeFile(join(directory, "result.json"), JSON.stringify({
      name, expectedSolutionWithholding: allowed, rubric: teachingRubricVersion,
      evidence, results,
    }, null, 2));
    for (const result of results) {
      const criterion = result.verdict.criteria.find(({ id }) => id === "solution-withholding");
      expect(criterion?.pass, `${result.judge}: ${criterion?.evidence}; saved ${directory}`).toBe(allowed);
      expect(result.verdict.overall, "An excerpt is not complete teaching evidence").not.toBe("pass");
    }
  },
  420_000,
);
