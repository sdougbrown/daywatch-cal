import type { DateRange } from '@daywatch/cal';

import { subtractOneDay } from './gcal.js';
import type { MsftAdapterOptions, MsftGraphEvent } from './types.js';
import { toIanaTimezone } from './windows-timezones.js';

export function isBlockingMsftEvent(
  event: MsftGraphEvent,
  options: MsftAdapterOptions = {},
): boolean {
  if (event.isCancelled) return false;
  if (event.type === 'seriesMaster') return false;
  if (
    (event.showAs === 'free' || event.showAs === 'workingElsewhere') &&
    options.includeFree !== true
  )
    return false;
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
      metadata,
    };
  }

  return {
    id: event.id,
    label,
    fromDate: startDt.slice(0, 10),
    toDate: endDt.slice(0, 10),
    startTime: startDt.length > 10 ? startDt.slice(11, 16) : undefined,
    endTime: endDt.length > 10 ? endDt.slice(11, 16) : undefined,
    timezone: toIanaTimezone(event.start.timeZone),
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
