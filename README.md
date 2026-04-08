# daywatch-cal

Headless calendar state management for modern web and mobile apps. A spiritual successor to [reckoning](https://github.com/sdougbrown/reckoning), rebuilt in TypeScript with sub-day time support, timezone handling, and scheduling intelligence.

## Packages

| Package | Description | npm |
|---|---|---|
| [`@daywatch/cal`](packages/core) | Zero-dependency computation library. DateRange evaluation, calendar grids, timeline positioning, conflict detection, free slot finding, schedule scoring. | [![npm](https://img.shields.io/npm/v/@daywatch/cal)](https://www.npmjs.com/package/@daywatch/cal) |
| [`@daywatch/cal-models`](packages/models) | Framework-neutral derived models and controller helpers built on top of core. Intended for advanced consumers and adapter packages. | [![npm](https://img.shields.io/npm/v/@daywatch/cal-models)](https://www.npmjs.com/package/@daywatch/cal-models) |
| [`@daywatch/cal-react`](packages/react) | Headless React hooks. 12 hooks wrapping core, plus controlled selection helpers. No DOM, no CSS. | [![npm](https://img.shields.io/npm/v/@daywatch/cal-react)](https://www.npmjs.com/package/@daywatch/cal-react) |
| [`@daywatch/cal-preact`](packages/preact) | Headless Preact hooks with the same shape as the React adapter, backed by `@daywatch/cal-models`. | [![npm](https://img.shields.io/npm/v/@daywatch/cal-preact)](https://www.npmjs.com/package/@daywatch/cal-preact) |
| [`@daywatch/cal-solid`](packages/solid) | Solid `create*` primitives backed by `@daywatch/cal-models`, exposing reactive accessors instead of hooks. | [![npm](https://img.shields.io/npm/v/@daywatch/cal-solid)](https://www.npmjs.com/package/@daywatch/cal-solid) |
| [`@daywatch/cal-ical`](packages/ical) | Browser-compatible .ics parsing adapter. Planned — types stubbed. | [![npm](https://img.shields.io/npm/v/@daywatch/cal-ical)](https://www.npmjs.com/package/@daywatch/cal-ical) |
| [`examples/`](examples/) | Copy-paste-ready example components for React, Preact, and Solid. Includes an interactive sandbox. | n/a |

## What this is

daywatch-cal is a **computation library**, not a UI library. It answers questions like:

- Does this date/time fall within a range?
- What does a month grid look like with these ranges applied?
- Where are the conflicts in this schedule?
- Where can I fit a 30-minute meeting this week?
- How fragmented is this schedule? How many focus blocks are there?

Your app — whether React, React Native, Vue, or vanilla JS — provides the rendering. daywatch-cal provides the data.

## Key features

- **DateRange model** with day-level recurrence (everyWeekday, everyDate, everyMonth) and sub-day recurrence (everyHour or startTime/repeatEvery)
- **Timezone-aware** — UTC ranges converted to local time via `Intl.DateTimeFormat`, floating times pass through unchanged
- **View fidelity** — compute only what you need: year view skips time slots, month view skips them too, week/day compute everything
- **Span detection** with lane assignment for consistent multi-day bar rendering
- **Conflict detection** and **free slot finding** for scheduling intelligence
- **Schedule scoring** — conflicts, free time, focus blocks, context switches
- **No styling opinions** — outputs range IDs, not colors. Your palette system handles theming.
- **Comprehensive test coverage** across recurrence edge cases, DST transitions, timezone conversion, and overlap detection

## Quick start

```
npm install @daywatch/cal @daywatch/cal-react
```

Advanced consumers who want framework-neutral derived helpers can install `@daywatch/cal-models` directly.

```typescript
import { useState } from 'react';
import { useCalendar, useConflicts, useFreeSlots } from '@daywatch/cal-react';

const [focusDate, setFocusDate] = useState('2026-03-15');

// Build a month grid
const { months, next, prev } = useCalendar({
  focusDate,
  onFocusDateChange: setFocusDate,
  numberOfMonths: 1,
  ranges: myRanges,
  fidelity: 'month',
});

// Find conflicts
const conflicts = useConflicts({ ranges: myRanges, from, to });

// Find free time
const freeSlots = useFreeSlots({
  ranges: myRanges,
  date: '2026-03-23',
  minDuration: 30,
  dayStart: '09:00',
  dayEnd: '17:00',
});
```

For complete picker implementations, see the [examples](examples/) directory. Run the interactive sandbox with `yarn workspace daywatch-cal-sandbox dev`.

See individual package READMEs for full API documentation.

## Monorepo

Built with Yarn workspaces and Turborepo.

```bash
yarn install          # install all dependencies
yarn turbo run build  # build all packages
yarn turbo run test   # run the package test suite
```

## License

MIT
