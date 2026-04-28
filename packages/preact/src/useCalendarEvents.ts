import { useMemo } from 'preact/hooks';
import { buildCalendarEvents } from '@daywatch/cal-models';
import type { CalendarEventsModelConfig } from '@daywatch/cal-models';
import type { CalendarEvent } from '@daywatch/cal';

export interface UseCalendarEventsConfig extends CalendarEventsModelConfig {}

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
