# @neo-reckoning/models

Framework-neutral derived models and controller helpers built on top of [@neo-reckoning/core](https://www.npmjs.com/package/@neo-reckoning/core).

This package is intended for:

- adapter packages like `@neo-reckoning/react`
- advanced consumers who want ergonomic pure functions without committing to a UI framework adapter

## Install

```
npm install @neo-reckoning/models @neo-reckoning/core
```

## What it provides

- Calendar model builders and navigation helpers
- Event normalization helpers
- Range evaluation helpers
- Timeline/day-detail derived models
- Conflict, free-slot, span, schedule-score, and year-grid derived models

## Example

```typescript
import { buildCalendarModel, createCalendarController } from '@neo-reckoning/models';

const model = buildCalendarModel({
  focusDate: '2026-03-15',
  numberOfMonths: 1,
  ranges: myRanges,
  fidelity: 'month',
});

const controller = createCalendarController({
  focusDate: model.focusDate,
});
```

## Date Selection

`updateDateSelection(selection, action, config)` is a pure reducer for controlled date-range selection. It works with the `DateSelection`, `DateSelectionAction`, and `DateSelectionConfig` types exported by this package.

```typescript
import { updateDateSelection } from '@neo-reckoning/models';
import type { DateSelection } from '@neo-reckoning/models';

let selection: DateSelection = {
  start: null,
  end: null,
  preview: null,
};

selection = updateDateSelection(selection, {
  type: 'click',
  date: '2026-04-10',
});

selection = updateDateSelection(selection, {
  type: 'hover',
  date: '2026-04-12',
});

selection = updateDateSelection(selection, {
  type: 'click',
  date: '2026-04-12',
});
```

The first click sets `start`, hover updates `preview`, and the second click completes the range by setting `end`. Because it is a pure reducer, it composes cleanly with React, Preact, Solid, or any other state container.

`createIsDateBlocked(ranges, options)` builds a predicate that returns `true` when a date falls inside one of the supplied `DateRange` values.

```typescript
import {
  createIsDateBlocked,
  updateDateSelection,
} from '@neo-reckoning/models';

const isDateBlocked = createIsDateBlocked(existingRanges, {
  userTimezone: 'America/New_York',
});

const next = updateDateSelection(selection, {
  type: 'click',
  date: '2026-04-14',
}, {
  isDateSelectable: date => !isDateBlocked(date),
});
```

`selectionToDateRange(selection, template)` converts a completed selection into a `DateRange`.

```typescript
import { selectionToDateRange } from '@neo-reckoning/models';

const range = selectionToDateRange(selection, {
  label: 'Vacation',
});
```

If `start` or `end` is missing, it returns `null`.

## Time Selection

`updateTimeSelection(selection, action, config)` is the time-slot equivalent. It works with the `TimeSelection`, `TimeSelectionAction`, and `TimeSelectionConfig` types and snaps incoming times to the configured interval before applying reducer logic.

```typescript
import { updateTimeSelection } from '@neo-reckoning/models';
import type { TimeSelection } from '@neo-reckoning/models';

let selection: TimeSelection = {
  date: '2026-04-10',
  startTime: null,
  endTime: null,
  preview: null,
};

selection = updateTimeSelection(selection, {
  type: 'click',
  time: '09:10',
}, {
  intervalMinutes: 30,
  minDuration: 30,
  dayStart: '08:00',
  dayEnd: '18:00',
});

selection = updateTimeSelection(selection, {
  type: 'hover',
  time: '10:05',
}, {
  intervalMinutes: 30,
});

selection = updateTimeSelection(selection, {
  type: 'click',
  time: '10:05',
}, {
  intervalMinutes: 30,
});
```

`snapToInterval(time, intervalMinutes)` is available separately when you want the same snapping behavior outside the reducer.

```typescript
import { snapToInterval } from '@neo-reckoning/models';

snapToInterval('09:10', 30);
// => '09:00'
```

## Composition

Date and time selection are designed to compose. A date picker can own `DateSelection`, a time picker can own `TimeSelection`, and once both are complete you can call `selectionToDateRange()` with time fields in the template to produce the final `DateRange`.
