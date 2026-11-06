import {
  formatDate,
  formatDateInTimezone,
  formatTime,
  getTimeInTimezone,
  parseDate,
} from '@daywatch/cal';

import type { DateRange } from '@daywatch/cal';

import type { GCalAdapterOptions, GCalEvent, GCalEventAttendee } from './types.js';

interface ZonedFields {
  date: string;
  time?: string;
}

function hasExplicitOffset(dateTime: string): boolean {
  return /(?:Z|z|[+-]\d{2}:\d{2})$/.test(dateTime);
}

/**
 * The raw API format puts the current user's response on their self attendee;
 * the condensed format folds it into myResponseStatus. Prefer the self
 * attendee when present.
 */
function getMyResponseStatus(event: GCalEvent): string | undefined {
  const selfAttendee = event.attendees?.find((attendee: GCalEventAttendee) => attendee.self);
  return selfAttendee?.responseStatus ?? event.myResponseStatus;
}

/**
 * The raw API sends eventType in uppercase (WORKING_LOCATION, BIRTHDAY);
 * map those to the condensed camelCase form. Condensed-format values pass
 * through verbatim — lowercasing them would mangle camelCase names like
 * 'workingLocation' into 'workinglocation'.
 */
function normalizeEventType(eventType: string | undefined): string | undefined {
  if (!eventType) return eventType;
  if (eventType !== eventType.toUpperCase()) return eventType;
  return eventType.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Whether an event loads as a range. Cancelled, declined, working-location
 * and birthday events are excluded; transparent events now load too, with
 * their transparency carried so conflict detection can treat them as free.
 */
export function isBlockingEvent(event: GCalEvent, options: GCalAdapterOptions = {}): boolean {
  if (event.status === 'cancelled') return false;
  const eventType = normalizeEventType(event.eventType);
  if (eventType === 'workingLocation' || eventType === 'birthday') return false;
  const myResponseStatus = getMyResponseStatus(event);
  if (myResponseStatus === 'declined') return false;
  if (myResponseStatus === 'tentative' && options.includeTentative === false) return false;
  return true;
}

export function subtractOneDay(dateStr: string): string {
  const { year, month, day } = parseDate(dateStr);
  const date = new Date(year, month, day);
  date.setDate(date.getDate() - 1);
  return formatDate(date);
}

/**
 * Date (and time, when present) fields for a dateTime string, expressed in
 * `timeZone`. Offset-bearing dateTimes are parsed to an instant and formatted
 * in the zone; offset-free dateTimes keep their wall clock untouched.
 */
function resolveZonedFields(dateTime: string, timeZone: string | undefined): ZonedFields {
  const time = dateTime.length > 10 ? dateTime.slice(11, 16) : undefined;
  const ms = Date.parse(dateTime);
  if (!time || !hasExplicitOffset(dateTime) || !timeZone || Number.isNaN(ms)) {
    return { date: dateTime.slice(0, 10), time };
  }
  const date = new Date(ms);
  const { hour, minute } = getTimeInTimezone(date, timeZone);
  return { date: formatDateInTimezone(date, timeZone), time: formatTime(hour, minute) };
}

export function gcalEventToDateRange(
  event: GCalEvent,
  options: GCalAdapterOptions = {},
): DateRange {
  const metadata: Record<string, unknown> = {
    gcalId: event.id,
  };

  const eventType = normalizeEventType(event.eventType);
  if (eventType) metadata.eventType = eventType;
  const myResponseStatus = getMyResponseStatus(event);
  if (myResponseStatus) metadata.responseStatus = myResponseStatus;
  if (event.transparency) metadata.transparency = event.transparency;
  if (event.numAttendees) metadata.numAttendees = event.numAttendees;
  if (event.recurringEventId) metadata.recurringEventId = event.recurringEventId;
  if (event.htmlLink) metadata.htmlLink = event.htmlLink;

  const label = event.summary ?? options.fallbackLabel ?? '(busy)';
  const transparency =
    event.transparency === 'transparent'
      ? ('transparent' as const)
      : event.transparency === 'opaque'
        ? ('opaque' as const)
        : undefined;
  const isAllDay = event.allDay || (event.start.date != null && event.start.dateTime == null);

  if (isAllDay) {
    const fromDate = event.start.date ?? event.start.dateTime?.slice(0, 10);
    const endDate = event.end.date ?? event.end.dateTime?.slice(0, 10);
    return {
      id: event.id,
      label,
      fromDate,
      toDate: endDate ? subtractOneDay(endDate) : fromDate,
      ...(transparency !== undefined ? { transparency } : {}),
      ...(eventType !== undefined ? { eventType } : {}),
      metadata,
    };
  }

  const startDateTime = event.start.dateTime ?? event.start.date;
  const endDateTime = event.end.dateTime ?? event.end.date;

  if (!startDateTime || !endDateTime) {
    // Defensive fallback — event has no usable time data
    return { id: event.id, label, metadata };
  }

  // Set duration (total elapsed minutes) so the evaluator can tell a
  // continuous multi-day block (e.g. a week-long shift) apart from a daily
  // time window repeated over a date range — they share the same
  // fromDate/toDate/startTime/endTime shape and differ only by duration.
  const startMs = Date.parse(startDateTime);
  const endMs = Date.parse(endDateTime);
  const hasDuration = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;

  // The dateTime offset is the source of truth for the instant. fromDate,
  // toDate, startTime and endTime are re-expressed in the zone the range
  // carries. A dateTime written in one zone and tagged with another then
  // lands at the right time. An event that crosses midnight after conversion
  // gets the right dates. Offset-free dateTimes keep their wall clock as-is.
  // With no timeZone field, an offset-bearing dateTime is pinned to UTC so
  // it is never compared as floating time; offset-free ones stay floating.
  const timeZone = event.start.timeZone ?? (hasExplicitOffset(startDateTime) ? 'UTC' : undefined);
  const startFields = resolveZonedFields(startDateTime, timeZone);
  const endFields = resolveZonedFields(endDateTime, timeZone);

  return {
    id: event.id,
    label,
    fromDate: startFields.date,
    toDate: endFields.date,
    startTime: startFields.time,
    endTime: endFields.time,
    duration: hasDuration ? Math.round((endMs - startMs) / 60000) : undefined,
    timezone: timeZone,
    ...(transparency !== undefined ? { transparency } : {}),
    ...(eventType !== undefined ? { eventType } : {}),
    metadata,
  };
}

export function gcalEventsToDateRanges(
  events: GCalEvent[],
  options: GCalAdapterOptions = {},
): DateRange[] {
  return events
    .filter((event) => isBlockingEvent(event, options))
    .map((event) => gcalEventToDateRange(event, options));
}
