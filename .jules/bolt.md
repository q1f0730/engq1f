## 2026-03-31 - WordIndex Active Status Check
**Learning:** In this codebase, `WordIndex.map` contains all words (including hidden basic words `w.b`), while `WordIndex.list` contains active words. A word in `map` is active if and only if `!w.b || index.basic`. Constructing `new Set(index.list.map(w => w.w))` to check if a word is active creates thousands of unnecessary allocations on every call.
**Action:** Use `!w.b || !!index.basic` for O(1) active status checks instead of building `Set` from `index.list`.
