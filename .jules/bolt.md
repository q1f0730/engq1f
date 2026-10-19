## 2026-10-14 - Pre-computing `activeSet` in `WordIndex` prevents repeated Set allocations on hot lookup paths

**Learning:** `synonymsFor` (and components checking active words) ran `new Set(index.list.map(w => w.w))` on every invocation, allocating a 4,000+ element array and Set each time. Storing `activeSet: Set<string>` on `WordIndex` during `build()` eliminates these allocations and accelerates membership checks to O(1).
**Action:** Use `index.activeSet` when checking whether a word belongs to the current active vocabulary list rather than constructing temporary Sets from `index.list`.
