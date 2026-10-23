# Bolt's Journal

## 2026-10-23 - WordIndex active set creation bottleneck
**Learning:** `synonymsFor` previously created `new Set(index.list.map(w => w.w))` on every invocation to check if a word is in the active list. Since `WordIndex` guarantees a word in `map` is active if and only if `!w.b || index.basic`, this O(N) allocation and lookup can be replaced with an O(1) property check without instantiating 4k-element arrays/Sets.
**Action:** Use `!w.b || index.basic` for active word status checks instead of building `Set(index.list.map(...))` dynamically.
