import { useMemo } from 'preact/hooks';
import { buildTimelineModel } from '@daywatch/cal-models';
import type { TimelineModelConfig } from '@daywatch/cal-models';
import type { TimelineSlot } from '@daywatch/cal';

export interface UseTimelineConfig extends TimelineModelConfig {}

export interface UseTimelineResult {
  slots: TimelineSlot[];
}

export function useTimeline(config: UseTimelineConfig): UseTimelineResult {
  const { date, events, startHour, endHour, intervalMinutes } = config;

  const slots = useMemo(
    () => buildTimelineModel({ date, events, startHour, endHour, intervalMinutes }).slots,
    [date, events, startHour, endHour, intervalMinutes],
  );

  return { slots };
}
