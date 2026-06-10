---
"@daywatch/mcp": patch
---

Clarify in the server instructions and `load_calendar` docs that gcal/msft events should be fed through their native `source`, not hand-converted to `ranges`. Flattening drops the transparency/declined filtering and per-event timezone reconciliation the native parsers do, which silently corrupts scoring. Also note that an oversized upstream `list_events` result is a reason to slice it by date window, not to downgrade it to ranges.
