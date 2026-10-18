## 2025-05-18 - Form Input Accessibility & Auto-Focus in Sheets
**Learning:** Hiding character counters with `aria-hidden` in name/title fields prevents screen reader users from discovering input constraints. Additionally, allowing submission of empty or whitespace-only inputs degrades UX.
**Action:** Link input fields to character counters via `aria-describedby`, disable submit buttons when input is empty/whitespace, and auto-focus inputs on modal mount.
