import { useState, useMemo, useCallback } from 'react';
import { CalendarGrid } from '@neo-reckoning/core';
import type { DateRange, CalendarGridConfig, Month, ViewFidelity } from '@neo-reckoning/core';

export interface UseCalendarConfig {
  /** Initial focus date (YYYY-MM-DD) */
  focusDate: string;
  /** Number of months to display */
  numberOfMonths: number;
  /** DateRanges to evaluate */
  ranges: DateRange[];
  /** Week start day: 0=Sunday, 1=Monday */
  weekStartsOn?: number;
  /** BCP 47 locale for formatting */
  locale?: string;
  /** User's timezone for range evaluation */
  userTimezone?: string;
  /** View fidelity level — controls detail computed per day. Default: 'month' */
  fidelity?: ViewFidelity;
}

export interface UseCalendarResult {
  /** The generated month grid data */
  months: Month[];
  /** Current focus date */
  focusDate: string;
  /** Number of months displayed */
  numberOfMonths: number;
  /** Navigate forward one month */
  next: () => void;
  /** Navigate backward one month */
  prev: () => void;
  /** Jump to a specific date */
  goTo: (date: string) => void;
}

/**
 * Core calendar hook — manages grid state and navigation.
 * Returns data structures only — no DOM rendering.
 */
export function useCalendar(config: UseCalendarConfig): UseCalendarResult {
  const [focusDate, setFocusDate] = useState(config.focusDate);

  const grid = useMemo(() => {
    return new CalendarGrid({
      focusDate,
      numberOfMonths: config.numberOfMonths,
      ranges: config.ranges,
      weekStartsOn: config.weekStartsOn,
      locale: config.locale,
      userTimezone: config.userTimezone,
      fidelity: config.fidelity,
    });
  }, [
    focusDate,
    config.numberOfMonths,
    config.ranges,
    config.weekStartsOn,
    config.locale,
    config.userTimezone,
    config.fidelity,
  ]);

  const next = useCallback(() => {
    grid.next();
    setFocusDate(grid.getFocusDate());
  }, [grid]);

  const prev = useCallback(() => {
    grid.prev();
    setFocusDate(grid.getFocusDate());
  }, [grid]);

  const goTo = useCallback((date: string) => {
    setFocusDate(date);
  }, []);

  return {
    months: grid.months,
    focusDate,
    numberOfMonths: config.numberOfMonths,
    next,
    prev,
    goTo,
  };
}
