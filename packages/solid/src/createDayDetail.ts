import { createMemo, type Accessor } from 'solid-js';
import { buildDayDetailModel } from '@daywatch/cal-models';
import type { DayDetailModel } from '@daywatch/cal-models';
import type { DateRange } from '@daywatch/cal';
import { toAccessor, type MaybeAccessor } from './utils.js';

export interface CreateDayDetailConfig {
  date: string;
  ranges: DateRange[];
  userTimezone?: string;
}

export interface CreateDayDetailResult {
  timeSlots: Accessor<DayDetailModel['timeSlots']>;
  allDayRanges: Accessor<DayDetailModel['allDayRanges']>;
}

export function createDayDetail(
  config: MaybeAccessor<CreateDayDetailConfig>,
): CreateDayDetailResult {
  const resolvedConfig = toAccessor(config);
  const model = createMemo(() => {
    const current = resolvedConfig();
    return buildDayDetailModel(current.date, current.ranges, current.userTimezone);
  });

  return {
    timeSlots: () => model().timeSlots,
    allDayRanges: () => model().allDayRanges,
  };
}
