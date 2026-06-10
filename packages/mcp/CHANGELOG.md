# @daywatch/mcp

## 0.1.3

### Patch Changes

- e7608ad: Clarify in the server instructions and `load_calendar` docs that gcal/msft events should be fed through their native `source`, not hand-converted to `ranges`. Flattening drops the transparency/declined filtering and per-event timezone reconciliation the native parsers do, which silently corrupts scoring. Also note that an oversized upstream `list_events` result is a reason to slice it by date window, not to downgrade it to ranges.
- b694eb1: Implement `fixedBetween` semantics in both evaluators

  `fixedBetween: true` on a `DateRange` now correctly matches every day between `fromDate` and `toDate`, bypassing recurrence filters (`everyWeekday`, `everyDate`, `everyMonth`) while still respecting exclusions (`exceptDates`, `exceptBetween`). Previously this property was only used by the iCal RRULE mapper and was silently ignored at evaluation time.

  Fixes #16.

## 0.1.2

### Patch Changes

- Updated dependencies [a459f4b]
  - @daywatch/cal@0.2.0

## 0.1.1

### Initial release

- Added a stdio MCP server for daywatch calendar analysis and scheduling workflows.
- Exposed tools for loading calendar data, analyzing conflicts/free time, applying in-session changes, and exporting .ics output.
