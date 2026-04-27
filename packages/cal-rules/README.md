# @daywatch/cal-rules

Validation for `DateRange` inputs before they reach [@daywatch/cal](https://www.npmjs.com/package/@daywatch/cal). Checks required fields, mutual exclusivity, dependency chains, format rules, and logical fairness — then returns a sanitized candidate with any issues.

This package is intended for:

- form validation in range editors and schedulers
- API input guards that reject malformed ranges early
- batch import pipelines that need per-item error reporting

## Install

```
npm install @daywatch/cal-rules @daywatch/cal
```

## Quick usage

### Validate a new range

```typescript
import { validateRangeCreate } from '@daywatch/cal-rules';

const result = validateRangeCreate({
  id: 'vacation-1',
  label: 'Vacation',
  fromDate: '2026-04-10',
  toDate: '2026-04-08',   // before fromDate → foul
  startTime: '09:00',
});

if (result.ok) {
  // result.candidate is a Partial<DateRange> with only known keys
  saveRange(result.candidate);
} else {
  // result.issues[0].code → 'foul'
  // result.issues[0].field → 'toDate'
  // result.issues[0].message → 'toDate must be on or after fromDate'
  showErrors(result.issues);
}
```

### Validate a patch against an existing range

```typescript
import { validateRangePatch } from '@daywatch/cal-rules';

const result = validateRangePatch(
  { id: '1', label: 'Meeting', everyHour: [9, 10, 11] },
  { startTime: '09:00' },  // startTime is mutually exclusive with everyHour
);

// result.ok → false
// result.issues → [{ code: 'disabled', field: 'startTime', message: 'startTime is mutually exclusive with everyHour' }]
```

`validateRangePatch` merges the existing range with the patch, then validates the merged result. The `candidate` in the result reflects that merged state.

### Batch validate an array

```typescript
import { validateRanges } from '@daywatch/cal-rules';

const results = validateRanges([
  { id: '1', label: 'OK', fromDate: '2026-04-10', toDate: '2026-04-12' },
  { label: 'Missing id' },
  'not an object',
]);

// results[0].ok → true
// results[1].ok → false  (issues: required field 'id')
// results[2].ok → false  (issues: invalid — candidate must be a non-null object)

// Each result includes its index:
// results[0].index → 0
// results[1].index → 1
// results[2].index → 2
```

If the top-level input is not an array, a single result with `index: -1` is returned.

## Strict vs lenient mode

By default, validation runs in **lenient** mode. Unknown keys (anything not in the `DateRange` schema) are silently stripped from the candidate and no issue is reported.

In **strict** mode, unknown keys produce an `unknown_key` issue:

```typescript
const result = validateRangeCreate(
  { id: '1', label: 'Test', colour: 'red' },
  { mode: 'strict' },
);

// result.ok → false
// result.issues → [{ code: 'unknown_key', field: '$', message: 'Unknown key "colour"' }]
```

The sanitized candidate never contains unknown keys, regardless of mode.

## Result shape

Every validation function returns a discriminated union:

```typescript
// Success
{
  ok: true;
  candidate: SanitizedRangeCandidate;  // Partial<DateRange> — only known keys from the input
  issues: [];
}

// Failure
{
  ok: false;
  candidate: SanitizedRangeCandidate;
  issues: [RangeValidationIssue, ...RangeValidationIssue[]];  // always at least one
}
```

The `candidate` is always present, even on failure. It contains only the keys that belong to the `DateRange` schema — anything else is stripped. This lets you read back the sanitized input regardless of the outcome.

## Issue codes

| Code | Meaning |
|---|---|
| `required` | A field is required but missing or empty |
| `disabled` | A field is present but mutually exclusive with another enabled field |
| `foul` | A field is present and enabled, but fails a logical rule (e.g. `toDate` before `fromDate`) |
| `invalid` | A field fails its format validator (bad date string, bad time format, etc.) |
| `unknown_key` | Strict mode only — a key not in the `DateRange` schema |

Each issue carries `field` (the `DateRange` key, or `'$'` for whole-input problems) and a `message` explaining what went wrong.

## Internal note

This package uses `@umpire/core` internally to declare its ruleset (required fields, dependencies, mutual exclusivity, fairness, and per-field validators). Umpire is an implementation detail — you do not need to install or understand it to use this package.

## License

MIT
