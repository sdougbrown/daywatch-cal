import { useMemo } from 'react';
import { buildDayDetailModel } from '@daywatch/cal-models';
import type { DayDetailModel } from '@daywatch/cal-models';
import type { DateRange } from '@daywatch/cal';

/**
 * Day detail hook — provides time slots and all-day range info for a specific day.
 * Used for day-view and week-view rendering.
 */
export function useDayDetail(
  date: string,
  ranges: DateRange[],
  userTimezone?: string,
): DayDetailModel {
  return useMemo(
    () => buildDayDetailModel(date, ranges, userTimezone),
    [date, ranges, userTimezone],
  );
}
