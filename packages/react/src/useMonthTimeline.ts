import { useMemo } from 'react';
import { buildMonthTimelineModel } from '@daywatch/cal-models';
import type { MonthTimelineModel, MonthTimelineModelConfig } from '@daywatch/cal-models';

export type UseMonthTimelineConfig = MonthTimelineModelConfig;
export interface UseMonthTimelineResult extends MonthTimelineModel {}

/**
 * Computes month-column timeline layout data.
 *
 * @note Stabilize the `ranges` array with `useMemo` or a module-level constant.
 * Inline array literals cause the timeline to recompute on every render.
 */
export function useMonthTimeline(config: UseMonthTimelineConfig): UseMonthTimelineResult {
  const { startDate, ranges, numberOfMonths, endDate, locale, userTimezone } = config;

  return useMemo(
    () => {
      const baseConfig = {
        startDate,
        ranges,
        ...(locale !== undefined ? { locale } : {}),
        ...(userTimezone !== undefined ? { userTimezone } : {}),
      };

      return buildMonthTimelineModel(
        endDate !== undefined
          ? {
              ...baseConfig,
              endDate,
              ...(numberOfMonths !== undefined ? { numberOfMonths } : {}),
            }
          : numberOfMonths !== undefined
            ? {
                ...baseConfig,
                numberOfMonths,
              }
            : config,
      );
    },
    [startDate, ranges, numberOfMonths, endDate, locale, userTimezone],
  );
}
