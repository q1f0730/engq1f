## 2026-10-22 - O(1) Word Active Status Check in `synonymsFor`
**Learning:** Re-building a `Set` from the entire `index.list` array on every single `synonymsFor` lookup creates massive overhead (O(N) allocations and iteration per call). Since `index.list` consists of all words where `!w.b || index.basic`, an inline predicate check `!w.b || index.basic` achieves the same answer in O(1) time without allocations.
**Action:** Always prefer invariant property checks on items over creating multi-thousand-element `Set`s dynamically during list iterations or sorting functions.
