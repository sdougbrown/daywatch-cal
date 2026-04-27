/**
 * Internal time/date utilities for daywatch-cal.
 * Uses Intl.DateTimeFormat for timezone conversion — no external dependencies.
 */

const TWO_DIGITS = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0'));
const dateTimePartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const zonedDateTimePartsCache = new Map<string, ZonedDateTimeParts>();
const timezoneOffsetCache = new Map<string, number>();
const timeConversionCache = new Map<string, string | null>();

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parseTwoDigits(value: string, start: number): number {
  return (value.charCodeAt(start) - 48) * 10 + (value.charCodeAt(start + 1) - 48);
}

function getDateTimePartsFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = dateTimePartsFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    dateTimePartsFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function getZonedDateTimeParts(date: Date, timezone: string): ZonedDateTimeParts {
  const cacheKey = `${timezone}|${date.getTime()}`;
  const cached = zonedDateTimePartsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of getDateTimePartsFormatter(timezone).formatToParts(date)) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'hour':
        hour = Number(part.value);
        break;
      case 'minute':
        minute = Number(part.value);
        break;
      case 'second':
        second = Number(part.value);
        break;
    }
  }

  const parts = { year, month, day, hour, minute, second };
  zonedDateTimePartsCache.set(cacheKey, parts);
  return parts;
}

/** Parse "HH:mm" into { hour, minute } */
export function parseTime(time: string): { hour: number; minute: number } {
  return {
    hour: parseTwoDigits(time, 0),
    minute: parseTwoDigits(time, 3),
  };
}

/** Format { hour, minute } into "HH:mm" */
export function formatTime(hour: number, minute: number): string {
  return `${TWO_DIGITS[hour] ?? String(hour).padStart(2, '0')}:${TWO_DIGITS[minute] ?? String(minute).padStart(2, '0')}`;
}

/** Convert minutes since midnight to "HH:mm" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return formatTime(h, m);
}

/** Convert "HH:mm" to minutes since midnight */
export function timeToMinutes(time: string): number {
  return parseTwoDigits(time, 0) * 60 + parseTwoDigits(time, 3);
}

/** Add minutes to a time string, clamping at 24:00. Returns null if result >= 24:00. */
export function addMinutes(time: string, minutes: number): string | null {
  const total = timeToMinutes(time) + minutes;
  if (total >= 1440) return null; // past midnight
  return minutesToTime(total);
}

/** Parse "YYYY-MM-DD" into { year, month, day } */
export function parseDate(date: string): { year: number; month: number; day: number } {
  const year =
    (date.charCodeAt(0) - 48) * 1000 +
    (date.charCodeAt(1) - 48) * 100 +
    (date.charCodeAt(2) - 48) * 10 +
    (date.charCodeAt(3) - 48);
  return {
    year,
    month: parseTwoDigits(date, 5) - 1,
    day: parseTwoDigits(date, 8),
  };
}

/** Format a Date to "YYYY-MM-DD" */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = TWO_DIGITS[date.getMonth() + 1];
  const d = TWO_DIGITS[date.getDate()];
  return `${y}-${m}-${d}`;
}

/** Get the day of week (0=Sunday) for a "YYYY-MM-DD" string */
export function getDayOfWeek(dateStr: string): number {
  const { year, month, day } = parseDate(dateStr);
  return new Date(year, month, day).getDay();
}

/** Get the number of days in a given month (0-indexed month) */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Compare two "YYYY-MM-DD" strings. Returns -1, 0, or 1. */
export function compareDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Generate all dates (as "YYYY-MM-DD") between from and to, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const { year: fy, month: fm, day: fd } = parseDate(from);
  const { year: ty, month: tm, day: td } = parseDate(to);
  const start = new Date(fy, fm, fd);
  const end = new Date(ty, tm, td);

  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/** Get today's date as "YYYY-MM-DD" in a given timezone (or local if not specified). */
export function getToday(timezone?: string): string {
  if (timezone) {
    return formatDateInTimezone(new Date(), timezone);
  }
  return formatDate(new Date());
}

/**
 * Format a Date as "YYYY-MM-DD" in a specific timezone using Intl.DateTimeFormat.
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = getZonedDateTimeParts(date, timezone);
  return `${parts.year}-${TWO_DIGITS[parts.month]}-${TWO_DIGITS[parts.day]}`;
}

/**
 * Get the hour and minute of a Date in a specific timezone.
 */
export function getTimeInTimezone(date: Date, timezone: string): { hour: number; minute: number } {
  const parts = getZonedDateTimeParts(date, timezone);
  return { hour: parts.hour, minute: parts.minute };
}

/**
 * Convert a time from one timezone to another on a given date.
 * Returns the converted time as "HH:mm", or null if the time doesn't exist
 * (e.g., spring-forward DST gap).
 */
export function convertTime(
  dateStr: string,
  time: string,
  fromTimezone: string,
  toTimezone: string,
): string | null {
  if (fromTimezone === toTimezone) return time;

  const cacheKey = `${dateStr}|${time}|${fromTimezone}|${toTimezone}`;
  if (timeConversionCache.has(cacheKey)) {
    return timeConversionCache.get(cacheKey)!;
  }

  const { year, month, day } = parseDate(dateStr);
  const { hour, minute } = parseTime(time);

  // Create a Date in the source timezone by using a known UTC offset approach.
  // We build a UTC date then adjust based on the source timezone offset.
  const utcDate = new Date(Date.UTC(year, month, day, hour, minute));

  // Get the offset of the source timezone at this time
  const sourceOffset = getTimezoneOffset(utcDate, fromTimezone);
  // Adjust to actual UTC
  const actualUtc = new Date(utcDate.getTime() + sourceOffset * 60000);

  // Now get the time in the target timezone
  const targetTime = getTimeInTimezone(actualUtc, toTimezone);

  // Check if the source time actually exists (DST spring-forward gap)
  const verifyTime = getTimeInTimezone(actualUtc, fromTimezone);
  if (verifyTime.hour !== hour || verifyTime.minute !== minute) {
    timeConversionCache.set(cacheKey, null);
    return null; // Time doesn't exist in source timezone (DST gap)
  }

  const converted = formatTime(targetTime.hour, targetTime.minute);
  timeConversionCache.set(cacheKey, converted);
  return converted;
}

/**
 * Get the UTC offset of a timezone in minutes at a given instant.
 * Positive means behind UTC (e.g., UTC-5 returns 300).
 */
function getTimezoneOffset(date: Date, timezone: string): number {
  const cacheKey = `${timezone}|${date.getTime()}`;
  const cached = timezoneOffsetCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const parts = getZonedDateTimeParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = Math.round((date.getTime() - asUtc) / 60000);
  timezoneOffsetCache.set(cacheKey, offset);
  return offset;
}

/**
 * Build a Date object from a date string and time string in a given timezone.
 * If timezone is null/undefined (floating), uses local time.
 */
export function buildDate(dateStr: string, time: string | null, timezone?: string | null): Date {
  const { year, month, day } = parseDate(dateStr);

  if (!time) {
    return new Date(year, month, day);
  }

  const { hour, minute } = parseTime(time);

  if (!timezone) {
    // Floating — local time
    return new Date(year, month, day, hour, minute);
  }

  if (timezone === 'UTC') {
    return new Date(Date.UTC(year, month, day, hour, minute));
  }

  // Specific timezone — build via UTC offset
  const utcGuess = new Date(Date.UTC(year, month, day, hour, minute));
  const offset = getTimezoneOffset(utcGuess, timezone);
  return new Date(utcGuess.getTime() + offset * 60000);
}
