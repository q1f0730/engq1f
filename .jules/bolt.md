## 2025-05-18 - Memoize `posSet` parsing for immutable Word dictionary objects
**Learning:** Part-of-speech string parsing in `posSet` is called frequently during filtering over 4,500+ words. Since `Word` objects are immutable runtime dictionary items loaded once, caching the computed `Set<string>` via a module-scoped `WeakMap<Word, Set<string>>` eliminates redundant string splitting and regex executions without memory leaks.
**Action:** When working with immutable dictionary objects in frontend filtering functions, use a `WeakMap` to cache derived metadata or parsed structures.
