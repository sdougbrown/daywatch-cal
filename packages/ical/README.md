# @neo-reckoning/ical

Browser-compatible iCal (.ics) parsing adapter for [@neo-reckoning/core](https://www.npmjs.com/package/@neo-reckoning/core).

Parses external calendar feeds and produces `CalendarEvent[]` for the same rendering pipeline as native date ranges.

## Status

**This package is a placeholder.** The types and interface are defined but the implementation is pending. It will use:

- [ical.js](https://github.com/nicjansma/ical.js) (Mozilla's browser-compatible parser) for .ics text parsing
- [rrule](https://github.com/jakubroztocil/rrule) for RRULE recurrence expansion

## Planned API

```typescript
import { parseICS, fetchAndParse } from '@neo-reckoning/ical';
import type { CacheAdapter } from '@neo-reckoning/core';

// Parse raw .ics text into normalized events
const events = parseICS(icsText, { from: windowStart, to: windowEnd });

// Fetch via a CORS proxy and parse in one call
const events = await fetchAndParse(
  '/api/subscription/abc-123/proxy',
  { from: windowStart, to: windowEnd },
  {
    cache: myAdapter,   // pluggable: localStorage, AsyncStorage, etc.
    cacheTTL: 300000,   // 5 minutes
  },
);
```

## Intended flow

```
External .ics URL (Google Calendar, Outlook, etc.)
  → API proxy endpoint fetches server-side (avoids CORS)
  → Raw .ics text returned to browser
  → This package parses + expands RRULE occurrences
  → CalendarEvent[] feeds into the same pipeline as native DateRanges
```

## Design decisions

- **Browser-first** — no Node.js APIs. Works in web browsers and React Native.
- **RRULE stays as RRULE** — imported recurrence is expanded by the `rrule` library, not converted to neo-reckoning's native model. Two parallel evaluation paths converge into one `CalendarEvent[]` shape.
- **Pluggable cache** — `CacheAdapter` interface supports sync (localStorage) and async (AsyncStorage/MMKV) implementations.

## License

MIT
