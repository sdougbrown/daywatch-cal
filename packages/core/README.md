# @daywatch/cal

Headless calendar state management library. Zero dependencies. Framework-agnostic.

A modern TypeScript rewrite of the concepts from [reckoning](https://github.com/sdougbrown/reckoning), extended with sub-day time support, hourly recurrence, timezone handling, and agent-ready scheduling primitives.

## What this does

daywatch-cal is a **computation library**, not a UI library. It tells you *what* and *when* — your app decides *how it looks*.

- **DateRange evaluation** — does a date/time fall within a range? Supports explicit dates, day-of-week/month recurrence, hourly recurrence (`everyHour` or `startTime`/`repeatEvery`), and timezone conversion.
- **Calendar grid generation** — produces Month/Week/Day data structures for rendering, with configurable fidelity (year/month/week/day) so you only compute what you need.
- **Timeline positioning** — computes event positions for hourly views with overlap detection and column assignment.
- **Span detection** — groups contiguous days into spans with lane assignment for consistent multi-day bar rendering.
- **Conflict detection** — finds overlapping timed ranges on a given day or across a window.
- **Free slot detection** — finds gaps in a schedule where new events could fit.
- **Schedule scoring** — computes quality metrics (conflicts, free time, focus blocks, context switches) for evaluating rearrangements.
- **Event normalization** — converts DateRanges into a flat `CalendarEvent[]` that can be merged with imported calendar events.

## Install

```
npm install @daywatch/cal
```

## Quick start

```typescript
import { RangeEvaluator, CalendarGrid } from '@daywatch/cal';
import type { DateRange } from '@daywatch/cal';

// Define some ranges
const ranges: DateRange[] = [
  {
    id: 'standup',
    label: 'Daily Standup',
    everyWeekday: [1, 2, 3, 4, 5],  // Mon-Fri
    startTime: '09:00',
    endTime: '09:15',
    timezone: 'UTC',
  },
  {
    id: 'meds',
    label: 'Medication',
    everyHour: [8, 14, 20],  // 8am, 2pm, 8pm
    duration: 5,
  },
  {
    id: 'vacation',
    label: 'Spring Break',
    fromDate: '2026-03-23',
    toDate: '2026-03-27',
    fixedBetween: true,
  },
];

// Evaluate ranges
const evaluator = new RangeEvaluator('America/New_York');

// Check if a date is in a range
evaluator.isDateInRange('2026-03-25', ranges[2]); // true (vacation)

// Expand occurrences in a window
const occurrences = evaluator.expand(ranges[0], new Date(2026, 2, 23), new Date(2026, 2, 27));
// → [{ date: '2026-03-23', startTime: '04:00', ... }, ...]  (UTC→ET converted)

// Find conflicts
const conflicts = evaluator.findConflicts(ranges, '2026-03-23');

// Find free slots
const freeSlots = evaluator.findFreeSlots(ranges, '2026-03-23', {
  dayStart: '09:00',
  dayEnd: '17:00',
  minDuration: 30,
});

// Generate a calendar grid
const grid = new CalendarGrid({
  focusDate: '2026-03-15',
  numberOfMonths: 1,
  ranges,
  fidelity: 'month',  // skip time slot computation
  weekStartsOn: 1,    // Monday
  userTimezone: 'America/New_York',
});

grid.months[0].weeks[0].days[0].ranges;
// → [{ rangeId: '...', label: '...', isStart: true, isEnd: false, ... }]
```

## Core concepts

### DateRange

The fundamental data model. Defines a set of dates and/or times using explicit values or recurrence patterns.

**Day-level** (from original Reckoning):
- `dates` — explicit date list
- `everyWeekday` — days of week (0=Sun, 6=Sat)
- `everyDate` — days of month (1-31)
- `everyMonth` — months (1-12)
- `fromDate` / `toDate` / `fixedBetween` — date bounds

**Sub-day** (two mutually exclusive approaches):
- `everyHour` — explicit hours list, e.g. `[6, 14, 22]`
- `startTime` / `endTime` / `repeatEvery` / `duration` — interval-based

Day and time fields combine as AND: `everyWeekday: [1,3,5]` + `everyHour: [9,17]` means "9am and 5pm on Mon/Wed/Fri."

### Timezone handling

- **UTC** (`timezone: 'UTC'`): Times are converted to the user's timezone via `Intl.DateTimeFormat`. Default for API-sourced ranges.
- **Floating** (`timezone: null`): Times are as-is, no conversion. "9am" means 9am wherever you are.
- **Specific timezone**: Converted to user's timezone.

### View fidelity

`CalendarGrid` accepts a `fidelity` option to control how much it computes per day:

| Fidelity | What's computed | Use case |
|---|---|---|
| `'year'` | `hasActivity` boolean only | Year overview, heatmaps |
| `'month'` | `ranges[]` (span info) | Month grid |
| `'week'` | `ranges[]` + `timeSlots[]` | Week view |
| `'day'` | `ranges[]` + `timeSlots[]` | Day detail |

### No styling

This library carries identifiers (`rangeId`, `sourceId`), not colors or CSS. Your app maps range IDs to colors via its own palette/theme system.

## API reference

### Classes

- **`RangeEvaluator`** — `isDateInRange()`, `isInRange()`, `expand()`, `expandDay()`, `computeSpans()`, `findConflicts()`, `findConflictsInWindow()`, `findFreeSlots()`, `findNextFreeSlot()`
- **`CalendarGrid`** — Month/week/day grid generation with navigation (`next()`, `prev()`, `goTo()`)
- **`TimelineGrid`** — Hourly timeline with event positioning and overlap detection
- **`YearGrid`** — Lightweight year-level view with per-day range counts

### Functions

- **`scoreSchedule()`** — Schedule quality metrics
- **`resolveDisplayType()`** — Auto-resolve display hints based on range type and view fidelity
- **`fromDateRange()`** / **`expandToEvents()`** — Convert ranges to normalized `CalendarEvent[]`
- **`computeEventPositions()`** — Standalone overlap detection for timeline views

## License

MIT
