---
theme: default
title: One pass, one useful value
routerMode: hash
monaco: true
wakeLock: false
colorSchema: dark
fonts:
  sans: Inter Variable
  mono: Iosevka
  provider: none
favicon: data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E
---

# One pass, one useful value

A small array. A useful question.

```ts
const readings = [4, 9, 2]
```

What would you remember after each reading?

---

# Try your idea

This is an editable Slidev Monaco block, using the same Shiki theme as the kata editor.

```ts {monaco}
/** Return the largest reading, or undefined when there are none. */
export function largest(readings: readonly number[]): number | undefined {
  throw new Error('Your turn')
}
```

---

# Test your prediction

Which input would tell you whether your idea handles negative readings?

```ts
const anotherWeek = [-3, -7, -1]
```

Explain what you expect before changing your code.
