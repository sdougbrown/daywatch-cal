import { useMemo } from 'react';
import { buildCalendarEvents } from '@neo-reckoning/models';
import type { CalendarEventsModelConfig } from '@neo-reckoning/models';
import type { CalendarEvent } from '@neo-reckoning/core';

export interface UseCalendarEventsConfig extends CalendarEventsModelConfig {}

/**
 * Event normalization hook — merges native ranges and imported events
 * into a single CalendarEvent[] for the rendering pipeline.
 */
export function useCalendarEvents(config: UseCalendarEventsConfig): CalendarEvent[] {
  const { ranges, importedEvents, from, to, userTimezone } = config;

  return useMemo(() => {
    return buildCalendarEvents({
      ranges,
      importedEvents,
      from,
      to,
      userTimezone,
    });
  }, [ranges, importedEvents, from, to, userTimezone]);
}
