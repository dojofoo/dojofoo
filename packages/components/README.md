# @dojofoo/components

Status: proposal. This package has no code yet. It records the plan for a lesson component library and a single lesson file format, so the ideas are in one place when the work starts.

## Why

Today a course uses one of two formats, and neither lets an author reuse a Sensei or a piece of lesson behaviour.

- A kata course lists lessons in `dojo.yaml`. Each lesson has its own `SENSEI.md`, starter code and tests, and gets its own Sensei conversation per (course, lesson).
- An interactive course lists lessons and slides in `lessons/intro.json`, with slide text in `.mdx` files and one `DOJO.md` for the whole course. It has one Sensei conversation per course (`docs/designs/agent-runtime.md`, "Interactive courses have no lessons"). No lesson can carry its own Sensei guidance, so moving to the next lesson does not start a new conversation or a new introduction. A learner who asks Sensei about lesson-specific guidance in such a course is told, correctly, that only the course-wide guidance came through.

The plan is one format for both: every lesson is a `LESSON.mdx` file. Its frontmatter says which Sensei teaches it and when it unlocks, and its body is prose plus components. Each lesson then has a focused Sensei that can be evaluated on its own.

## LESSON.mdx

```mdx
---
title: Hooks
sensei: ./SENSEI.md          # this lesson's Sensei; a path, so lessons can share one
requires: ../01-intro        # locked until that lesson is finished
---

<Intro />

# Welcome to hooks

<Editor file="./kata.ts" tests="./kata.test.ts" />
```

Other lesson bodies use the same frontmatter:

```mdx
<Slides slides={["./SLIDE1.md", "./SLIDE2.md"]} />
# Here are the slides
```

```mdx
<Video src="./intro.mp4" />
# Welcome to the course
```

```mdx
<Confetti />
# You finished the course
```

### Frontmatter

| Field | Meaning |
| --- | --- |
| `title` | Lesson name in the sidebar and on the dashboard card. |
| `sensei` | Path to the lesson's Sensei guidance. A new lesson with its own `sensei` starts its own conversation, and Sensei introduces the lesson. Lessons that point to the same file can share a conversation. |
| `requires` | A lesson path (or a list) that must be finished first. The sidebar shows the lesson as locked until then. |
| `unlockByBot` | `true` lets Sensei unlock `unlockTarget` when `unlockCondition` is met, instead of a check or a question. |
| `unlockCondition` | Plain-language condition Sensei judges, for example "learner has displayed understanding of hooks". |
| `unlockTarget` | The lesson that unlocks, for example `../02-hooks`. |
| `unlockAuto` | `true` unlocks `unlockTarget` as soon as this lesson is finished. |

Sensei unlocking is a new trust boundary: a Sensei tool that changes progress. It needs the same review as the write guard (`docs/designs/agent-runtime.md`, step 5) before it ships.

### Components

| Component | What it shows |
| --- | --- |
| `<Intro />` | The lesson's opening: title, goal, and Sensei's first message from `sensei`. |
| `<Slides slides={[...]} />` | A slide deck from Markdown files, with Previous and Next. Replaces `intro.json` slides. |
| `<Editor file tests />` | The kata editor and its Check, as the kata lesson page shows them today. |
| `<Video src />` | A video with the course's own controls. |
| `<Question answers />` | A checkpoint question; a correct answer unlocks what follows (today's `question` slide). |
| `<Confetti />` | A celebration when the learner reaches it, usually on a last slide or on `course.completed`. |
| `<Rating />` | A one-question rating of the lesson just finished, sent to the author only with consent. |

## Lesson events

The UI announces completions with `emitLessonEvent` in `packages/ui/src/lib/lesson-events.ts`: `lesson.completed` and `course.completed`, for interactive and kata courses. Nothing listens yet. Components such as `<Confetti />` and `<Rating />` would subscribe with `onLessonEvent`, as would an unlock animation on the next sidebar lesson and a Sensei recap turn before the next lesson.

## Open questions

- Migration: convert `intro.json` courses and kata `dojo.yaml` lessons to `LESSON.mdx`, or read both formats for a while.
- Evaluation: each lesson's Sensei is evaluated alone. The evaluation trial needs a per-lesson unit for that.
- Shared conversations: whether two lessons that point to the same `sensei` file share a conversation or each start one with the same guidance.
- Where components run: in the course page (React, trusted) or inside the sandboxed slide frame, which today only allows scripts.
