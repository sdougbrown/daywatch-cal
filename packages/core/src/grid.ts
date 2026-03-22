import type {
  CalendarGridConfig,
  Month,
  Week,
  Day,
  DayRangeInfo,
  DateRange,
  ViewFidelity,
} from './types.js';
import { RangeEvaluator } from './evaluator.js';
import {
  parseDate,
  formatDate,
  daysInMonth,
  getToday,
} from './time.js';

/**
 * CalendarGrid — generates the data structure for rendering month-based
 * calendar views. Produces Month/Week/Day objects with range membership
 * pre-computed for each day.
 */
export class CalendarGrid {
  months: Month[];

  private focusDate: string;
  private numberOfMonths: number;
  private ranges: DateRange[];
  private weekStartsOn: number;
  private locale: string | undefined;
  private evaluator: RangeEvaluator;
  private fidelity: ViewFidelity;

  constructor(config: CalendarGridConfig) {
    this.focusDate = config.focusDate;
    this.numberOfMonths = config.numberOfMonths;
    this.ranges = config.ranges;
    this.weekStartsOn = config.weekStartsOn ?? 0;
    this.locale = config.locale;
    this.fidelity = config.fidelity ?? 'month';
    this.evaluator = new RangeEvaluator(config.userTimezone);
    this.months = this.generate();
  }

  /** Advance focus by one month and regenerate. */
  next(): void {
    this.focusDate = this.shiftMonth(this.focusDate, 1);
    this.months = this.generate();
  }

  /** Go back one month and regenerate. */
  prev(): void {
    this.focusDate = this.shiftMonth(this.focusDate, -1);
    this.months = this.generate();
  }

  /** Jump to a specific date and regenerate. */
  goTo(date: string): void {
    this.focusDate = date;
    this.months = this.generate();
  }

  /** Get the current focus date. */
  getFocusDate(): string {
    return this.focusDate;
  }

  /** Update the ranges and regenerate. */
  setRanges(ranges: DateRange[]): void {
    this.ranges = ranges;
    this.months = this.generate();
  }

  // === Private ===

  private generate(): Month[] {
    const months: Month[] = [];
    const { year, month } = parseDate(this.focusDate);
    const today = getToday();

    for (let i = 0; i < this.numberOfMonths; i++) {
      const d = new Date(year, month + i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      months.push(this.generateMonth(y, m, today));
    }

    return months;
  }

  private generateMonth(year: number, month: number, today: string): Month {
    const label = this.formatMonthLabel(year, month);
    const weeks = this.generateWeeks(year, month, today);

    return { year, month, label, weeks };
  }

  private generateWeeks(year: number, month: number, today: string): Week[] {
    const weeks: Week[] = [];
    const totalDays = daysInMonth(year, month);

    // Find the weekday of the 1st (0=Sun, 6=Sat)
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    // How many leading days from the previous month
    const leadingDays = (firstDayOfMonth - this.weekStartsOn + 7) % 7;

    // Build all day cells needed
    const dayCells: Day[] = [];

    // Previous month padding
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonthDays = daysInMonth(prevYear, prevMonth);
    for (let i = leadingDays - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const dateStr = formatDate(new Date(prevYear, prevMonth, day));
      dayCells.push(this.createDay(dateStr, day, false, today));
    }

    // Current month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = formatDate(new Date(year, month, day));
      dayCells.push(this.createDay(dateStr, day, true, today));
    }

    // Next month padding — fill to complete weeks
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    let nextDay = 1;
    while (dayCells.length % 7 !== 0) {
      const dateStr = formatDate(new Date(nextYear, nextMonth, nextDay));
      dayCells.push(this.createDay(dateStr, nextDay, false, today));
      nextDay++;
    }

    // Chunk into weeks
    for (let i = 0; i < dayCells.length; i += 7) {
      weeks.push({ days: dayCells.slice(i, i + 7) });
    }

    return weeks;
  }

  private createDay(dateStr: string, dayOfMonth: number, isCurrentMonth: boolean, today: string): Day {
    const fidelity = this.fidelity;

    if (fidelity === 'year') {
      // Year fidelity: only compute hasActivity, skip ranges[] and timeSlots[]
      const hasActivity = this.ranges.some(r => this.evaluator.isDateInRange(dateStr, r));
      return {
        date: dateStr,
        dayOfMonth,
        isCurrentMonth,
        isToday: dateStr === today,
        ranges: [],
        timeSlots: [],
        hasActivity,
      };
    }

    // Month, week, and day fidelity: compute ranges[]
    const ranges = this.evaluateRangesForDay(dateStr);

    // Week and day fidelity: also compute timeSlots[]
    const timeSlots = (fidelity === 'week' || fidelity === 'day')
      ? this.ranges.flatMap(r => this.evaluator.expandDay(r, dateStr))
      : [];

    return {
      date: dateStr,
      dayOfMonth,
      isCurrentMonth,
      isToday: dateStr === today,
      ranges,
      timeSlots,
    };
  }

  private evaluateRangesForDay(dateStr: string): DayRangeInfo[] {
    const infos: DayRangeInfo[] = [];

    for (const range of this.ranges) {
      if (!this.evaluator.isDateInRange(dateStr, range)) continue;

      // Check contiguous span boundaries
      const prevDate = this.shiftDay(dateStr, -1);
      const nextDate = this.shiftDay(dateStr, 1);
      const prevInRange = this.evaluator.isDateInRange(prevDate, range);
      const nextInRange = this.evaluator.isDateInRange(nextDate, range);

      infos.push({
        rangeId: range.id,
        label: range.label,
        isStart: !prevInRange,
        isEnd: !nextInRange,
        isContinuation: prevInRange && nextInRange,
        ...(range.displayType !== undefined ? { displayType: range.displayType } : {}),
      });
    }

    return infos;
  }

  private formatMonthLabel(year: number, month: number): string {
    const date = new Date(year, month, 1);
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long' };
    return new Intl.DateTimeFormat(this.locale, options).format(date);
  }

  private shiftMonth(dateStr: string, delta: number): string {
    const { year, month, day } = parseDate(dateStr);
    const d = new Date(year, month + delta, 1);
    // Clamp day to the new month's max
    const maxDay = daysInMonth(d.getFullYear(), d.getMonth());
    d.setDate(Math.min(day, maxDay));
    return formatDate(d);
  }

  private shiftDay(dateStr: string, delta: number): string {
    const { year, month, day } = parseDate(dateStr);
    const d = new Date(year, month, day + delta);
    return formatDate(d);
  }
}
