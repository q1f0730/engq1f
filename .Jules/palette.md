## 2025-10-24 - Avoid Nested Interactive Content in Custom Cards
**Learning:** Nesting interactive elements (like a audio trigger `<span role="button">`) inside a parent `<button>` element is invalid HTML semantics. It confuses screen readers and breaks native keyboard focus flow.
**Action:** Use a `<div>` container for compound clickable cards, with separate native `<button>` elements for the main card trigger and secondary actions (such as audio play buttons). Include contextual `aria-label`s specifying the target object (e.g., `播放 [word] 的发音`).
