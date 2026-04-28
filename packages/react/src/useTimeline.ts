import { useMemo } from 'react';
import { buildTimelineModel } from '@daywatch/cal-models';
import type { TimelineModelConfig } from '@daywatch/cal-models';
import type { TimelineSlot } from '@daywatch/cal';

export interface UseTimelineConfig extends TimelineModelConfig {}

export interface UseTimelineResult {
  /** Timeline slots with positioned events */
  slots: TimelineSlot[];
}

/**
 * Timeline hook — produces positioned timeline data for day views.
 */
export function useTimeline(config: UseTimelineConfig): UseTimelineResult {
  const { date, events, startHour, endHour, intervalMinutes } = config;

  const slots = useMemo(
    () => buildTimelineModel({ date, events, startHour, endHour, intervalMinutes }).slots,
    [date, events, startHour, endHour, intervalMinutes],
  );

  return { slots };
}
