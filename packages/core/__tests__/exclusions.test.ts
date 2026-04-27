import { RangeEvaluator } from '../src/evaluator.js';
import type { DateRange } from '../src/types.js';

const evaluator = new RangeEvaluator('UTC');

function makeRange(overrides: Partial<DateRange>): DateRange {
  return {
    id: 'test-range',
    label: 'Test',
    ...overrides,
  };
}

describe('Date exclusions', () => {
  describe('exceptDates', () => {
    it('excludes specific dates from an all-day range', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
        exceptDates: ['2026-03-15', '2026-03-20'],
      });
      expect(evaluator.isDateInRange('2026-03-14', range)).toBe(true);
      expect(evaluator.isDateInRange('2026-03-15', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-03-16', range)).toBe(true);
      expect(evaluator.isDateInRange('2026-03-20', range)).toBe(false);
    });

    it('excludes specific dates from a recurring range', () => {
      const range = makeRange({
        everyWeekday: [1], // Every Monday
        exceptDates: ['2026-03-09'], // Skip this Monday
      });
      // 2026-03-02 is Monday
      expect(evaluator.isDateInRange('2026-03-02', range)).toBe(true);
      // 2026-03-09 is Monday but excluded
      expect(evaluator.isDateInRange('2026-03-09', range)).toBe(false);
      // 2026-03-16 is Monday
      expect(evaluator.isDateInRange('2026-03-16', range)).toBe(true);
    });

    it('excludes dates from an explicit dates list', () => {
      const range = makeRange({
        dates: ['2026-03-01', '2026-03-05', '2026-03-10'],
        exceptDates: ['2026-03-05'],
      });
      expect(evaluator.isDateInRange('2026-03-01', range)).toBe(true);
      expect(evaluator.isDateInRange('2026-03-05', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-03-10', range)).toBe(true);
    });

    it('does not affect dates not in the range', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-10',
        exceptDates: ['2026-04-01'], // Outside the range anyway
      });
      expect(evaluator.isDateInRange('2026-04-01', range)).toBe(false);
    });

    it('empty exceptDates has no effect', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
        exceptDates: [],
      });
      expect(evaluator.isDateInRange('2026-03-15', range)).toBe(true);
    });
  });

  describe('exceptBetween', () => {
    it('excludes a date window from a bounded range', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
        exceptBetween: [['2026-03-10', '2026-03-15']],
      });
      expect(evaluator.isDateInRange('2026-03-09', range)).toBe(true);
      expect(evaluator.isDateInRange('2026-03-10', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-03-12', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-03-15', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-03-16', range)).toBe(true);
    });

    it('supports multiple exclusion windows', () => {
      const range = makeRange({
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        exceptBetween: [
          ['2026-03-10', '2026-03-15'], // Spring break
          ['2026-07-01', '2026-07-14'], // Summer vacation
        ],
      });
      expect(evaluator.isDateInRange('2026-03-12', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-05-01', range)).toBe(true);
      expect(evaluator.isDateInRange('2026-07-07', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-07-15', range)).toBe(true);
    });

    it('excludes a window from a recurring range', () => {
      const range = makeRange({
        everyWeekday: [1, 3, 5], // Mon/Wed/Fri
        exceptBetween: [['2026-03-09', '2026-03-20']],
      });
      // 2026-03-06 is Friday — before exclusion
      expect(evaluator.isDateInRange('2026-03-06', range)).toBe(true);
      // 2026-03-09 is Monday — in exclusion window
      expect(evaluator.isDateInRange('2026-03-09', range)).toBe(false);
      // 2026-03-11 is Wednesday — in exclusion window
      expect(evaluator.isDateInRange('2026-03-11', range)).toBe(false);
      // 2026-03-20 is Friday — last day of exclusion (inclusive)
      expect(evaluator.isDateInRange('2026-03-20', range)).toBe(false);
      // 2026-03-23 is Monday — after exclusion
      expect(evaluator.isDateInRange('2026-03-23', range)).toBe(true);
    });

    it('single-day exclusion window works', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
        exceptBetween: [['2026-03-15', '2026-03-15']],
      });
      expect(evaluator.isDateInRange('2026-03-14', range)).toBe(true);
      expect(evaluator.isDateInRange('2026-03-15', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-03-16', range)).toBe(true);
    });
  });

  describe('exceptDates + exceptBetween combined', () => {
    it('both exclusion types work together', () => {
      const range = makeRange({
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        exceptDates: ['2026-06-01'],
        exceptBetween: [['2026-03-10', '2026-03-15']],
      });
      expect(evaluator.isDateInRange('2026-03-12', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-06-01', range)).toBe(false);
      expect(evaluator.isDateInRange('2026-06-02', range)).toBe(true);
    });
  });

  describe('exclusions in expand()', () => {
    it('excluded dates are omitted from expanded occurrences', () => {
      const range = makeRange({
        everyWeekday: [1], // Every Monday
        exceptDates: ['2026-03-09'],
      });
      const from = new Date(2026, 2, 1);
      const to = new Date(2026, 2, 31);
      const occurrences = evaluator.expand(range, from, to);
      const dates = occurrences.map((o) => o.date);

      expect(dates).toContain('2026-03-02');
      expect(dates).not.toContain('2026-03-09');
      expect(dates).toContain('2026-03-16');
      expect(dates).toContain('2026-03-23');
      expect(dates).toContain('2026-03-30');
    });

    it('excluded windows are omitted from expanded occurrences', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-10',
        exceptBetween: [['2026-03-04', '2026-03-06']],
      });
      const from = new Date(2026, 2, 1);
      const to = new Date(2026, 2, 10);
      const occurrences = evaluator.expand(range, from, to);
      const dates = occurrences.map((o) => o.date);

      expect(dates).toEqual([
        '2026-03-01',
        '2026-03-02',
        '2026-03-03',
        // 04, 05, 06 excluded
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
        '2026-03-10',
      ]);
    });
  });

  describe('exclusions in computeSpans()', () => {
    it('exclusion window splits a contiguous span', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-10',
        exceptBetween: [['2026-03-04', '2026-03-06']],
      });
      const from = new Date(2026, 2, 1);
      const to = new Date(2026, 2, 10);
      const spans = evaluator.computeSpans([range], from, to);

      expect(spans).toHaveLength(2);
      expect(spans[0].startDate).toBe('2026-03-01');
      expect(spans[0].endDate).toBe('2026-03-03');
      expect(spans[0].length).toBe(3);
      expect(spans[1].startDate).toBe('2026-03-07');
      expect(spans[1].endDate).toBe('2026-03-10');
      expect(spans[1].length).toBe(4);
    });
  });

  describe('exclusions with timed ranges', () => {
    it('excluded date produces no time slots', () => {
      const range = makeRange({
        everyWeekday: [1, 3, 5],
        startTime: '09:00',
        endTime: '17:00',
        exceptDates: ['2026-03-11'], // Wednesday
      });

      // Wednesday March 11 is excluded — no time slots
      expect(evaluator.isDateInRange('2026-03-11', range)).toBe(false);
      const slots = evaluator.expandDay(range, '2026-03-11');
      expect(slots).toHaveLength(0);

      // Friday March 13 is not excluded — has time slot
      expect(evaluator.isDateInRange('2026-03-13', range)).toBe(true);
      const fridaySlots = evaluator.expandDay(range, '2026-03-13');
      expect(fridaySlots).toHaveLength(1);
      expect(fridaySlots[0].startTime).toBe('09:00');
    });
  });
});
