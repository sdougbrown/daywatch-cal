import { formatDate, parseDate } from '@daywatch/cal';

import type { DateRange } from '@daywatch/cal';

import type { GCalAdapterOptions, GCalEvent, GCalEventAttendee } from './types.js';

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
 * normalize snake-case uppercase values to the condensed camelCase form.
 */
function normalizeEventType(eventType: string | undefined): string | undefined {
  if (!eventType) return eventType;
  return eventType.toLowerCase().replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function isBlockingEvent(event: GCalEvent, options: GCalAdapterOptions = {}): boolean {
  if (event.status === 'cancelled') return false;
  const eventType = normalizeEventType(event.eventType);
  if (eventType === 'workingLocation' || eventType === 'birthday') return false;
  if (event.transparency === 'transparent' && options.includeTransparent !== true) return false;
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
  const isAllDay = event.allDay || (event.start.date != null && event.start.dateTime == null);

  if (isAllDay) {
    const fromDate = event.start.date ?? event.start.dateTime?.slice(0, 10);
    const endDate = event.end.date ?? event.end.dateTime?.slice(0, 10);
    return {
      id: event.id,
      label,
      fromDate,
      toDate: endDate ? subtractOneDay(endDate) : fromDate,
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

  return {
    id: event.id,
    label,
    fromDate: startDateTime.slice(0, 10),
    toDate: endDateTime.slice(0, 10),
    startTime: startDateTime.length > 10 ? startDateTime.slice(11, 16) : undefined,
    endTime: endDateTime.length > 10 ? endDateTime.slice(11, 16) : undefined,
    duration: hasDuration ? Math.round((endMs - startMs) / 60000) : undefined,
    timezone: event.start.timeZone,
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
