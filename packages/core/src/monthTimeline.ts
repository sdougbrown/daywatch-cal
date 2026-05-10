import type { DateRange, MonthSpanInfo, MonthTimelineConfig, TimelineMonth } from './types.js';
import { RangeEvaluator } from './evaluator.js';
import { buildDate, compareDates, daysInMonth, formatDate, parseDate } from './time.js';

interface ResolvedMonth {
  year: number;
  month: number;
}

interface RawMonthSpan {
  rangeId: string;
  label: string;
  displayType?: string;
  startDate: string;
  endDate: string;
  startMonthIndex: number;
  endMonthIndex: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

/**
 * MonthTimeline — month-column layout data for horizontal timeline views.
 */
export class MonthTimeline {
  months: TimelineMonth[];
  spans: MonthSpanInfo[];

  private ranges: DateRange[];
  private evaluator: RangeEvaluator;

  constructor(config: MonthTimelineConfig) {
    this.ranges = config.ranges;
    this.evaluator = new RangeEvaluator(config.userTimezone);

    const resolvedMonths = this.resolveWindow(config);
    this.months = this.generateMonths(resolvedMonths, config.locale);
    this.spans = this.computeMonthSpans();
  }

  /**
   * Returns the column index and fractional offset (0–1) for a specific date
   * within the timeline. Returns null if the date falls outside the window.
   */
  getDatePosition(date: string): { monthIndex: number; fraction: number } | null {
    const month = this.months.find((m) => date >= m.startDate && date <= m.endDate);
    if (!month) return null;

    const { year, month: monthIndex, day } = parseDate(date);
    const total = daysInMonth(year, monthIndex);

    return {
      monthIndex: month.index,
      fraction: (day - 1) / total,
    };
  }

  private resolveWindow(config: MonthTimelineConfig): ResolvedMonth[] {
    const { startDate, numberOfMonths, endDate } = config;

    if (numberOfMonths === undefined && endDate === undefined) {
      throw new Error('MonthTimeline: provide numberOfMonths or endDate (or both)');
    }

    if (numberOfMonths !== undefined && numberOfMonths < 1) {
      throw new Error('MonthTimeline: numberOfMonths must be >= 1');
    }

    const { year: startYear, month: startMonth } = parseDate(startDate);

    if (endDate !== undefined) {
      const { year: endYear, month: endMonth } = parseDate(endDate);
      const count = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

      if (count < 1) {
        throw new Error('MonthTimeline: endDate must be on or after startDate');
      }

      return this.monthRange(startYear, startMonth, count);
    }

    return this.monthRange(startYear, startMonth, numberOfMonths!);
  }

  private monthRange(startYear: number, startMonth: number, count: number): ResolvedMonth[] {
    const result: ResolvedMonth[] = [];

    for (let i = 0; i < count; i++) {
      const totalMonths = startMonth + i;
      result.push({
        year: startYear + Math.floor(totalMonths / 12),
        month: totalMonths % 12,
      });
    }

    return result;
  }

  private generateMonths(window: ResolvedMonth[], locale?: string): TimelineMonth[] {
    return window.map(({ year, month }, index) => {
      const firstDay = new Date(year, month, 1);
      const lastDay = daysInMonth(year, month);

      return {
        index,
        month,
        year,
        label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(firstDay),
        fullLabel: new Intl.DateTimeFormat(locale, { month: 'long' }).format(firstDay),
        startDate: formatDate(firstDay),
        endDate: formatDate(new Date(year, month, lastDay)),
      };
    });
  }

  private computeMonthSpans(): MonthSpanInfo[] {
    if (this.months.length === 0 || this.ranges.length === 0) return [];

    const windowStart = this.months[0].startDate;
    const windowEnd = this.months[this.months.length - 1].endDate;
    const rawSpans: RawMonthSpan[] = [];

    for (const range of this.ranges) {
      const resolved = this.evaluator.computeSpans(
        [range],
        buildDate(windowStart, null),
        buildDate(windowEnd, null),
      );

      for (const span of resolved) {
        const startMonthIndex = this.dateToMonthIndex(span.startDate);
        const endMonthIndex = this.dateToMonthIndex(span.endDate);

        if (startMonthIndex === null || endMonthIndex === null) continue;

        rawSpans.push({
          rangeId: span.rangeId,
          label: span.label,
          ...(span.displayType !== undefined ? { displayType: span.displayType } : {}),
          startDate: span.startDate,
          endDate: span.endDate,
          startMonthIndex,
          endMonthIndex,
          clippedStart: range.fromDate ? compareDates(range.fromDate, windowStart) < 0 : false,
          clippedEnd: range.toDate ? compareDates(range.toDate, windowEnd) > 0 : false,
        });
      }
    }

    if (rawSpans.length === 0) return [];

    const sortedSpans = [...rawSpans].sort((a, b) => {
      const startCmp = compareDates(a.startDate, b.startDate);
      if (startCmp !== 0) return startCmp;
      return compareDates(a.endDate, b.endDate);
    });
    const laneEndDates: string[] = [];

    return sortedSpans.map((span) => {
      let lane = laneEndDates.findIndex((endDate) => compareDates(endDate, span.startDate) < 0);

      if (lane === -1) {
        lane = laneEndDates.length;
        laneEndDates.push(span.endDate);
      } else {
        laneEndDates[lane] = span.endDate;
      }

      return {
        rangeId: span.rangeId,
        label: span.label,
        ...(span.displayType !== undefined ? { displayType: span.displayType } : {}),
        startMonthIndex: span.startMonthIndex,
        endMonthIndex: span.endMonthIndex,
        clippedStart: span.clippedStart,
        clippedEnd: span.clippedEnd,
        lane,
      };
    });
  }

  private dateToMonthIndex(date: string): number | null {
    const { year, month } = parseDate(date);
    return this.months.find((m) => m.year === year && m.month === month)?.index ?? null;
  }
}
