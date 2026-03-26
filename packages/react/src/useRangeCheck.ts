import { useMemo } from 'react';
import { createRangeCheck } from '@neo-reckoning/models';
import type { RangeCheck } from '@neo-reckoning/models';
import type { DateRange } from '@neo-reckoning/core';

/**
 * Range evaluation hook — provides isInRange checks and occurrence expansion.
 */
export function useRangeCheck(
  ranges: DateRange[],
  userTimezone?: string,
): RangeCheck {
  return useMemo(() => createRangeCheck(ranges, userTimezone), [ranges, userTimezone]);
}
