## 2026-10-15 - Cache Active Word Set Per Lexicon Index

**Learning:** Re-building `new Set(index.list.map(w => w.w))` inside frequently-called functions like `synonymsFor` constructs a 4,000+ string array and hash set on every call, taking ~0.6ms per invocation and causing $O(N^2)$ overhead when filtering/rendering sets of words.
**Action:** Use a `WeakMap<WordIndex, Set<string>>` cache for `index.list` sets when doing word lookup or active-word checks across component loops or data utilities.
