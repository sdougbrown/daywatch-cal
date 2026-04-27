import { createMemo, type Accessor } from 'solid-js';
import { buildTimelineModel } from '@daywatch/cal-models';
import type { TimelineModelConfig, TimelineModel } from '@daywatch/cal-models';
import { toAccessor, type MaybeAccessor } from './utils.js';

export interface CreateTimelineResult {
  slots: Accessor<TimelineModel['slots']>;
}

export function createTimeline(config: MaybeAccessor<TimelineModelConfig>): CreateTimelineResult {
  const resolvedConfig = toAccessor(config);
  const model = createMemo(() => buildTimelineModel(resolvedConfig()));

  return {
    slots: () => model().slots,
  };
}
