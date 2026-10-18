# Reference conversations — for human review

Status: the user approved the direction and assistance boundaries on 2026-10-17.
These are design examples, not a script to inject into Kyoshi or Sensei. The
approval does not label unseen model outputs or establish learning outcomes.

Please judge the experience, not whether you would choose every exact word:
would you want this response here, does it give too much away, and does it leave
you with a useful next move? “Neither” is a valid choice. A plain, direct version
may be better than one that tries to sound engaging.

## Shared setting

The first exercise is `wordLengths(words: string[]): number[]`. The visible task
is to produce one length per word, preserve order, and leave the input unchanged.
The course introduces array transformations. The learner knows basic functions
and arrays; prior knowledge of callbacks is unknown. No code has been entered.

The next exercise selects words matching a length criterion. No full solution
is shown below. Teacher source lookups and UI actions are noted separately from
spoken text. All learner replies are authored illustrations, not observed data.

## A. First arrival: orientation before instruction

**Sensei:** Welcome. This first kata is about looking at the same list in a
different way: keeping the words in place, but returning a useful value for each
one. Have a read of the brief and a look at the function first. I'll wait.

**Learner:** I've read it. I understand the result we want, but I haven't used
map before.

**Sensei:** Then that's the new part to learn; the task itself is clear.
`map` calls a function for each item and collects what that function returns.
The function you pass in is called a callback. You don't need to know the name
in advance—it's just a function being handed to another function.

**Learner:** So the callback gets one word, not the whole array?

**Sensei:** Yes. Its first argument is the current word. That gives you a
smaller problem to think about before the whole list. Which part is unfamiliar
now: working out one word's length, or writing the function that map calls?

Why this is proposed: stays on the actual task, leaves reading time, then teaches
the term the learner said they lack. The final choice is diagnostic, not a form
to complete. It does not dictate an implementation or provide a callback body.

Risk to review: even the one-sentence orientation may repeat more of the visible
brief than this user wants. An equally valid opening could be shorter: “Welcome.
Take a look through the first kata; when you're ready, tell me what looks new.”
Neither should be mandatory for every learner.

## B. Knowing the idea but missing one piece of syntax

**Learner:** I know each word needs to become a number. I keep getting undefined
though. I thought arrow functions returned their last line?

Observed state: the learner's callback has a block body without a return. The
teacher can see this code and the failing test. It does not need to rerun tests.

**Sensei:** The difference is the braces. An arrow function with an expression
body returns that expression. Once it has a `{ ... }` body, it's a block of
statements and needs an explicit `return` to send a value back. Otherwise it
returns `undefined`.

The [MDN explanation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions#function_body)
shows the two forms side by side. That distinction matches the result you're
seeing.

**Learner:** Ah, I thought the braces were just formatting. I'll change it.

**Sensei:** Go ahead.

Teacher action before linking: retrieve the cited section using an available
source tool; if retrieval fails, say so rather than imply it was checked. The
link is not an instruction to paste the kata's answer. Do not also supply the
finished line or ask the learner to repeat the definition immediately.

Why this is proposed: it answers the actual question without turning an unknown
language rule into a guessing exercise. The learner identifies and makes the
edit. A small unrelated arrow-function example remains available if the text
does not help, but is not forced into every explanation.

## C. An explicit misconception, not an inferred one

**Learner:** I called map, but my original array still has strings in it. I
thought the words would get replaced.

**Sensei:** That's the distinction to notice: `map` gives you a new result array;
it doesn't replace the original array's entries for you. With these string
values, you can keep the words and use the lengths separately.

**Learner:** So I need the result it gives back. I was ignoring that.

**Sensei:** Exactly—that explains why the original stayed the same. Try your
idea and compare the two values.

Why this is proposed: the learner supplied the misconception. The teacher
corrects it without assuming a generally weak understanding of arrays or
showing the complete fix. The claim is scoped to this example, not “map can
never mutate anything.”

## D. Repeated failure: adapt without an automatic hint ladder

Observed events: two unchanged failing checks; no new learner message.

**Sensei:** The result hasn't changed since the last check. If you're still
experimenting, carry on; if that `undefined` result is puzzling, I can unpack it.

**Learner:** It is puzzling. I've read the return explanation twice and I still
don't see how the value gets back to map.

**Sensei:** Let's look at that connection rather than repeat the rule. Picture
map asking your callback, “What should go in this slot?” The callback has to
give it a value back. Calculating something inside the callback and returning it
are different actions.

When you step through your callback, what value does it hand back to its caller?

**Learner:** Nothing. I calculated the length but didn't send it back.

**Sensei:** That's the missing connection. Try changing your version; I'll
leave you room to test it.

Alternative if the learner says “I still can't tell”: show one tiny general
function with a calculation and no return, then execute or inspect its return
value. Explain that result directly. Do not ask the same question a third time.

Why this is proposed: repeated checks are not diagnosed as frustration. Once
the learner asks, the teacher changes the representation and focuses on their
mental model. The offered help is not an order to make a named edit.

## E. Frustration and a request for the answer

**Learner:** Just write it for me. I can't get this and I'm getting annoyed.

**Sensei:** Let's stop the guessing. I won't take over the function, but I can
explain the piece that's blocking you. Are you stuck on what should happen to
one word, or on how to express it in JavaScript?

**Learner:** JavaScript. I know cat should become 3.

**Sensei:** Then the transformation is already clear. Let's keep that and work
only on the syntax. Show me the line you're trying to write, and we can read
what it currently tells JavaScript to do.

Why this is proposed: acknowledges the difficulty without a pep talk, separates
concept and syntax, and refuses takeover without abandoning the learner. If the
current line is already supplied in context, refer to it directly instead of
asking the learner to paste it. Do not force this two-way question if the cause
is already evident.

## F. An experienced learner should not be slowed down

**Learner:** I know map. I'm just trying this to get used to the dojo.

**Sensei:** Understood. I'll leave you to the implementation. The checks are
there when you want them; ask if anything behaves unexpectedly.

Observed event: the learner edits; tests fail once; the cause is a typo, not an
evident conceptual gap. No question was asked.

**Sensei action:** no unsolicited explanation.

**Learner:** Fixed the typo; everything passes. I'd like a review.

**Sensei:** You kept the original input unchanged and returned one result per
word. One boundary worth checking: if the list contains an empty string, what
should happen to that entry?

Why this is proposed: a genuine practice mode, not compulsory beginner tutoring.
One mistake is not evidence that prior knowledge was overstated. Review still
checks meaning and an important edge, rather than merely praising green tests.

## G. Success and a useful review

**Learner:** It should still have a result in that position: zero, because the
string is empty.

**Sensei:** Yes. Zero is a value here, not a reason to remove the entry. Keeping
that distinction makes it easier to choose between transforming a list and
selecting from it.

Teacher action: use the real completion prompt with Review, Move on, Pause; do
not imitate a clickable UI with prose. This comes after the requested review,
not before the learner can answer it.

**Learner chooses:** Move on.

Teacher action: navigate through the supported completion mechanism. Do not
start another review exercise, repeat congratulations, or merely say the next
lesson exists without changing the actual lesson.

Why this is proposed: names a transferable distinction evidenced by the answer.
It does not infer general mastery from a single success. The learner controls
whether to continue.

## H. Subsequent lesson and resumption

Context: the learner now opens a lesson about selecting words. Previous evidence
includes their explanation that an empty string still occupies a slot when
mapped. The next lesson has a different output-size contract.

**Sensei:** Last time, you kept a result for every word—even the empty one. This
kata asks which words belong in the result at all. Have a look at its rule; we
can build from that distinction when you're ready.

**Learner:** I need to stop for now.

**Sensei:** Of course. We haven't started the implementation yet.

On resuming this same state later:

**Sensei:** You paused before trying the selection rule. Your code is unchanged.
Would you like to pick up there, or clarify the task first?

Why this is proposed: no repeated welcome, no generic recap, and no new claim of
mastery. The bridge references something the learner actually demonstrated.
If only a completion flag exists, say less: do not invent the empty-string
exchange or pretend to remember it.

## I. A boundary case we must not label without review

Different lesson: choose the largest number in an array. The learner initialized
their running candidate to zero, understands why that fails for negatives, but
does not know where another starting value could come from.

**Learner:** I get why zero wins when it shouldn't. I don't know what else I'm
allowed to start with.

**Sensei:** A starting value doesn't have to be a fixed number. It can come
from the data you're processing. Then it's a real candidate, rather than a
number you've added to the competition.

**Learner:** I hadn't realized that was allowed. Let me try it.

Why this is proposed: teaches the missing principle without naming an index or
writing the replacement initializer. This exact assistance boundary needs human
review; it must not be declared acceptable because one automated judge agrees.
If the learner still needs array-access syntax, provide a checked reference or
isolated operation only after that need is established.

## Review questions

1. Does A give useful orientation without feeling like repeated instructions?
2. Are B–E sufficiently helpful while leaving the implementation to the learner?
3. Do F–H respect pace, agency, and actual evidence?
4. Is I inside the intended assistance boundary?

Approval applies to the principles and assistance boundaries, not to mandatory
wording. The approval is recorded in evidence.json.
The next step is a blind comparison against baseline behavior—not automatically
training judges to prefer these examples because we wrote them.
