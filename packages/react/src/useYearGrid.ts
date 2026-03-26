import { useMemo } from 'react';
import { buildYearGridModel } from '@neo-reckoning/models';
import type { YearGridModelConfig } from '@neo-reckoning/models';
import type { YearMonth } from '@neo-reckoning/core';

export interface UseYearGridConfig extends YearGridModelConfig {}

export interface UseYearGridResult {
  /** Per-month activity data for heatmap-style rendering */
  months: YearMonth[];
}

/**
 * Year grid hook — computes lightweight per-day activity data for an entire year.
 * Returns rangeCount and rangeIds per day for heatmap-style rendering.
 */
export function useYearGrid(config: UseYearGridConfig): UseYearGridResult {
  const { year, ranges, userTimezone } = config;

  const months = useMemo(
    () => buildYearGridModel({ year, ranges, userTimezone }).months,
    [year, ranges, userTimezone],
  );

  return { months };
}
