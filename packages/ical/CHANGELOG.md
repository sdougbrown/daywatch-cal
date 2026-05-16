# @daywatch/ical

## 0.1.2

### Patch Changes

- 90cb858: Use a namespace import for `rrule` so the package resolves cleanly under stricter ESM resolvers (notably Bun, including `bun build --compile`). Node behavior is unchanged — `const { rrulestr } = rrulePkg` still produces the same binding.
- Updated dependencies [a459f4b]
  - @daywatch/cal@0.2.0

## 0.1.1

### Initial release

- Added .ics parsing and generation adapters between VEVENT data and daywatch DateRange[] values.
- Introduced two-tier RRULE handling with direct native mapping plus expansion fallback for complex recurrence patterns.
