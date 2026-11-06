# @daywatch/cal-rules

## 0.2.0

### Minor Changes

- Version bump across all published packages

### Patch Changes

- 83838a8: Conflict detection is now free/busy-aware. Ranges, occurrences and conflict participants carry an optional `transparency` signal (`'opaque'` | `'transparent'`, absent = busy): busy all-day spans occupy the full day and conflict with anything on that day, transparent ranges never occupy time or conflict, and emitted `Conflict` participants carry `allDay`/`transparency`/`eventType` metadata so callers can grade severity. The gcal and msft adapters now load transparent/free events with the flag carried through instead of dropping them (`includeTransparent`/`includeFree` are deprecated no-ops), the ics parser sets `transparency: 'transparent'` from `TRANSP:TRANSPARENT`, and cal-rules admits `transparency` as a known range key.
- Updated dependencies [83838a8]
- Updated dependencies [832c856]
- Updated dependencies
  - @daywatch/cal@0.3.0

## 0.1.4

### Patch Changes

- Republish. `0.1.2` and `0.1.3` were versioned in git but never reached npm: `@daywatch/cal-rules` was missing from the `Publish` workflow's package detection and publish steps, so the workflow could never publish it. This release carries both.

## 0.1.3

### Patch Changes

- d88fdcb: `addMinutes("23:00", 120)` previously returned `null`, silently dropping end times that crossed midnight. Downstream, `endTime` became `null`, causing broken conflict detection, free-slot finding, and scoring.

## 0.1.2

### Patch Changes

- b431c42: adjusted eslint-plugin dependency no user-facing changes
- Updated dependencies [a459f4b]
  - @daywatch/cal@0.2.0

## 0.1.1

### Initial release

- Added DateRange validation for create, patch, and batch ingestion flows.
- Enforced required fields, mutual exclusivity, dependency chains, format checks, and sanitized validation output.
