import type { DateRange } from '@daywatch/cal';

import { subtractOneDay } from './gcal.js';
import type { MsftAdapterOptions, MsftGraphEvent } from './types.js';
import { toIanaTimezone } from './windows-timezones.js';

/**
 * Whether an event loads as a range. Cancelled, declined and seriesMaster
 * events are excluded; free/workingElsewhere events now load too, with
 * their busy/free signal carried so conflict detection can treat them as
 * free.
 */
export function isBlockingMsftEvent(
  event: MsftGraphEvent,
  options: MsftAdapterOptions = {},
): boolean {
  if (event.isCancelled) return false;
  if (event.type === 'seriesMaster') return false;
  if (event.responseStatus?.response === 'declined') return false;
  if (event.showAs === 'tentative' && options.includeTentative === false) return false;
  return true;
}

export function msftEventToDateRange(
  event: MsftGraphEvent,
  options: MsftAdapterOptions = {},
): DateRange {
  const metadata: Record<string, unknown> = {
    msftId: event.id,
  };

  if (event.iCalUId) metadata.iCalUId = event.iCalUId;
  if (event.showAs) metadata.showAs = event.showAs;
  if (event.responseStatus?.response) metadata.responseStatus = event.responseStatus.response;
  if (event.seriesMasterId) metadata.seriesMasterId = event.seriesMasterId;
  if (event.webLink) metadata.webLink = event.webLink;

  const label = event.subject ?? options.fallbackLabel ?? '(busy)';
  const transparency =
    event.showAs === 'free' || event.showAs === 'workingElsewhere'
      ? ('transparent' as const)
      : event.showAs !== undefined
        ? ('opaque' as const)
        : undefined;
  const startDt = event.start?.dateTime;
  const endDt = event.end?.dateTime;

  if (!startDt || !endDt) {
    return { id: event.id, label, metadata };
  }

  if (event.isAllDay) {
    return {
      id: event.id,
      label,
      fromDate: startDt.slice(0, 10),
      toDate: subtractOneDay(endDt.slice(0, 10)),
      ...(transparency !== undefined ? { transparency } : {}),
      metadata,
    };
  }

  // Set duration (total elapsed minutes) so the evaluator can distinguish a
  // continuous multi-day block from a daily window repeated over a date range
  // — same fromDate/toDate/startTime/endTime shape, told apart by duration.
  const startMs = Date.parse(startDt);
  const endMs = Date.parse(endDt);
  const hasDuration = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;

  return {
    id: event.id,
    label,
    fromDate: startDt.slice(0, 10),
    toDate: endDt.slice(0, 10),
    startTime: startDt.length > 10 ? startDt.slice(11, 16) : undefined,
    endTime: endDt.length > 10 ? endDt.slice(11, 16) : undefined,
    duration: hasDuration ? Math.round((endMs - startMs) / 60000) : undefined,
    timezone: toIanaTimezone(event.start.timeZone),
    ...(transparency !== undefined ? { transparency } : {}),
    metadata,
  };
}

export function msftEventsToDateRanges(
  events: MsftGraphEvent[],
  options: MsftAdapterOptions = {},
): DateRange[] {
  return events
    .filter((event) => isBlockingMsftEvent(event, options))
    .map((event) => msftEventToDateRange(event, options));
}
