import { MonthTimeline } from '@daywatch/cal';
import type { DateRange, MonthSpanInfo, TimelineMonth } from '@daywatch/cal';

export interface MonthTimelineModelConfig {
  /** Window start, normalized internally to the first of the month */
  startDate: string;
  /** DateRanges to lay out across the timeline */
  ranges: DateRange[];
  /** Number of month columns to show. Required if endDate is not provided. */
  numberOfMonths?: number;
  /** Inclusive end of the window. Required if numberOfMonths is not provided. */
  endDate?: string;
  /** BCP 47 locale for Intl month label formatting */
  locale?: string;
  /** IANA timezone for range evaluation */
  userTimezone?: string;
}

export interface MonthTimelineModel {
  months: TimelineMonth[];
  spans: MonthSpanInfo[];
  getDatePosition: MonthTimeline['getDatePosition'];
}

export function buildMonthTimelineModel(config: MonthTimelineModelConfig): MonthTimelineModel {
  const timeline = new MonthTimeline(config);

  return {
    months: timeline.months,
    spans: timeline.spans,
    getDatePosition: timeline.getDatePosition.bind(timeline),
  };
}
