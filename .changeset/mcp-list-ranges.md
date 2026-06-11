---
'@daywatch/mcp': minor
---

Add a `list_ranges` MCP tool that enumerates the stored DateRanges across loaded calendars with summary metadata (ids, labels, date bounds, recurrence summaries, compact event metadata). gcal/msft recurring-event instances are grouped into one row per series by default (`group_by: "none"` to disable), labels can be filtered with a `label_match` regex (capped at 256 chars), and an opt-in `count_within` window computes occurrence counts and first/last occurrence dates — with `occurrence_unit` selecting between counting individual events (default) or distinct days. Loaded calendars now also persist their effective ics parse window, reported by both `list_ranges` and `list_calendars` so callers can tell whether a listing is clipped.
