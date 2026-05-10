import { useMemo } from 'preact/hooks';
import { buildMonthTimelineModel } from '@daywatch/cal-models';
import type { MonthTimelineModel, MonthTimelineModelConfig } from '@daywatch/cal-models';

export interface UseMonthTimelineConfig extends MonthTimelineModelConfig {}

export function useMonthTimeline(config: UseMonthTimelineConfig): MonthTimelineModel {
  const { startDate, ranges, numberOfMonths, endDate, locale, userTimezone } = config;

  return useMemo(
    () =>
      buildMonthTimelineModel({
        startDate,
        ranges,
        numberOfMonths,
        endDate,
        locale,
        userTimezone,
      }),
    [startDate, ranges, numberOfMonths, endDate, locale, userTimezone],
  );
}
