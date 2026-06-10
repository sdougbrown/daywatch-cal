# @daywatch/cal-rules

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
