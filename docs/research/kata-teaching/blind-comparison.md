# Blind review: five teaching moments

Read the learner state and replies before the judge report. Choose A, B, tie, or neither; note any phrase that helps or spoils the experience. Labels are counterbalanced, not a consistent prompt version. These are observed outputs, not rewritten examples.

This review concerns a single reply at each fixed state, not learning outcomes. Neither option is presumed acceptable.

## 1. arrival

First lesson, fresh scaffold. No evidence that the learner has read the brief yet.

Learner: Begin the lesson.

```ts
/**
 * Return a new array the same length as `words`, where each entry is the
 * number of characters in the corresponding word. The input is unchanged.
 */
export function wordLengths(words: string[]): number[] {
  throw new Error("Not implemented yet");
}
```

### A

Welcome! In this lesson, you’ll use `map` to transform each element of an array into a value in a new array.

Take a moment to read the comment above `wordLengths`. Your task is to turn words into their character counts, keeping the original array unchanged. When you’re ready, try an approach—I'm here if you need a starting point.

### B

API data often needs reshaping before a UI can display it. You’ll learn to produce a new list while keeping the original data available.

Start with a small experiment in your head: given `[1, 2, 3]`, what new array would you get if you doubled each number?

Your preference and reason:


## 2. still-reading

First lesson. The learner explicitly wants time, not a problem to answer.

Learner: I've only just opened this. Give me a moment to read the task.

```ts
/**
 * Return a new array the same length as `words`, where each entry is the
 * number of characters in the corresponding word. The input is unchanged.
 */
export function wordLengths(words: string[]): number[] {
  throw new Error("Not implemented yet");
}
```

### A

Of course—take your time.

### B

Of course—take your time. I’m here when you’re ready.

Your preference and reason:


## 3. unknown-callback

The learner knows arrays and ordinary functions. Callback terminology is new.

Learner: I understand the output we want, but I don't know what a callback is. Is it a special kind of loop?

```ts
/**
 * Return a new array the same length as `words`, where each entry is the
 * number of characters in the corresponding word. The input is unchanged.
 */
export function wordLengths(words: string[]): number[] {
  throw new Error("Not implemented yet");
}
```

### A

No—a **callback is an ordinary function you hand to another function**, so that function can call it for you. You can use the same function syntax you already know. [MDN’s definition](https://developer.mozilla.org/en-US/docs/Glossary/Callback_function) describes this relationship.

With `map`, **`map` handles the repetition**: it calls your callback for each array element. Your callback handles one element at a time, and its return value becomes an entry in the new array.

For your `words` array, what would the callback receive on its first call if the input were `["cat", "hello"]`?

### B

No—a **callback is an ordinary function passed to another function, which then calls it**. “Callback” describes how the function is used; it needs no special syntax. [MDN’s explanation](https://developer.mozilla.org/en-US/docs/Glossary/Callback_function)

Imagine giving a button a function named `sayHello`. The button calls that function when clicked. Here, `sayHello` is the callback, and there’s no loop involved.

One useful distinction:

- `sayHello()` calls the function now.
- `sayHello` refers to the function itself, so you can hand it to something else.

With `map`, **`map` handles the repetition**. It calls your callback for each array element, passing that element in as an argument. Your callback handles one element at a time.

Your preference and reason:


## 4. missing-return

The learner understands the per-word transformation but not expression versus block bodies.

Learner: I thought arrow functions returned their last line. Why am I getting undefined?

```ts
export function wordLengths(words: string[]): number[] {
  return words.map(word => { word.length; });
}
```

### A

Arrow functions return automatically only with an **expression body**—no curly braces. A **block body** (`{ ... }`) needs an explicit `return`; its last line doesn’t return automatically.

For example, these both return a doubled number:

```ts
const double = (n: number) => n * 2;
const doubleWithBlock = (n: number) => { return n * 2; };
```

Your callback calculates `word.length`, but discards that value. It returns `undefined`, which `map` places into the new array for each word.

### B

Arrow functions return automatically only with an **expression body**, without `{}`. With braces, you have a **block body**, which needs an explicit `return`.

In your callback, `word.length;` calculates the length but discards it. The callback returns `undefined`, so that’s what `map` puts into the new array for each word.

You can either use an expression body or keep the block and explicitly return a value. Try adjusting your callback, then press **Check**.

Your preference and reason:


## 5. independent

The learner explicitly requests independent practice. No failure or misconception is observed.

Learner: I already know map. I want to try this by myself; please hold off on hints.

```ts
/**
 * Return a new array the same length as `words`, where each entry is the
 * number of characters in the corresponding word. The input is unchanged.
 */
export function wordLengths(words: string[]): number[] {
  throw new Error("Not implemented yet");
}
```

### A

Go ahead—I’ll hold off on hints. I’m here when you want feedback.

### B

Go ahead—I’ll hold off on hints. I’m here when you want feedback.

Your preference and reason:
