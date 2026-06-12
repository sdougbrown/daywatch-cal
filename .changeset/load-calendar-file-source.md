---
"@daywatch/mcp": minor
---

`load_calendar_file` now accepts a `source` of `"ics"` (default), `"gcal"`, or `"msft"`, so Google Calendar / Microsoft Graph JSON can be loaded **by path** — not just `.ics`. This is the clean answer when a `list_events` result is too large to pass through the conversation: the harness saves it to a temp file, and `load_calendar_file({ path, source: "gcal" })` reads it straight off disk through the same adapters `load_calendar` uses (transparency/declined filtering, timezone reconciliation, the multi-day `duration` fix) — no trimming, flattening, or context round-trip. gcal/msft files may be a bare event array or a raw result object with an `events` array. Server instructions updated to point at this instead of slicing oversized payloads.
