import { useMemo } from 'react';
import { buildSpansModel } from '@neo-reckoning/models';
import type { SpansModelConfig } from '@neo-reckoning/models';
import type { SpanInfo } from '@neo-reckoning/core';

export interface UseSpansConfig extends SpansModelConfig {}

/**
 * Span computation hook — returns SpanInfo[] for overlap-aware rendering.
 * Computes contiguous spans, lane assignments, and overlap metrics.
 */
export function useSpans(config: UseSpansConfig): SpanInfo[] {
  const { ranges, from, to, userTimezone } = config;

  return useMemo(
    () => buildSpansModel({ ranges, from, to, userTimezone }),
    [ranges, from, to, userTimezone],
  );
}
