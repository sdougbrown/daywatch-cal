---
'@daywatch/cal': minor
'@daywatch/cal-rules': patch
'@daywatch/ical': patch
'@daywatch/mcp': minor
---

Conflict detection is now free/busy-aware. Ranges, occurrences and conflict participants carry an optional `transparency` signal (`'opaque'` | `'transparent'`, absent = busy): busy all-day spans occupy the full day and conflict with anything on that day, transparent ranges never occupy time or conflict, and emitted `Conflict` participants carry `allDay`/`transparency`/`eventType` metadata so callers can grade severity. The gcal and msft adapters now load transparent/free events with the flag carried through instead of dropping them (`includeTransparent`/`includeFree` are deprecated no-ops), the ics parser sets `transparency: 'transparent'` from `TRANSP:TRANSPARENT`, and cal-rules admits `transparency` as a known range key.
