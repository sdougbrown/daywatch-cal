---
"@daywatch/cal": patch
---

Fix conflict/occupancy detection for continuous multi-day timed spans (e.g. a week-long on-call shift loaded from an `.ics` `VEVENT`). Such a range expands to `fromDate@startTime → toDate@endTime`, but per-day expansion was applying the boundary times to every day, collapsing the span to a zero-width point (`12:00→12:00`) — so interior days registered no occupancy and `findConflicts` missed every overlap. `getTimeSlots` now expands a continuous span correctly: the first day runs `startTime→24:00`, interior days `00:00→24:00`, and the last day `00:00→endTime`. Detection is gated on a non-recurring bounded range whose `startTime + duration` overflows the first day, so recurring per-day windows are unaffected. Ported to the Rust evaluator with a shared conformance fixture.
