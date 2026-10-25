## 2025-05-18 - Avoid Repeated Set Allocation from `WordIndex.list`
**Learning:** `WordIndex` separates `list` (active words) and `map` (all words including hidden basic ones). Utility functions computing word subsets or sorting by active membership (e.g. `synonymsFor`) were creating `new Set(index.list.map(w => w.w))` on every invocation, causing unnecessary O(N) allocations for thousands of words.
**Action:** Always store an `activeSet: Set<string>` directly on `WordIndex` during `build()` to enable O(1) membership checks across components and hooks without recurring allocations.
