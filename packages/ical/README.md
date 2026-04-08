# @daywatch/cal-ical

iCal (.ics) parser and generator for @daywatch/cal. Converts VEVENT data to DateRange[] and back.

This package parses `.ics` calendar data into daywatch-cal `DateRange[]`, preserves recurrence structure when possible, and generates valid `.ics` output from those ranges.

## What this does

- **Parse VEVENT data** — convert all-day events, timed events, spans, recurrence rules, and exceptions into `DateRange[]`
- **Generate `.ics` output** — export `DateRange[]` back to `VCALENDAR` / `VEVENT` form
- **Preserve recurrence structure** — directly map simple RRULE patterns into native daywatch-cal recurrence fields
- **Expand complex rules when needed** — fall back to explicit date expansion for recurrence patterns that do not fit the native model
- **Work in browser and Node** — built on `ical.js`, which runs in both environments

## Install

```bash
npm install @daywatch/cal-ical
```

## Quick start

```typescript
import { detectDataWindow, generateICS, parseICS } from '@daywatch/cal-ical';

const window = {
  from: new Date('2026-03-01T00:00:00'),
  to: new Date('2026-03-31T00:00:00'),
};

const ranges = parseICS(icsText, window);
const detected = detectDataWindow(icsText);
const ics = generateICS(ranges, { calendarName: 'Roundtrip' });
```

## API

### `parseICS(icsText, window)`

Parses `.ics` text into `DateRange[]` within a time window.

- Single-day, timed, and multi-day VEVENTs become native daywatch-cal ranges
- Simple RRULEs map directly to recurrence fields like `everyWeekday`, `everyDate`, and `everyMonth`
- Complex RRULEs are expanded to explicit `dates` within the requested window
- `EXDATE` values become `exceptDates`

### `generateICS(ranges, options?)`

Exports `DateRange[]` back to `.ics` format.

- Writes a valid `VCALENDAR` wrapper
- Generates `VEVENT` entries for single events, spans, and supported recurrence patterns
- Preserves timezones, `EXDATE` values, and optional calendar metadata such as `calendarName`

### `detectDataWindow(icsText)`

Performs a lightweight regex scan of raw `.ics` text to find where the actual calendar data lives.

- Scans VEVENT `DTSTART`, `DTEND`, and `UNTIL` values
- Ignores unrelated timezone blocks
- Returns a padded `{ from, to }` window or `null` if no event dates are present

## Two-tier RRULE handling

daywatch-cal has its own native recurrence model, but `.ics` RRULEs are broader. This package handles them in two tiers:

- **Tier 1: direct mapping** — simple RRULEs are converted into native `DateRange` recurrence fields so they stay compact and editable.
- **Tier 2: expansion** — complex RRULEs are expanded with the `rrule` library into explicit `dates` within the requested parse window.

Tier 2 is used for patterns like ordinal weekdays (`BYDAY=2TU`), non-daily `INTERVAL > 1`, and other RRULE parts that do not map cleanly onto the native model.

## Supported patterns

| RRULE pattern | DateRange mapping | Notes |
|---|---|---|
| `FREQ=DAILY` | `everyWeekday: [0, 1, 2, 3, 4, 5, 6]` | Daily recurrence across all weekdays |
| `FREQ=WEEKLY;BYDAY=...` | `everyWeekday` | If `BYDAY` is omitted, the DTSTART weekday is used |
| `FREQ=MONTHLY;BYMONTHDAY=...` | `everyDate` | If `BYMONTHDAY` is omitted, the DTSTART day-of-month is used |
| `FREQ=YEARLY;BYMONTH=...` | `everyMonth` | If `BYMONTH` is omitted, the DTSTART month is used |
| `UNTIL` or `COUNT` | `fromDate`, `toDate`, `fixedBetween` | Bounds the recurrence window |
| `EXDATE` | `exceptDates` | Applied to both mapped and expanded recurrences |

Patterns outside those mappings fall back to Tier 2 expansion inside the requested parse window.

## Round-trip

`parseICS()` followed by `generateICS()` preserves the parsed `DateRange` structure for supported data. That means ranges can be imported from `.ics`, manipulated in daywatch-cal form, then exported back without flattening simple recurrence into one-off events.

This is a structural round-trip, not a byte-for-byte source preservation guarantee.

## Browser-first design

This package uses `ical.js`, which works in browsers and Node. That keeps the parser and generator usable in frontend apps, React Native, workers, Node services, and MCP servers without separate platform-specific implementations.

## License

MIT
