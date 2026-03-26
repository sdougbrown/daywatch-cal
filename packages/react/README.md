# @neo-reckoning/react

Headless React hooks for calendar state management. Built on [@neo-reckoning/core](https://www.npmjs.com/package/@neo-reckoning/core) and [@neo-reckoning/models](https://www.npmjs.com/package/@neo-reckoning/models).

All hooks return data structures — no DOM, no components, no CSS. You bring the rendering.

## Install

```
npm install @neo-reckoning/react @neo-reckoning/core
```

React 18+ is a peer dependency.

If you want framework-neutral derived helpers without React hooks, use `@neo-reckoning/models` directly.

## Hooks

### `useCalendar`

Calendar grid with navigation. The primary hook for month/week views.

```typescript
import { useState } from 'react';
import { useCalendar } from '@neo-reckoning/react';

const [focusDate, setFocusDate] = useState('2026-03-15');

const { months, next, prev, goTo, focusDate } = useCalendar({
  focusDate,
  onFocusDateChange: setFocusDate,
  numberOfMonths: 1,
  ranges: myRanges,
  fidelity: 'month',      // 'year' | 'month' | 'week' | 'day'
  weekStartsOn: 1,        // Monday
  userTimezone: 'America/New_York',
});

// months[0].weeks[0].days[0].ranges → DayRangeInfo[]
```

`useCalendar` is controlled: the caller owns `focusDate`, and `next`, `prev`, and `goTo` report changes through `onFocusDateChange`.

### `useCalendarEvents`

Merges native DateRanges and imported calendar events into a single sorted `CalendarEvent[]`.

```typescript
import { useCalendarEvents } from '@neo-reckoning/react';

const events = useCalendarEvents({
  ranges: myRanges,
  importedEvents: icsEvents,  // from @neo-reckoning/ical
  from: windowStart,
  to: windowEnd,
  userTimezone: 'America/New_York',
});
```

### `useTimeline`

Timeline data for day views with positioned events and overlap detection.

```typescript
import { useTimeline } from '@neo-reckoning/react';

const { slots } = useTimeline({
  date: '2026-03-23',
  events: dayEvents,
  startHour: 8,
  endHour: 18,
  intervalMinutes: 30,
});

// slots[0].events[0] → { event, top, height, column, totalColumns }
```

### `useSpans`

Span-level overlap detection with lane assignment for consistent multi-day bar rendering.

```typescript
import { useSpans } from '@neo-reckoning/react';

const spans = useSpans({
  ranges: myRanges,
  from: windowStart,
  to: windowEnd,
});

// spans[0] → { rangeId, startDate, endDate, lane, totalLanes, maxOverlap }
```

### `useDayDetail`

Time slots and all-day range info for a specific day.

```typescript
import { useDayDetail } from '@neo-reckoning/react';

const { timeSlots, allDayRanges } = useDayDetail(
  '2026-03-23',
  myRanges,
  'America/New_York',
);
```

### `useRangeCheck`

Range evaluation — check which ranges a datetime falls within.

```typescript
import { useRangeCheck } from '@neo-reckoning/react';

const { isInRange, getOccurrences } = useRangeCheck(myRanges, 'America/New_York');

const matchingRanges = isInRange(new Date());
const occurrences = getOccurrences(from, to);
```

### `useConflicts`

Find scheduling conflicts across a date window.

```typescript
import { useConflicts } from '@neo-reckoning/react';

const conflicts = useConflicts({
  ranges: myRanges,
  from: windowStart,
  to: windowEnd,
});

// conflicts[0] → { rangeA, rangeB, date, overlapStart, overlapEnd }
```

### `useFreeSlots`

Find available time on a given day.

```typescript
import { useFreeSlots } from '@neo-reckoning/react';

const freeSlots = useFreeSlots({
  ranges: myRanges,
  date: '2026-03-23',
  minDuration: 30,
  dayStart: '09:00',
  dayEnd: '17:00',
});

// freeSlots[0] → { date, startTime, endTime, duration }
```

### `useScheduleScore`

Schedule quality metrics for evaluating arrangements.

```typescript
import { useScheduleScore } from '@neo-reckoning/react';

const score = useScheduleScore({
  ranges: myRanges,
  from: windowStart,
  to: windowEnd,
  focusBlockMinutes: 60,
  dayStart: '09:00',
  dayEnd: '17:00',
});

// score → { conflicts, freeMinutes, focusBlocks, avgContextSwitches, conflictDays }
```

## Design philosophy

- **Headless** — returns data, not DOM. Works with any component library or React Native.
- **No styling** — range IDs, not colors. Your app maps IDs to palettes.
- **Memoized** — all hooks use `useMemo` for efficient re-renders.
- **Layered internals** — low-level computation lives in `@neo-reckoning/core`, while all derived helper logic now lives in `@neo-reckoning/models`. These hooks stay thin.

## License

MIT
