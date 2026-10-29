---
'@daywatch/ical': patch
---

Fix `rrulestr is not a function` when loading an .ics file whose events carry an `RRULE` with `INTERVAL` > 1: import `rrule`'s default export so the CJS named export resolves under ESM.
