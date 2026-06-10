# @daywatch/ical

## 0.1.3

### Patch Changes

- d88fdcb: `addMinutes("23:00", 120)` previously returned `null`, silently dropping end times that crossed midnight. Downstream, `endTime` became `null`, causing broken conflict detection, free-slot finding, and scoring.
- b694eb1: Implement `fixedBetween` semantics in both evaluators

  `fixedBetween: true` on a `DateRange` now correctly matches every day between `fromDate` and `toDate`, bypassing recurrence filters (`everyWeekday`, `everyDate`, `everyMonth`) while still respecting exclusions (`exceptDates`, `exceptBetween`). Previously this property was only used by the iCal RRULE mapper and was silently ignored at evaluation time.

  Fixes #16.

## 0.1.2

### Patch Changes

- 90cb858: Use a namespace import for `rrule` so the package resolves cleanly under stricter ESM resolvers (notably Bun, including `bun build --compile`). Node behavior is unchanged — `const { rrulestr } = rrulePkg` still produces the same binding.
- Updated dependencies [a459f4b]
  - @daywatch/cal@0.2.0

## 0.1.1

### Initial release

- Added .ics parsing and generation adapters between VEVENT data and daywatch DateRange[] values.
- Introduced two-tier RRULE handling with direct native mapping plus expansion fallback for complex recurrence patterns.
