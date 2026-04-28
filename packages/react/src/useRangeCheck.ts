import { useMemo } from 'react';
import { createRangeCheck } from '@daywatch/cal-models';
import type { RangeCheck } from '@daywatch/cal-models';
import type { DateRange } from '@daywatch/cal';

/**
 * Range evaluation hook — provides isInRange checks and occurrence expansion.
 */
export function useRangeCheck(ranges: DateRange[], userTimezone?: string): RangeCheck {
  return useMemo(() => createRangeCheck(ranges, userTimezone), [ranges, userTimezone]);
}
