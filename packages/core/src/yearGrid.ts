import type {
  DateRange,
  YearGridConfig,
  YearMonth,
  YearDay,
} from './types.js';
import { RangeEvaluator } from './evaluator.js';
import { formatDate, daysInMonth } from './time.js';

/**
 * YearGrid — lightweight year-level grid for heatmap-style rendering.
 * No weeks, no time slots, no span tracking — just per-day activity data.
 */
export class YearGrid {
  months: YearMonth[];

  private year: number;
  private ranges: DateRange[];
  private evaluator: RangeEvaluator;

  constructor(config: YearGridConfig) {
    this.year = config.year;
    this.ranges = config.ranges;
    this.evaluator = new RangeEvaluator(config.userTimezone);
    this.months = this.generate();
  }

  private generate(): YearMonth[] {
    const months: YearMonth[] = [];

    for (let month = 0; month < 12; month++) {
      months.push(this.generateMonth(month));
    }

    return months;
  }

  private generateMonth(month: number): YearMonth {
    const label = this.formatMonthLabel(month);
    const totalDays = daysInMonth(this.year, month);
    const days: YearDay[] = [];
    let activeDays = 0;

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = formatDate(new Date(this.year, month, day));
      const matchingRangeIds: string[] = [];

      for (const range of this.ranges) {
        if (this.evaluator.isDateInRange(dateStr, range)) {
          matchingRangeIds.push(range.id);
        }
      }

      if (matchingRangeIds.length > 0) {
        activeDays++;
      }

      days.push({
        date: dateStr,
        dayOfMonth: day,
        rangeCount: matchingRangeIds.length,
        rangeIds: matchingRangeIds,
      });
    }

    return {
      month,
      label,
      activeDays,
      totalDays,
      days,
    };
  }

  private formatMonthLabel(month: number): string {
    const date = new Date(this.year, month, 1);
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
  }
}
