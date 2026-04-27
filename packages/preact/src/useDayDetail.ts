import { useMemo } from 'preact/hooks';
import { buildDayDetailModel } from '@daywatch/cal-models';
import type { DayDetailModel } from '@daywatch/cal-models';
import type { DateRange } from '@daywatch/cal';

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
