# @daywatch/cal-react

Headless React hooks for calendar state management. Built on [@daywatch/cal](https://www.npmjs.com/package/@daywatch/cal) and [@daywatch/cal-models](https://www.npmjs.com/package/@daywatch/cal-models).

All hooks return data structures — no DOM, no components, no CSS. You bring the rendering.

## Install

```
npm install @daywatch/cal-react @daywatch/cal
```

React 18+ is a peer dependency.

If you want framework-neutral derived helpers without React hooks, use `@daywatch/cal-models` directly.

## Hooks

### `useCalendar`

Calendar grid with navigation. The primary hook for month/week views.

```typescript
import { useState } from 'react';
import { useCalendar } from '@daywatch/cal-react';

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
import { useCalendarEvents } from '@daywatch/cal-react';

const events = useCalendarEvents({
  ranges: myRanges,
  importedEvents: icsEvents,  // from @daywatch/ical
  from: windowStart,
  to: windowEnd,
  userTimezone: 'America/New_York',
});
```

### `useTimeline`

Timeline data for day views with positioned events and overlap detection.

```typescript
import { useTimeline } from '@daywatch/cal-react';

const { slots } = useTimeline({
  date: '2026-03-23',
  events: dayEvents,
  startHour: 8,
  endHour: 18,
  intervalMinutes: 30,
});

// slots[0].events[0] → { event, top, height, column, totalColumns }
```

### `useDateSelection`

Controlled date-range selection hook for click + hover interactions.

```typescript
import { useState } from 'react';
import { useDateSelection } from '@daywatch/cal-react';
import type { DateSelection } from '@daywatch/cal-models';

const [selection, setSelection] = useState<DateSelection>({
  start: null,
  end: null,
  preview: null,
});

const { selection: currentSelection, onDateClick, onDateHover, clear } = useDateSelection({
  selection,
  onSelectionChange: setSelection,
  allowSameDay: true,
});
```

`useDateSelection` is controlled: you own the `DateSelection` state and pass updates back through `onSelectionChange`. See [examples/react/](../../examples/react/) for complete, copy-paste-ready component implementations.

### `useTimeSelection`

Controlled time-block selection hook for timeline or slot-list UIs.

```typescript
import { useState } from 'react';
import { useTimeSelection } from '@daywatch/cal-react';
import type { TimeSelection } from '@daywatch/cal-models';

const [selection, setSelection] = useState<TimeSelection>({
  date: '2026-03-23',
  startTime: null,
  endTime: null,
  preview: null,
});

const { selection: currentSelection, onTimeClick, onTimeHover, clear } = useTimeSelection({
  selection,
  onSelectionChange: setSelection,
  date: '2026-03-23',
  intervalMinutes: 30,
  minDuration: 30,
  dayStart: '08:00',
  dayEnd: '18:00',
});
```

Like `useDateSelection`, this hook is controlled and keeps the reducer logic in `@daywatch/cal-models`. See [examples/react/](../../examples/react/) for complete, copy-paste-ready component implementations.

### `useSpans`

Span-level overlap detection with lane assignment for consistent multi-day bar rendering.

```typescript
import { useSpans } from '@daywatch/cal-react';

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
import { useDayDetail } from '@daywatch/cal-react';

const { timeSlots, allDayRanges } = useDayDetail(
  '2026-03-23',
  myRanges,
  'America/New_York',
);
```

### `useRangeCheck`

Range evaluation — check which ranges a datetime falls within.

```typescript
import { useRangeCheck } from '@daywatch/cal-react';

const { isInRange, getOccurrences } = useRangeCheck(myRanges, 'America/New_York');

const matchingRanges = isInRange(new Date());
const occurrences = getOccurrences(from, to);
```

### `useConflicts`

Find scheduling conflicts across a date window.

```typescript
import { useConflicts } from '@daywatch/cal-react';

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
import { useFreeSlots } from '@daywatch/cal-react';

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
import { useScheduleScore } from '@daywatch/cal-react';

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
- **Layered internals** — low-level computation lives in `@daywatch/cal`, while all derived helper logic now lives in `@daywatch/cal-models`. These hooks stay thin.

## License

MIT
