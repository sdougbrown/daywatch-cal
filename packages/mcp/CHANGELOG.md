# @daywatch/mcp

## 0.4.0

### Minor Changes

- 7220b5d: Add `load_calendar_url` tool: fetch an .ics feed by URL (incident.io schedule feeds, published calendar links) and load it directly into the session, removing the harness-side fetch step that behaved inconsistently across clients. Accepts https and webcal URLs; plain http is allowed for localhost only, and redirects are followed manually (max 5 hops) with every hop re-validated against the same scheme/host policy. The fetch uses the built-in Node fetch with a 30s timeout, a 20 MB streamed size cap, and body sniffing (`BEGIN:VCALENDAR`) instead of trusting Content-Type. Auth tokens embedded in feed URLs are redacted from all results and error messages, and failure classes (timeout, network, non-2xx, empty body, HTML body) each surface a distinct actionable error.

## 0.3.0

### Minor Changes

- 51a4e91: `load_calendar_file` now accepts a `source` of `"ics"` (default), `"gcal"`, or `"msft"`, so Google Calendar / Microsoft Graph JSON can be loaded **by path** — not just `.ics`. This is the clean answer when a `list_events` result is too large to pass through the conversation: the harness saves it to a temp file, and `load_calendar_file({ path, source: "gcal" })` reads it straight off disk through the same adapters `load_calendar` uses (transparency/declined filtering, timezone reconciliation, the multi-day `duration` fix) — no trimming, flattening, or context round-trip. gcal/msft files may be a bare event array or a raw result object with an `events` array. Server instructions updated to point at this instead of slicing oversized payloads.

### Patch Changes

- 417137e: Auto-align MCP `serverInfo.version` with `package.json` via build-time version constant instead of hardcoded string

## 0.2.0

### Minor Changes

- 832c77d: Add a `list_ranges` MCP tool that enumerates the stored DateRanges across loaded calendars with summary metadata (ids, labels, date bounds, recurrence summaries, compact event metadata). gcal/msft recurring-event instances are grouped into one row per series by default (`group_by: "none"` to disable), labels can be filtered with a `label_match` regex (capped at 256 chars), and an opt-in `count_within` window computes occurrence counts and first/last occurrence dates — with `occurrence_unit` selecting between counting individual events (default) or distinct days. Loaded calendars now also persist their effective ics parse window, reported by both `list_ranges` and `list_calendars` so callers can tell whether a listing is clipped.

## 0.1.4

### Patch Changes

- 584c9fc: Fix conflict/occupancy detection for continuous multi-day timed events (e.g. a week-long on-call shift, or a multi-day OOO) — including those loaded from Google Calendar / Outlook, which is the common case.

  Such an event is one block from `fromDate@startTime` to `toDate@endTime`, but `getTimeSlots` was applying the boundary times to every day, collapsing the span to a zero-width point (`12:00→12:00`). Interior days registered no occupancy, so `findConflicts` (and free-slot / day-detail) missed every overlap. `getTimeSlots` now expands a continuous span correctly: first day `startTime→24:00`, interior days `00:00→24:00`, last day `00:00→endTime`.

  A continuous span shares the same `fromDate/toDate/startTime/endTime` shape as a _daily window repeated over a date range_; they're told apart by `duration` (a span's duration overflows its first day). The `.ics` parser already set `duration`, but the **gcal and msft adapters did not** — so multi-day events loaded from those sources were indistinguishable from daily windows and hit the bug. Both adapters now set `duration` (total elapsed minutes), matching the `.ics` parser.

  Ported to the Rust evaluator; shared conformance fixture `conflicts/multi_day_span.json` plus adapter and evaluator unit tests keep the engines in lockstep.

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
