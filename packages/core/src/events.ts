import type { DateRange, Occurrence, CalendarEvent } from './types.js';
import { buildDate } from './time.js';

/**
 * Convert a native DateRange + one of its expanded Occurrences into a CalendarEvent.
 */
export function fromDateRange(range: DateRange, occurrence: Occurrence): CalendarEvent {
  const start = buildDate(occurrence.date, occurrence.startTime, range.timezone);

  let end: Date | null = null;
  if (occurrence.endTime) {
    end = buildDate(occurrence.date, occurrence.endTime, range.timezone);
  }

  return {
    id: `${range.id}:${occurrence.date}${occurrence.startTime ? `:${occurrence.startTime}` : ''}`,
    title: range.title ?? range.label,
    start,
    end,
    allDay: occurrence.allDay,
    source: 'native',
    sourceId: range.id,
    editable: true,
  };
}

/**
 * Batch-convert: expand a DateRange within a window and return CalendarEvents.
 */
export function expandToEvents(range: DateRange, occurrences: Occurrence[]): CalendarEvent[] {
  return occurrences.map((o) => fromDateRange(range, o));
}
