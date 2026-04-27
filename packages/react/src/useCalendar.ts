import { useMemo, useCallback } from 'react';
import { buildCalendarModel, createCalendarController } from '@daywatch/cal-models';
import type { CalendarModelConfig } from '@daywatch/cal-models';
import type { Month } from '@daywatch/cal';

export interface UseCalendarConfig extends CalendarModelConfig {
  /** Called when navigation changes the focus date */
  onFocusDateChange: (date: string) => void;
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
  const model = useMemo(() => {
    return buildCalendarModel({
      focusDate: config.focusDate,
      numberOfMonths: config.numberOfMonths,
      ranges: config.ranges,
      weekStartsOn: config.weekStartsOn,
      locale: config.locale,
      userTimezone: config.userTimezone,
      fidelity: config.fidelity,
    });
  }, [
    config.focusDate,
    config.numberOfMonths,
    config.ranges,
    config.weekStartsOn,
    config.locale,
    config.userTimezone,
    config.fidelity,
  ]);

  const controller = useMemo(() => {
    return createCalendarController({
      focusDate: config.focusDate,
    });
  }, [config.focusDate]);

  const next = useCallback(() => {
    config.onFocusDateChange(controller.next());
  }, [config.onFocusDateChange, controller]);

  const prev = useCallback(() => {
    config.onFocusDateChange(controller.prev());
  }, [config.onFocusDateChange, controller]);

  const goTo = useCallback(
    (date: string) => {
      config.onFocusDateChange(controller.goTo(date));
    },
    [config.onFocusDateChange, controller],
  );

  return {
    months: model.months,
    focusDate: model.focusDate,
    numberOfMonths: model.numberOfMonths,
    next,
    prev,
    goTo,
  };
}
