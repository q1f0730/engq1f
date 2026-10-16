## 2025-02-18 - Avoid uncached String.prototype.localeCompare options in sort loops
**Learning:** Calling `a.localeCompare(b, "en", { sensitivity: "base" })` inside `.sort()` on thousands of items causes severe performance bottlenecks (~35x-60x slower) because option parsing or collator creation occurs repeatedly on every comparison.
**Action:** Always instantiate a single module-level `new Intl.Collator("en", { sensitivity: "base" })` instance and use `collator.compare(a, b)` for performance-sensitive string sorts.
