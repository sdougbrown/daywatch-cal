import type { DateRange } from '@daywatch/cal';

import { RANGE_KEYS, rangeInputUmp } from './ruleset.js';
import type {
  IndexedRangeValidationResult,
  RangeValidationIssue,
  RangeValidationMode,
  RangeValidationOptions,
  RangeValidationResult,
  SanitizedRangeCandidate,
} from './types.js';

const RANGE_KEYS_SET = new Set<string>(RANGE_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assignCandidateValue<K extends keyof DateRange>(
  candidate: SanitizedRangeCandidate,
  key: K,
  value: unknown,
): void {
  candidate[key] = value as DateRange[K];
}

function sanitizeCandidate(record: Record<string, unknown>): SanitizedRangeCandidate {
  const sanitized: SanitizedRangeCandidate = {};

  for (const key of RANGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      assignCandidateValue(sanitized, key, record[key]);
    }
  }

  return sanitized;
}

function invalidInputIssue(label: string): RangeValidationIssue {
  return {
    field: '$',
    code: 'invalid',
    message: `${label} must be a non-null object`,
  };
}

function toRequiredDisabledFoulInvalidIssues(
  candidate: SanitizedRangeCandidate,
): RangeValidationIssue[] {
  const availability = rangeInputUmp.check(candidate);
  const issues: RangeValidationIssue[] = [];

  for (const field of RANGE_KEYS) {
    const status = availability[field];

    if (status.enabled && status.required && !status.satisfied) {
      issues.push({
        field,
        code: 'required',
        message: status.reason ?? `${field} is required`,
      });
      continue;
    }

    if (status.satisfied && !status.enabled) {
      issues.push({
        field,
        code: 'disabled',
        message: status.reason ?? `${field} is disabled`,
      });
      continue;
    }

    if (status.satisfied && status.enabled && !status.fair) {
      issues.push({
        field,
        code: 'foul',
        message: status.reason ?? `${field} is foul`,
      });
      continue;
    }

    if (status.satisfied && status.enabled && status.valid === false) {
      issues.push({
        field,
        code: 'invalid',
        message: status.error ?? `${field} is invalid`,
      });
    }
  }

  return issues;
}

function toUnknownKeyIssues(
  candidate: Record<string, unknown>,
  mode: RangeValidationMode,
): RangeValidationIssue[] {
  if (mode !== 'strict') {
    return [];
  }

  return Object.keys(candidate)
    .filter((key) => !RANGE_KEYS_SET.has(key))
    .map((key) => ({
      field: '$' as const,
      code: 'unknown_key',
      message: `Unknown key "${key}"`,
    }));
}

function optionsToMode(options: RangeValidationOptions): RangeValidationMode {
  return options.mode ?? 'lenient';
}

function toResult(
  candidate: SanitizedRangeCandidate,
  issues: RangeValidationIssue[],
): RangeValidationResult {
  if (issues.length === 0) {
    return {
      ok: true,
      candidate,
      issues: [],
    };
  }

  return {
    ok: false,
    candidate,
    issues: [issues[0], ...issues.slice(1)],
  };
}

export function validateRangeCreate(
  candidate: unknown,
  options: RangeValidationOptions = {},
): RangeValidationResult {
  const mode = optionsToMode(options);

  if (!isPlainObject(candidate)) {
    return toResult({}, [invalidInputIssue('candidate')]);
  }

  const sanitizedCandidate = sanitizeCandidate(candidate);

  return toResult(sanitizedCandidate, [
    ...toRequiredDisabledFoulInvalidIssues(sanitizedCandidate),
    ...toUnknownKeyIssues(candidate, mode),
  ]);
}

export function validateRangePatch(
  existing: unknown,
  patch: unknown,
  options: RangeValidationOptions = {},
): RangeValidationResult {
  const mode = optionsToMode(options);
  const issues: RangeValidationIssue[] = [];

  if (!isPlainObject(existing)) {
    issues.push(invalidInputIssue('existing'));
  }

  if (!isPlainObject(patch)) {
    issues.push(invalidInputIssue('patch'));
  }

  if (issues.length > 0) {
    return toResult({}, issues);
  }

  const safeExisting = existing as Record<string, unknown>;
  const safePatch = patch as Record<string, unknown>;
  const rawMerged = { ...safeExisting, ...safePatch };
  const candidate = sanitizeCandidate(rawMerged);

  issues.push(
    ...toRequiredDisabledFoulInvalidIssues(candidate),
    ...toUnknownKeyIssues(rawMerged, mode),
  );

  return toResult(candidate, issues);
}

export function validateRanges(
  ranges: unknown,
  options: RangeValidationOptions = {},
): IndexedRangeValidationResult[] {
  if (!Array.isArray(ranges)) {
    return [
      {
        index: -1,
        ...toResult({}, [
          {
            field: '$',
            code: 'invalid',
            message: 'ranges must be an array',
          },
        ]),
      },
    ];
  }

  return ranges.map((candidate, index) => ({
    index,
    ...validateRangeCreate(candidate, options),
  }));
}
