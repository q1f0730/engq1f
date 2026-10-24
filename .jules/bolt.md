## 2026-10-14 - Active word check in WordIndex
**Learning:** In this codebase, checking whether a `Word` is active in `WordIndex.list` can be done in O(1) time with `!w.b || Boolean(index.basic)`. Re-creating `new Set(index.list.map(w => w.w))` allocates ~4,000 strings and a large Set object per call, causing significant CPU and garbage collection overhead in hot paths like synonym lookup.
**Action:** Use `!w.b || Boolean(index.basic)` (or a helper function) instead of constructing a Set from `index.list` when filtering/sorting words by active status.
