import { RangeEvaluator } from '../src/evaluator.js';
import { scoreSchedule } from '../src/scoring.js';
import type { DateRange } from '../src/types.js';

const evaluator = new RangeEvaluator('UTC');

function makeRange(overrides: Partial<DateRange>): DateRange {
  return {
    id: 'test-range',
    label: 'Test',
    ...overrides,
  };
}

function day(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

describe('scoreSchedule', () => {
  describe('empty schedule', () => {
    it('returns 0 conflicts, full free time, max focus blocks for single day', () => {
      const score = scoreSchedule(evaluator, [], day('2026-03-23'), day('2026-03-23'));
      expect(score.conflicts).toBe(0);
      // 09:00-17:00 = 480 minutes free
      expect(score.freeMinutes).toBe(480);
      // The entire 480-min block is one focus block (>= 60 min)
      expect(score.focusBlocks).toBe(1);
      expect(score.avgContextSwitches).toBe(0);
      expect(score.conflictDays).toBe(0);
    });

    it('returns full free time across multi-day window', () => {
      const score = scoreSchedule(evaluator, [], day('2026-03-23'), day('2026-03-25'));
      // 3 days * 480 min
      expect(score.freeMinutes).toBe(1440);
      expect(score.focusBlocks).toBe(3);
    });
  });

  describe('non-overlapping timed ranges', () => {
    it('returns 0 conflicts and correct free time', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'Morning',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '09:00',
        endTime: '10:00',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'Afternoon',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '14:00',
        endTime: '15:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB],
        day('2026-03-23'),
        day('2026-03-23'),
      );
      expect(score.conflicts).toBe(0);
      expect(score.conflictDays).toBe(0);
      // 480 total - 60 (a) - 60 (b) = 360 free
      expect(score.freeMinutes).toBe(360);
    });
  });

  describe('overlapping ranges', () => {
    it('detects correct conflict count and conflictDays', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'Meeting A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '10:00',
        endTime: '11:30',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'Meeting B',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '11:00',
        endTime: '12:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB],
        day('2026-03-23'),
        day('2026-03-23'),
      );
      expect(score.conflicts).toBe(1);
      expect(score.conflictDays).toBe(1);
    });

    it('counts multiple conflicts on same day', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '10:00',
        endTime: '12:00',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '11:00',
        endTime: '13:00',
      });
      const rangeC = makeRange({
        id: 'c',
        label: 'C',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '11:30',
        endTime: '14:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB, rangeC],
        day('2026-03-23'),
        day('2026-03-23'),
      );
      // A overlaps B, A overlaps C, B overlaps C = 3 conflicts
      expect(score.conflicts).toBe(3);
      expect(score.conflictDays).toBe(1);
    });
  });

  describe('focus block detection', () => {
    it('90min gap with 60min threshold counts as 1 focus block', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '09:00',
        endTime: '10:00',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '11:30',
        endTime: '17:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB],
        day('2026-03-23'),
        day('2026-03-23'),
      );
      // Gap from 10:00-11:30 = 90min >= 60 → 1 focus block
      // No gap before 09:00 (day starts at 09:00), no gap after 17:00
      expect(score.focusBlocks).toBe(1);
    });

    it('45min gap with 60min threshold counts as 0 focus blocks', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '09:00',
        endTime: '10:00',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '10:45',
        endTime: '17:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB],
        day('2026-03-23'),
        day('2026-03-23'),
      );
      // Gap from 10:00-10:45 = 45min < 60 → 0 focus blocks
      expect(score.focusBlocks).toBe(0);
    });
  });

  describe('context switch counting', () => {
    it('A then B then A counts as 2 switches', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '09:00',
        endTime: '10:00',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '10:00',
        endTime: '11:00',
      });
      const rangeA2 = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '11:00',
        endTime: '12:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB, rangeA2],
        day('2026-03-23'),
        day('2026-03-23'),
      );
      // A→B→A = 2 switches
      expect(score.avgContextSwitches).toBe(2);
    });

    it('same range consecutive has 0 switches', () => {
      const rangeA1 = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '09:00',
        endTime: '10:00',
      });
      const rangeA2 = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '11:00',
        endTime: '12:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA1, rangeA2],
        day('2026-03-23'),
        day('2026-03-23'),
      );
      expect(score.avgContextSwitches).toBe(0);
    });
  });

  describe('multi-day window aggregation', () => {
    it('aggregates conflicts across days', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-24',
        startTime: '10:00',
        endTime: '11:00',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-23',
        toDate: '2026-03-24',
        startTime: '10:30',
        endTime: '11:30',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB],
        day('2026-03-23'),
        day('2026-03-24'),
      );
      // 1 conflict per day * 2 days
      expect(score.conflicts).toBe(2);
      expect(score.conflictDays).toBe(2);
    });

    it('averages context switches across days', () => {
      // Day 1: A then B → 1 switch; Day 2: A then B → 1 switch
      const rangeA = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-24',
        startTime: '09:00',
        endTime: '10:00',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-23',
        toDate: '2026-03-24',
        startTime: '10:00',
        endTime: '11:00',
      });

      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB],
        day('2026-03-23'),
        day('2026-03-24'),
      );
      // Total switches: 2, days: 2, avg: 1
      expect(score.avgContextSwitches).toBe(1);
    });

    it('sums free minutes across days', () => {
      const range = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-25',
        startTime: '09:00',
        endTime: '10:00',
      });

      const score = scoreSchedule(evaluator, [range], day('2026-03-23'), day('2026-03-25'));
      // Each day: 480 - 60 = 420 free min; 3 days = 1260
      expect(score.freeMinutes).toBe(1260);
    });
  });

  describe('custom dayStart/dayEnd', () => {
    it('uses custom working hours for free time calculation', () => {
      const score = scoreSchedule(evaluator, [], day('2026-03-23'), day('2026-03-23'), {
        dayStart: '08:00',
        dayEnd: '18:00',
      });
      // 10 hours = 600 minutes free
      expect(score.freeMinutes).toBe(600);
      expect(score.focusBlocks).toBe(1);
    });

    it('clips slots to working hours', () => {
      const range = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '07:00',
        endTime: '10:00',
      });

      const score = scoreSchedule(evaluator, [range], day('2026-03-23'), day('2026-03-23'), {
        dayStart: '09:00',
        dayEnd: '17:00',
      });
      // Only 09:00-10:00 counts as occupied (clipped from 07:00-10:00)
      expect(score.freeMinutes).toBe(420); // 480 - 60
    });

    it('handles ranges outside working hours entirely', () => {
      const range = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '06:00',
        endTime: '07:00',
      });

      const score = scoreSchedule(evaluator, [range], day('2026-03-23'), day('2026-03-23'));
      // Range is entirely outside 09:00-17:00
      expect(score.freeMinutes).toBe(480);
      expect(score.focusBlocks).toBe(1);
    });
  });

  describe('all-day ranges', () => {
    it('all-day ranges do not affect time-level scoring', () => {
      const range = makeRange({
        id: 'a',
        label: 'Holiday',
        dates: ['2026-03-23'],
        // No startTime/endTime → all-day
      });

      const score = scoreSchedule(evaluator, [range], day('2026-03-23'), day('2026-03-23'));
      // All-day ranges produce no time slots, so no impact on scoring
      expect(score.conflicts).toBe(0);
      expect(score.freeMinutes).toBe(480);
      expect(score.focusBlocks).toBe(1);
      expect(score.avgContextSwitches).toBe(0);
    });
  });

  describe('custom focusBlockMinutes', () => {
    it('counts blocks with lower threshold', () => {
      const rangeA = makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '09:00',
        endTime: '09:30',
      });
      const rangeB = makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-23',
        toDate: '2026-03-23',
        startTime: '10:00',
        endTime: '10:30',
      });

      // Gap 09:30-10:00 = 30 min, gap 10:30-17:00 = 390 min
      const score = scoreSchedule(
        evaluator,
        [rangeA, rangeB],
        day('2026-03-23'),
        day('2026-03-23'),
        { focusBlockMinutes: 30 },
      );
      // 30min gap qualifies, 390min gap qualifies → 2 blocks
      expect(score.focusBlocks).toBe(2);
    });
  });
});
