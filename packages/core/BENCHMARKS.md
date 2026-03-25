# Core Performance Benchmarks

This file tracks benchmark and validation results for performance work in `@neo-reckoning/core`.

## Environment

- Date recorded: 2026-03-25
- Workspace: `packages/core`
- Node: `v20.20.1`
- Yarn: `4.13.0`

## Commands

- Build + benchmark: `yarn workspace @neo-reckoning/core bench`
- Direct benchmark rerun: `node ./scripts/benchmark.mjs`
- Core tests: `NODE_OPTIONS='--experimental-vm-modules' ../../node_modules/.bin/jest --watchman=false`

## Before

### Validation

- Core test suites: `13 passed`
- Core tests: `176 passed`

### Benchmark Results

| Benchmark | Iterations | Total ms | Avg ms | Ops/sec | Checksum |
| --- | ---: | ---: | ---: | ---: | ---: |
| `isDateInRange/year-window` | 5 | 133.09 | 26.618 | 37.57 | 5442 |
| `getTimeSlots/timezone-window` | 10 | 700.05 | 70.005 | 14.28 | 5852 |
| `calendarGrid/day-fidelity` | 20 | 1052.15 | 52.607 | 19.01 | 4704 |
| `yearGrid/full-year` | 10 | 263.64 | 26.364 | 37.93 | 1848 |
| `findConflictsInWindow/30-days` | 15 | 385.11 | 25.674 | 38.95 | 1920 |
| `findFreeSlots/30-days` | 10 | 225.60 | 22.560 | 44.33 | 110 |
| `scoreSchedule/30-days` | 10 | 267.58 | 26.758 | 37.37 | 70070 |

### Notes

- Benchmarks were run twice; the values above are from the latest rerun and were close to the first pass.
- Jest required `--watchman=false` in this sandbox because Watchman fails on restricted filesystem access here.

## After Step 3

### Change

- Compiled per-range lookup metadata in `RangeEvaluator` for date checks.
- Replaced repeated linear membership checks with cached `Set` and lookup-table access for explicit dates, exclusions, weekdays, dates, and months.
- Preserved existing public behavior and reran the unchanged core suite.

### Validation

- Core test suites: `13 passed`
- Core tests: `176 passed`

### Benchmark Results

| Benchmark | Iterations | Total ms | Avg ms | Ops/sec | Checksum |
| --- | ---: | ---: | ---: | ---: | ---: |
| `isDateInRange/year-window` | 5 | 114.10 | 22.820 | 43.82 | 5442 |
| `getTimeSlots/timezone-window` | 10 | 702.52 | 70.252 | 14.23 | 5852 |
| `calendarGrid/day-fidelity` | 20 | 957.26 | 47.863 | 20.89 | 4704 |
| `yearGrid/full-year` | 10 | 233.79 | 23.379 | 42.77 | 1848 |
| `findConflictsInWindow/30-days` | 15 | 336.93 | 22.462 | 44.52 | 1920 |
| `findFreeSlots/30-days` | 10 | 248.44 | 24.844 | 40.25 | 110 |
| `scoreSchedule/30-days` | 10 | 266.55 | 26.655 | 37.52 | 70070 |

### Notes

- `isDateInRange/year-window`, `calendarGrid/day-fidelity`, `yearGrid/full-year`, and `findConflictsInWindow/30-days` all improved materially.
- `getTimeSlots/timezone-window` was essentially flat, which is expected because this step did not change timezone conversion logic.
- `findFreeSlots/30-days` regressed slightly in both post-change runs. Since this step only targeted day-level membership checks, that suggests measurement noise or a small secondary cost from the added metadata lookup. I have not optimized that path yet.

## After Step 5

### Change

- Reworked `getCandidateDays()` to generate recurrence candidates directly instead of scanning every day in the window for common recurrence shapes.
- Added specialized generation paths for:
  - `everyDate`-driven recurrence
  - `everyWeekday`-driven recurrence
  - `everyMonth`-only recurrence
  - no-recurrence windows with direct exclusion filtering
- Added targeted coverage for month-only expansion, weekday+month expansion, and leap-year `everyDate + everyWeekday` expansion.

### Validation

- Core test suites: `13 passed`
- Core tests: `179 passed`

### Benchmark Results

| Benchmark | Iterations | Total ms | Avg ms | Ops/sec | Checksum |
| --- | ---: | ---: | ---: | ---: | ---: |
| `isDateInRange/year-window` | 5 | 113.77 | 22.753 | 43.95 | 5442 |
| `getTimeSlots/timezone-window` | 10 | 691.82 | 69.182 | 14.45 | 5852 |
| `calendarGrid/day-fidelity` | 20 | 936.23 | 46.812 | 21.36 | 4704 |
| `yearGrid/full-year` | 10 | 238.63 | 23.863 | 41.91 | 1848 |
| `findConflictsInWindow/30-days` | 15 | 330.12 | 22.008 | 45.44 | 1920 |
| `findFreeSlots/30-days` | 10 | 240.56 | 24.056 | 41.57 | 110 |
| `scoreSchedule/30-days` | 10 | 267.99 | 26.799 | 37.32 | 70070 |

### Notes

- Relative to the original baseline, the biggest sustained wins so far remain in `isDateInRange/year-window`, `calendarGrid/day-fidelity`, and `findConflictsInWindow/30-days`.
- This step’s improvements over step 3 were incremental rather than dramatic, which matches the current benchmark mix: the large remaining costs are still grid repetition and timezone-heavy time-slot expansion.
- `scoreSchedule/30-days` remained roughly flat, which makes sense because it still spends most of its time expanding and parsing timed slots rather than generating candidate day sets.

## After Step 7

### Change

- Added `RangeEvaluator.getMatchingDates()` so grid builders can reuse the evaluator’s candidate-day generation directly.
- Refactored `CalendarGrid` to build a shared day-context map for the displayed window and reuse it for:
  - `hasActivity`
  - `ranges[]`
  - contiguous span boundary checks
  - timed slot expansion on matched days only
- Refactored `YearGrid` to invert the evaluation flow and build per-date activity from each range’s matching days instead of checking every range against every day.
- Added a focused `YearGrid` regression test for timed multi-slot ranges to ensure each range is counted once per day.

### Validation

- Core test suites: `13 passed`
- Core tests: `180 passed`

### Benchmark Results

| Benchmark | Iterations | Total ms | Avg ms | Ops/sec | Checksum |
| --- | ---: | ---: | ---: | ---: | ---: |
| `isDateInRange/year-window` | 5 | 117.66 | 23.532 | 42.50 | 5442 |
| `getTimeSlots/timezone-window` | 10 | 704.00 | 70.400 | 14.20 | 5852 |
| `calendarGrid/day-fidelity` | 20 | 68.79 | 3.440 | 290.74 | 4704 |
| `yearGrid/full-year` | 10 | 15.82 | 1.582 | 632.09 | 1848 |
| `findConflictsInWindow/30-days` | 15 | 341.95 | 22.796 | 43.87 | 1920 |
| `findFreeSlots/30-days` | 10 | 268.02 | 26.802 | 37.31 | 110 |
| `scoreSchedule/30-days` | 10 | 248.01 | 24.801 | 40.32 | 70070 |

### Notes

- This step delivered the largest improvements so far:
  - `calendarGrid/day-fidelity`: `46.812 ms` -> `3.440 ms` from step 5
  - `yearGrid/full-year`: `23.863 ms` -> `1.582 ms` from step 5
- Those gains are stable across repeated runs and match the intended change: removing repeated day/range evaluation from grid generation.
- The non-grid benchmarks were mostly flat. `findFreeSlots/30-days` remained slower than the original baseline, which points to time-slot expansion as the next area to address rather than more day-level work.

## After Step 9

### Change

- Optimized fixed-format parsing/formatting in `time.ts`:
  - manual parsing for `HH:mm` and `YYYY-MM-DD`
  - cached two-digit formatting
- Replaced repeated `Intl.DateTimeFormat` construction with cached formatters.
- Replaced locale-string round trips in timezone offset calculation with cached `formatToParts`-based extraction.
- Added memoization for zoned date-time parts, timezone offsets, and `convertTime()` results.
- Added direct regression coverage for:
  - UTC conversion
  - spring-forward DST gap handling
  - timezone-specific date formatting
  - timezone-specific clock-time reads

### Validation

- Core test suites: `13 passed`
- Core tests: `185 passed`

### Benchmark Results

| Benchmark | Iterations | Total ms | Avg ms | Ops/sec | Checksum |
| --- | ---: | ---: | ---: | ---: | ---: |
| `isDateInRange/year-window` | 5 | 63.45 | 12.691 | 78.80 | 5442 |
| `getTimeSlots/timezone-window` | 10 | 10.99 | 1.099 | 910.16 | 5852 |
| `calendarGrid/day-fidelity` | 20 | 42.55 | 2.128 | 470.01 | 4704 |
| `yearGrid/full-year` | 10 | 15.85 | 1.585 | 630.84 | 1848 |
| `findConflictsInWindow/30-days` | 15 | 5.78 | 0.385 | 2595.27 | 1920 |
| `findFreeSlots/30-days` | 10 | 3.06 | 0.306 | 3262.95 | 110 |
| `scoreSchedule/30-days` | 10 | 3.58 | 0.358 | 2793.30 | 70070 |

### Notes

- This was the biggest non-grid shift of the project.
- The benchmark harness repeats identical workloads within a single process, so the new memoization layers amplify the gain there. That is still meaningful for repeated calendar rendering and schedule calculations within a session, but it is worth interpreting as warm-cache performance rather than cold-start cost.
- `getTimeSlots/timezone-window` moved from `70.400 ms` in step 7 to `1.099 ms`.
- The downstream timed paths (`findConflictsInWindow`, `findFreeSlots`, `scoreSchedule`) all benefited heavily as a result.

## Final

### Change

- Consolidated day-level timed expansion by adding a shared timed-entry path in `RangeEvaluator`.
- Updated conflict detection, free-slot finding, and schedule scoring to consume the shared timed entries instead of rebuilding slot/minute state independently.
- Kept the final validation pass on the full core suite and TypeScript build.

### Validation

- Core test suites: `13 passed`
- Core tests: `185 passed`
- TypeScript build: passed

### Benchmark Results

| Benchmark | Iterations | Total ms | Avg ms | Ops/sec | Checksum |
| --- | ---: | ---: | ---: | ---: | ---: |
| `isDateInRange/year-window` | 5 | 63.26 | 12.653 | 79.03 | 5442 |
| `getTimeSlots/timezone-window` | 10 | 11.39 | 1.139 | 877.91 | 5852 |
| `calendarGrid/day-fidelity` | 20 | 44.33 | 2.217 | 451.15 | 4704 |
| `yearGrid/full-year` | 10 | 15.32 | 1.532 | 652.67 | 1848 |
| `findConflictsInWindow/30-days` | 15 | 5.93 | 0.395 | 2529.08 | 1920 |
| `findFreeSlots/30-days` | 10 | 3.39 | 0.339 | 2949.35 | 110 |
| `scoreSchedule/30-days` | 10 | 2.40 | 0.240 | 4158.51 | 70070 |

### End-State Notes

- Relative to the original baseline:
  - `calendarGrid/day-fidelity`: `52.607 ms` -> `2.217 ms`
  - `yearGrid/full-year`: `26.364 ms` -> `1.532 ms`
  - `getTimeSlots/timezone-window`: `70.005 ms` -> `1.139 ms`
  - `findConflictsInWindow/30-days`: `25.674 ms` -> `0.395 ms`
  - `findFreeSlots/30-days`: `22.560 ms` -> `0.339 ms`
  - `scoreSchedule/30-days`: `26.758 ms` -> `0.240 ms`
- The strongest gains come from:
  - removing repeated day/range evaluation in the grids
  - caching timezone conversion work
  - reusing timed day entries across downstream schedule analysis
- These final benchmark numbers reflect repeated in-process workloads, so they should be read as warm-cache performance rather than cold-start latency.
