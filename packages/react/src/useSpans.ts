import { useMemo } from 'react';
import { RangeEvaluator } from '@neo-reckoning/core';
import type { DateRange, SpanInfo } from '@neo-reckoning/core';

export interface UseSpansConfig {
  /** DateRanges to compute spans for */
  ranges: DateRange[];
  /** Start of the window */
  from: Date;
  /** End of the window */
  to: Date;
  /** User's timezone for range evaluation */
  userTimezone?: string;
}

/**
 * Span computation hook — returns SpanInfo[] for overlap-aware rendering.
 * Computes contiguous spans, lane assignments, and overlap metrics.
 */
export function useSpans(config: UseSpansConfig): SpanInfo[] {
  const { ranges, from, to, userTimezone } = config;

  const evaluator = useMemo(
    () => new RangeEvaluator(userTimezone),
    [userTimezone],
  );

  const spans = useMemo(
    () => evaluator.computeSpans(ranges, from, to),
    [evaluator, ranges, from, to],
  );

  return spans;
}
