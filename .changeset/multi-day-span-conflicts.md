---
"@daywatch/cal": patch
"@daywatch/mcp": patch
---

Fix conflict/occupancy detection for continuous multi-day timed events (e.g. a week-long on-call shift, or a multi-day OOO) — including those loaded from Google Calendar / Outlook, which is the common case.

Such an event is one block from `fromDate@startTime` to `toDate@endTime`, but `getTimeSlots` was applying the boundary times to every day, collapsing the span to a zero-width point (`12:00→12:00`). Interior days registered no occupancy, so `findConflicts` (and free-slot / day-detail) missed every overlap. `getTimeSlots` now expands a continuous span correctly: first day `startTime→24:00`, interior days `00:00→24:00`, last day `00:00→endTime`.

A continuous span shares the same `fromDate/toDate/startTime/endTime` shape as a *daily window repeated over a date range*; they're told apart by `duration` (a span's duration overflows its first day). The `.ics` parser already set `duration`, but the **gcal and msft adapters did not** — so multi-day events loaded from those sources were indistinguishable from daily windows and hit the bug. Both adapters now set `duration` (total elapsed minutes), matching the `.ics` parser.

Ported to the Rust evaluator; shared conformance fixture `conflicts/multi_day_span.json` plus adapter and evaluator unit tests keep the engines in lockstep.
