import { RangeEvaluator } from '@daywatch/cal';
import type { DateRange, Occurrence } from '@daywatch/cal';

export interface RangeCheck {
  /** Check which ranges a datetime falls within */
  isInRange: (datetime: Date) => DateRange[];
  /** Expand all ranges within a window */
  getOccurrences: (from: Date, to: Date) => Occurrence[];
}

export function createRangeCheck(ranges: DateRange[], userTimezone?: string): RangeCheck {
  const evaluator = new RangeEvaluator(userTimezone);

  return {
    isInRange: (datetime: Date): DateRange[] => {
      return ranges.filter((range) => evaluator.isInRange(datetime, range));
    },
    getOccurrences: (from: Date, to: Date): Occurrence[] => {
      return ranges.flatMap((range) => evaluator.expand(range, from, to));
    },
  };
}
