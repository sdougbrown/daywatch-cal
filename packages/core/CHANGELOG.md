# @daywatch/cal

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
