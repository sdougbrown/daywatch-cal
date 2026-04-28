import { createMemo } from 'solid-js';
import { createRangeCheck as createModelsRangeCheck } from '@daywatch/cal-models';
import type { RangeCheck } from '@daywatch/cal-models';
import type { DateRange } from '@daywatch/cal';
import { toAccessor, type MaybeAccessor } from './utils.js';

export interface CreateRangeCheckConfig {
  ranges: DateRange[];
  userTimezone?: string;
}

export function createRangeCheck(config: MaybeAccessor<CreateRangeCheckConfig>): RangeCheck {
  const resolvedConfig = toAccessor(config);
  const rangeCheck = createMemo(() => {
    const current = resolvedConfig();
    return createModelsRangeCheck(current.ranges, current.userTimezone);
  });

  return {
    isInRange: (datetime: Date) => rangeCheck().isInRange(datetime),
    getOccurrences: (from: Date, to: Date) => rangeCheck().getOccurrences(from, to),
  };
}
