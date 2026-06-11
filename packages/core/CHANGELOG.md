# @daywatch/cal

## 0.2.2

### Patch Changes

- 584c9fc: Fix conflict/occupancy detection for continuous multi-day timed events (e.g. a week-long on-call shift, or a multi-day OOO) — including those loaded from Google Calendar / Outlook, which is the common case.

  Such an event is one block from `fromDate@startTime` to `toDate@endTime`, but `getTimeSlots` was applying the boundary times to every day, collapsing the span to a zero-width point (`12:00→12:00`). Interior days registered no occupancy, so `findConflicts` (and free-slot / day-detail) missed every overlap. `getTimeSlots` now expands a continuous span correctly: first day `startTime→24:00`, interior days `00:00→24:00`, last day `00:00→endTime`.

  A continuous span shares the same `fromDate/toDate/startTime/endTime` shape as a _daily window repeated over a date range_; they're told apart by `duration` (a span's duration overflows its first day). The `.ics` parser already set `duration`, but the **gcal and msft adapters did not** — so multi-day events loaded from those sources were indistinguishable from daily windows and hit the bug. Both adapters now set `duration` (total elapsed minutes), matching the `.ics` parser.

  Ported to the Rust evaluator; shared conformance fixture `conflicts/multi_day_span.json` plus adapter and evaluator unit tests keep the engines in lockstep.

## 0.2.1

### Patch Changes

- d88fdcb: `addMinutes("23:00", 120)` previously returned `null`, silently dropping end times that crossed midnight. Downstream, `endTime` became `null`, causing broken conflict detection, free-slot finding, and scoring.
- 7f05fde: Validate timezone-qualified times even when the source and user timezones match, so nonexistent spring-forward local times are omitted correctly.
- b694eb1: Implement `fixedBetween` semantics in both evaluators

  `fixedBetween: true` on a `DateRange` now correctly matches every day between `fromDate` and `toDate`, bypassing recurrence filters (`everyWeekday`, `everyDate`, `everyMonth`) while still respecting exclusions (`exceptDates`, `exceptBetween`). Previously this property was only used by the iCal RRULE mapper and was silently ignored at evaluation time.

  Fixes #16.

## 0.2.0

### Minor Changes

- a459f4b: Add MonthTimeline month-column layout data for horizontal timeline views, including model builders and React, Preact, and Solid adapters.

## 0.1.1

### Initial release

- Introduced headless calendar computation primitives with DateRange evaluation and recurrence support.
- Added calendar/timeline generation plus conflict detection, free-slot finding, and schedule scoring helpers.
