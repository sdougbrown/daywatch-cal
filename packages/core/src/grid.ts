import type {
  CalendarGridConfig,
  Month,
  Week,
  Day,
  DayRangeInfo,
  DateRange,
  TimeSlot,
  ViewFidelity,
} from './types.js';
import { RangeEvaluator } from './evaluator.js';
import { compareDates, parseDate, formatDate, daysInMonth, getToday } from './time.js';

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

  private static readonly EMPTY_RANGES: DateRange[] = [];
  private static readonly EMPTY_RANGE_SET = new Set<DateRange>();
  private static readonly EMPTY_TIME_SLOTS: TimeSlot[] = [];

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
    const { year, month } = parseDate(this.focusDate);
    const today = getToday();
    const monthLayouts: Array<{
      year: number;
      month: number;
      label: string;
      dayCells: Array<{ date: string; dayOfMonth: number; isCurrentMonth: boolean }>;
    }> = [];
    const displayDates: string[] = [];

    for (let i = 0; i < this.numberOfMonths; i++) {
      const d = new Date(year, month + i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const layout = this.buildMonthLayout(y, m);
      monthLayouts.push(layout);
      displayDates.push(...layout.dayCells.map((day) => day.date));
    }

    const dayContext = this.buildDayContext(displayDates);

    return monthLayouts.map((layout) => ({
      year: layout.year,
      month: layout.month,
      label: layout.label,
      weeks: this.chunkWeeks(
        layout.dayCells.map((day) =>
          this.createDay(day.date, day.dayOfMonth, day.isCurrentMonth, today, dayContext),
        ),
      ),
    }));
  }

  private buildMonthLayout(
    year: number,
    month: number,
  ): {
    year: number;
    month: number;
    label: string;
    dayCells: Array<{ date: string; dayOfMonth: number; isCurrentMonth: boolean }>;
  } {
    const totalDays = daysInMonth(year, month);

    // Find the weekday of the 1st (0=Sun, 6=Sat)
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    // How many leading days from the previous month
    const leadingDays = (firstDayOfMonth - this.weekStartsOn + 7) % 7;

    // Build all day cells needed
    const dayCells: Array<{ date: string; dayOfMonth: number; isCurrentMonth: boolean }> = [];

    // Previous month padding
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonthDays = daysInMonth(prevYear, prevMonth);
    for (let i = leadingDays - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const dateStr = formatDate(new Date(prevYear, prevMonth, day));
      dayCells.push({ date: dateStr, dayOfMonth: day, isCurrentMonth: false });
    }

    // Current month
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = formatDate(new Date(year, month, day));
      dayCells.push({ date: dateStr, dayOfMonth: day, isCurrentMonth: true });
    }

    // Next month padding — fill to complete weeks
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    let nextDay = 1;
    while (dayCells.length % 7 !== 0) {
      const dateStr = formatDate(new Date(nextYear, nextMonth, nextDay));
      dayCells.push({ date: dateStr, dayOfMonth: nextDay, isCurrentMonth: false });
      nextDay++;
    }

    return {
      year,
      month,
      label: this.formatMonthLabel(year, month),
      dayCells,
    };
  }

  private chunkWeeks(dayCells: Day[]): Week[] {
    const weeks: Week[] = [];

    for (let i = 0; i < dayCells.length; i += 7) {
      weeks.push({ days: dayCells.slice(i, i + 7) });
    }

    return weeks;
  }

  private createDay(
    dateStr: string,
    dayOfMonth: number,
    isCurrentMonth: boolean,
    today: string,
    dayContext: {
      rangesByDate: Map<string, DateRange[]>;
      rangeSetByDate: Map<string, Set<DateRange>>;
    },
  ): Day {
    const fidelity = this.fidelity;
    const matchingRanges = dayContext.rangesByDate.get(dateStr) ?? CalendarGrid.EMPTY_RANGES;

    if (fidelity === 'year') {
      // Year fidelity: only compute hasActivity, skip ranges[] and timeSlots[]
      const hasActivity = matchingRanges.length > 0;
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
    const ranges = this.evaluateRangesForDay(dateStr, matchingRanges, dayContext.rangeSetByDate);

    // Week and day fidelity: also compute timeSlots[]
    const timeSlots =
      fidelity === 'week' || fidelity === 'day'
        ? matchingRanges.flatMap((r) => this.evaluator.getTimeSlots(dateStr, r))
        : CalendarGrid.EMPTY_TIME_SLOTS;

    return {
      date: dateStr,
      dayOfMonth,
      isCurrentMonth,
      isToday: dateStr === today,
      ranges,
      timeSlots,
    };
  }

  private evaluateRangesForDay(
    dateStr: string,
    matchingRanges: readonly DateRange[],
    rangeSetByDate: Map<string, Set<DateRange>>,
  ): DayRangeInfo[] {
    const infos: DayRangeInfo[] = [];
    const prevRangeSet =
      rangeSetByDate.get(this.shiftDay(dateStr, -1)) ?? CalendarGrid.EMPTY_RANGE_SET;
    const nextRangeSet =
      rangeSetByDate.get(this.shiftDay(dateStr, 1)) ?? CalendarGrid.EMPTY_RANGE_SET;

    for (const range of matchingRanges) {
      const prevInRange = prevRangeSet.has(range);
      const nextInRange = nextRangeSet.has(range);

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

  private buildDayContext(displayDates: string[]): {
    rangesByDate: Map<string, DateRange[]>;
    rangeSetByDate: Map<string, Set<DateRange>>;
  } {
    const rangesByDate = new Map<string, DateRange[]>();
    const rangeSetByDate = new Map<string, Set<DateRange>>();

    if (displayDates.length === 0 || this.ranges.length === 0) {
      return { rangesByDate, rangeSetByDate };
    }

    let minDate = displayDates[0];
    let maxDate = displayDates[0];
    for (const dateStr of displayDates) {
      if (compareDates(dateStr, minDate) < 0) minDate = dateStr;
      if (compareDates(dateStr, maxDate) > 0) maxDate = dateStr;
    }

    const contextFrom = this.shiftDay(minDate, -1);
    const contextTo = this.shiftDay(maxDate, 1);

    for (const range of this.ranges) {
      const matchingDates = this.evaluator.getMatchingDates(range, contextFrom, contextTo);

      for (const dateStr of matchingDates) {
        const dateRanges = rangesByDate.get(dateStr);
        if (dateRanges) {
          dateRanges.push(range);
        } else {
          rangesByDate.set(dateStr, [range]);
        }

        const rangeSet = rangeSetByDate.get(dateStr);
        if (rangeSet) {
          rangeSet.add(range);
        } else {
          rangeSetByDate.set(dateStr, new Set([range]));
        }
      }
    }

    return { rangesByDate, rangeSetByDate };
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
