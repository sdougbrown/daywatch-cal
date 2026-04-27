import { CalendarGrid } from '@daywatch/cal';
import type { DateRange, Month, ViewFidelity } from '@daywatch/cal';

export interface CalendarModelConfig {
  /** Current focus date (YYYY-MM-DD) */
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

export interface CalendarModel {
  /** The generated month grid data */
  months: Month[];
  /** Current focus date */
  focusDate: string;
  /** Number of months displayed */
  numberOfMonths: number;
}

export interface CalendarController {
  /** Navigate forward one month */
  next: () => string;
  /** Navigate backward one month */
  prev: () => string;
  /** Jump to a specific date */
  goTo: (date: string) => string;
}

export function buildCalendarModel(config: CalendarModelConfig): CalendarModel {
  const grid = new CalendarGrid({
    focusDate: config.focusDate,
    numberOfMonths: config.numberOfMonths,
    ranges: config.ranges,
    weekStartsOn: config.weekStartsOn,
    locale: config.locale,
    userTimezone: config.userTimezone,
    fidelity: config.fidelity,
  });

  return {
    months: grid.months,
    focusDate: config.focusDate,
    numberOfMonths: config.numberOfMonths,
  };
}

export function createCalendarController(config: { focusDate: string }): CalendarController {
  return {
    next: () => shiftMonth(config.focusDate, 1),
    prev: () => shiftMonth(config.focusDate, -1),
    goTo: (date: string) => date,
  };
}

export function shiftMonth(dateStr: string, delta: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  const maxDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, maxDay));

  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
