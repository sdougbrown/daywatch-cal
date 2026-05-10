import { createMemo, type Accessor } from 'solid-js';
import { buildMonthTimelineModel } from '@daywatch/cal-models';
import type { MonthTimelineModel, MonthTimelineModelConfig } from '@daywatch/cal-models';
import { toAccessor, type MaybeAccessor } from './utils.js';

export interface CreateMonthTimelineResult {
  months: Accessor<MonthTimelineModel['months']>;
  spans: Accessor<MonthTimelineModel['spans']>;
  getDatePosition: Accessor<MonthTimelineModel['getDatePosition']>;
}

export function createMonthTimeline(
  config: MaybeAccessor<MonthTimelineModelConfig>,
): CreateMonthTimelineResult {
  const resolvedConfig = toAccessor(config);
  const model = createMemo(() => buildMonthTimelineModel(resolvedConfig()));

  return {
    months: () => model().months,
    spans: () => model().spans,
    getDatePosition: () => model().getDatePosition,
  };
}
