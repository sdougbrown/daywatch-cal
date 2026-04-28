import { useMemo } from 'preact/hooks';
import { buildScheduleScoreModel } from '@daywatch/cal-models';
import type { ScheduleScoreModelConfig } from '@daywatch/cal-models';
import type { ScheduleScore } from '@daywatch/cal';

export interface UseScheduleScoreConfig extends ScheduleScoreModelConfig {}

export function useScheduleScore(config: UseScheduleScoreConfig): ScheduleScore {
  const { ranges, from, to, focusBlockMinutes, dayStart, dayEnd, userTimezone } = config;

  return useMemo(
    () =>
      buildScheduleScoreModel({
        ranges,
        from,
        to,
        focusBlockMinutes,
        dayStart,
        dayEnd,
        userTimezone,
      }),
    [ranges, from, to, focusBlockMinutes, dayStart, dayEnd, userTimezone],
  );
}
