import { useMemo } from 'preact/hooks';
import { createRangeCheck } from '@daywatch/cal-models';
import type { RangeCheck } from '@daywatch/cal-models';
import type { DateRange } from '@daywatch/cal';

export function useRangeCheck(ranges: DateRange[], userTimezone?: string): RangeCheck {
  return useMemo(() => createRangeCheck(ranges, userTimezone), [ranges, userTimezone]);
}
