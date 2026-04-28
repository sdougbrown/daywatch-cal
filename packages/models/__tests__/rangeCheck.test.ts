import { RangeEvaluator } from '@daywatch/cal';
import type { DateRange } from '@daywatch/cal';
import { createRangeCheck } from '../src/rangeCheck.js';

describe('createRangeCheck', () => {
  it('matches RangeEvaluator for point-in-time checks and occurrence expansion', () => {
    const range: DateRange = {
      id: 'range-1',
      label: 'Morning focus',
      everyWeekday: [1],
      startTime: '09:00',
      endTime: '10:00',
    };
    const evaluator = new RangeEvaluator();
    const rangeCheck = createRangeCheck([range]);
    const datetime = new Date(2026, 2, 23, 9, 30);
    const from = new Date('2026-03-23T00:00:00.000Z');
    const to = new Date('2026-03-24T00:00:00.000Z');

    expect(rangeCheck.isInRange(datetime)).toEqual(
      evaluator.isInRange(datetime, range) ? [range] : [],
    );
    expect(rangeCheck.getOccurrences(from, to)).toEqual(evaluator.expand(range, from, to));
  });
});
