import { useMemo } from 'react';
import { buildScheduleScoreModel } from '@neo-reckoning/models';
import type { ScheduleScoreModelConfig } from '@neo-reckoning/models';
import type { ScheduleScore } from '@neo-reckoning/core';

export interface UseScheduleScoreConfig extends ScheduleScoreModelConfig {}

/**
 * Compute a ScheduleScore for a set of ranges across a date window.
 * Re-computes when inputs change.
 */
export function useScheduleScore(config: UseScheduleScoreConfig): ScheduleScore {
  const {
    ranges,
    from,
    to,
    focusBlockMinutes,
    dayStart,
    dayEnd,
    userTimezone,
  } = config;

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
