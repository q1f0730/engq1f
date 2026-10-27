## 2026-10-27 - Reuse Pre-computed Word Sets in WordIndex
**Learning:** Functions called repeatedly across vocabulary words (such as `synonymsFor`) that check membership against `index.list` suffer from repeated `new Set(index.list.map(...))` allocations.
**Action:** Populate a `Set<string>` property (`activeSet`) on `WordIndex` during `build()` and reuse it in lookup/ranking functions instead of allocating fresh sets per function call.
