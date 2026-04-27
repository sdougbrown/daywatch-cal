import { formatDate, parseDate } from '@daywatch/cal';

import type { DateRange } from '@daywatch/cal';

import type { GCalAdapterOptions, GCalEvent } from './types.js';

export function isBlockingEvent(event: GCalEvent, options: GCalAdapterOptions = {}): boolean {
  if (event.status === 'cancelled') return false;
  if (event.eventType === 'workingLocation' || event.eventType === 'birthday') return false;
  if (event.transparency === 'transparent' && options.includeTransparent !== true) return false;
  if (event.myResponseStatus === 'declined') return false;
  if (event.myResponseStatus === 'tentative' && options.includeTentative === false) return false;
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

  if (event.eventType) metadata.eventType = event.eventType;
  if (event.myResponseStatus) metadata.responseStatus = event.myResponseStatus;
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

  return {
    id: event.id,
    label,
    fromDate: startDateTime.slice(0, 10),
    toDate: endDateTime.slice(0, 10),
    startTime: startDateTime.length > 10 ? startDateTime.slice(11, 16) : undefined,
    endTime: endDateTime.length > 10 ? endDateTime.slice(11, 16) : undefined,
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
