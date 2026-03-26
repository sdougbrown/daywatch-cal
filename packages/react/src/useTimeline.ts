import { useMemo } from 'react';
import { buildTimelineModel } from '@neo-reckoning/models';
import type { TimelineModelConfig } from '@neo-reckoning/models';
import type { TimelineSlot } from '@neo-reckoning/core';

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
