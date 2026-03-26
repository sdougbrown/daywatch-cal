import { useMemo } from 'react';
import { buildDayDetailModel } from '@neo-reckoning/models';
import type { DayDetailModel } from '@neo-reckoning/models';
import type { DateRange } from '@neo-reckoning/core';

/**
 * Day detail hook — provides time slots and all-day range info for a specific day.
 * Used for day-view and week-view rendering.
 */
export function useDayDetail(
  date: string,
  ranges: DateRange[],
  userTimezone?: string,
): DayDetailModel {
  return useMemo(() => buildDayDetailModel(date, ranges, userTimezone), [date, ranges, userTimezone]);
}
