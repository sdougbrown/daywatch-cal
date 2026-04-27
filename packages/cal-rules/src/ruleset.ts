import type { DateRange } from '@daywatch/cal';
import { anyOf, enabledWhen, fairWhen, requires, umpire } from '@umpire/core';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const END_TIME_RE = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

function isEmptyStringLike(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function isEmptyArrayLike(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.length === 0);
}

function isValidDateString(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isIanaTimezone(value: unknown): boolean {
  if (value == null || value === '') {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const RANGE_KEYS = [
  'id',
  'label',
  'title',
  'dates',
  'fromDate',
  'toDate',
  'fixedBetween',
  'exceptDates',
  'exceptBetween',
  'everyDate',
  'everyWeekday',
  'everyMonth',
  'everyHour',
  'startTime',
  'endTime',
  'repeatEvery',
  'duration',
  'timezone',
  'displayType',
  'flexibility',
  'metadata',
] as const satisfies readonly (keyof DateRange)[];

export const rangeInputUmp = umpire({
  fields: {
    id: { required: true, isEmpty: isEmptyStringLike },
    label: { required: true, isEmpty: isEmptyStringLike },
    title: { isEmpty: isEmptyStringLike },

    dates: { isEmpty: isEmptyArrayLike },
    fromDate: { isEmpty: isEmptyStringLike },
    toDate: { isEmpty: isEmptyStringLike },
    fixedBetween: {},

    exceptDates: { isEmpty: isEmptyArrayLike },
    exceptBetween: { isEmpty: isEmptyArrayLike },

    everyDate: { isEmpty: isEmptyArrayLike },
    everyWeekday: { isEmpty: isEmptyArrayLike },
    everyMonth: { isEmpty: isEmptyArrayLike },

    everyHour: { isEmpty: isEmptyArrayLike },
    startTime: { isEmpty: isEmptyStringLike },
    endTime: { isEmpty: isEmptyStringLike },
    repeatEvery: {},
    duration: {},

    timezone: { isEmpty: isEmptyStringLike },
    displayType: { isEmpty: isEmptyStringLike },
    flexibility: {},
    metadata: {},
  },
  rules: [
    requires('endTime', 'startTime', { reason: 'endTime requires startTime' }),
    requires('repeatEvery', 'startTime', {
      reason: 'repeatEvery requires startTime',
    }),
    anyOf(
      requires('duration', 'everyHour', {
        reason: 'duration requires everyHour or startTime',
      }),
      requires('duration', 'startTime', {
        reason: 'duration requires everyHour or startTime',
      }),
    ),
    enabledWhen(
      'everyHour',
      (values) =>
        isEmptyStringLike(values.startTime) &&
        isEmptyStringLike(values.endTime) &&
        values.repeatEvery == null,
      {
        reason: 'everyHour is mutually exclusive with startTime/endTime/repeatEvery',
      },
    ),
    enabledWhen('startTime', (values) => isEmptyArrayLike(values.everyHour), {
      reason: 'startTime is mutually exclusive with everyHour',
    }),
    enabledWhen('endTime', (values) => isEmptyArrayLike(values.everyHour), {
      reason: 'endTime is mutually exclusive with everyHour',
    }),
    enabledWhen('repeatEvery', (values) => isEmptyArrayLike(values.everyHour), {
      reason: 'repeatEvery is mutually exclusive with everyHour',
    }),
    fairWhen(
      'toDate',
      (toDate, values) => {
        if (
          typeof toDate !== 'string' ||
          !isValidDateString(toDate) ||
          typeof values.fromDate !== 'string' ||
          !isValidDateString(values.fromDate)
        ) {
          return true;
        }

        return toDate >= values.fromDate;
      },
      { reason: 'toDate must be on or after fromDate' },
    ),
  ],
  validators: {
    id: {
      validator: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
      error: 'id is required',
    },
    label: {
      validator: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
      error: 'label is required',
    },
    dates: {
      validator: (value: unknown) =>
        !Array.isArray(value) ? false : value.every((item) => isValidDateString(item)),
      error: 'dates must contain valid YYYY-MM-DD strings',
    },
    fromDate: {
      validator: (value: unknown) => isValidDateString(value),
      error: 'fromDate must be YYYY-MM-DD',
    },
    toDate: {
      validator: (value: unknown) => isValidDateString(value),
      error: 'toDate must be YYYY-MM-DD',
    },
    exceptDates: {
      validator: (value: unknown) =>
        !Array.isArray(value) ? false : value.every((item) => isValidDateString(item)),
      error: 'exceptDates must contain valid YYYY-MM-DD strings',
    },
    exceptBetween: {
      validator: (value: unknown) =>
        !Array.isArray(value)
          ? false
          : value.every(
              (item) =>
                Array.isArray(item) &&
                item.length === 2 &&
                isValidDateString(item[0]) &&
                isValidDateString(item[1]) &&
                item[0] <= item[1],
            ),
      error: 'exceptBetween must be [fromDate, toDate] tuples of valid YYYY-MM-DD strings',
    },
    everyDate: {
      validator: (value: unknown) =>
        !Array.isArray(value)
          ? false
          : value.every((item) => Number.isInteger(item) && item >= 1 && item <= 31),
      error: 'everyDate must be integers 1-31',
    },
    everyWeekday: {
      validator: (value: unknown) =>
        !Array.isArray(value)
          ? false
          : value.every((item) => Number.isInteger(item) && item >= 0 && item <= 6),
      error: 'everyWeekday must be integers 0-6',
    },
    everyMonth: {
      validator: (value: unknown) =>
        !Array.isArray(value)
          ? false
          : value.every((item) => Number.isInteger(item) && item >= 1 && item <= 12),
      error: 'everyMonth must be integers 1-12',
    },
    everyHour: {
      validator: (value: unknown) =>
        !Array.isArray(value)
          ? false
          : value.every((item) => Number.isInteger(item) && item >= 0 && item <= 23),
      error: 'everyHour must be integers 0-23',
    },
    startTime: {
      validator: (value: unknown) => typeof value === 'string' && TIME_RE.test(value),
      error: 'startTime must be HH:mm',
    },
    endTime: {
      validator: (value: unknown) => typeof value === 'string' && END_TIME_RE.test(value),
      error: 'endTime must be HH:mm or 24:00',
    },
    repeatEvery: {
      validator: (value: unknown) =>
        typeof value === 'number' && Number.isInteger(value) && value > 0,
      error: 'repeatEvery must be a positive integer',
    },
    duration: {
      validator: (value: unknown) =>
        typeof value === 'number' && Number.isInteger(value) && value > 0,
      error: 'duration must be a positive integer',
    },
    timezone: {
      validator: isIanaTimezone,
      error: 'timezone must be a valid IANA timezone',
    },
    fixedBetween: {
      validator: (value: unknown) => typeof value === 'boolean',
      error: 'fixedBetween must be a boolean',
    },
    title: {
      validator: (value: unknown) => typeof value === 'string',
      error: 'title must be a string',
    },
    metadata: {
      validator: isPlainObject,
      error: 'metadata must be an object',
    },
    displayType: {
      validator: (value: unknown) =>
        typeof value === 'string' &&
        ['auto', 'span', 'dot', 'fill', 'chip', 'block'].includes(value),
      error: 'displayType must be one of auto|span|dot|fill|chip|block',
    },
    flexibility: {
      validator: (value: unknown) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5,
      error: 'flexibility must be an integer 0-5',
    },
  },
});
