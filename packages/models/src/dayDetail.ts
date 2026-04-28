import { RangeEvaluator } from '@daywatch/cal';
import type { DateRange, TimeSlot, DayRangeInfo } from '@daywatch/cal';

export interface DayDetailModel {
  /** Sub-day time slots for the given day */
  timeSlots: TimeSlot[];
  /** All-day range memberships */
  allDayRanges: DayRangeInfo[];
}

export function buildDayDetailModel(
  date: string,
  ranges: DateRange[],
  userTimezone?: string,
): DayDetailModel {
  const evaluator = new RangeEvaluator(userTimezone);

  const timeSlots: TimeSlot[] = [];
  const allDayRanges: DayRangeInfo[] = [];

  for (const range of ranges) {
    if (!evaluator.isDateInRange(date, range)) continue;

    const slots = evaluator.expandDay(range, date);
    if (slots.length > 0) {
      timeSlots.push(...slots);
    } else {
      const prevDate = shiftDay(date, -1);
      const nextDate = shiftDay(date, 1);
      const prevInRange = evaluator.isDateInRange(prevDate, range);
      const nextInRange = evaluator.isDateInRange(nextDate, range);

      allDayRanges.push({
        rangeId: range.id,
        label: range.label,
        isStart: !prevInRange,
        isEnd: !nextInRange,
        isContinuation: prevInRange && nextInRange,
      });
    }
  }

  timeSlots.sort((a, b) => {
    const aMin = parseInt(a.startTime.split(':')[0]) * 60 + parseInt(a.startTime.split(':')[1]);
    const bMin = parseInt(b.startTime.split(':')[0]) * 60 + parseInt(b.startTime.split(':')[1]);
    return aMin - bMin;
  });

  return { timeSlots, allDayRanges };
}

function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
