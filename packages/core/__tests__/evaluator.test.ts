import { RangeEvaluator } from '../src/evaluator.js';
import type { DateRange } from '../src/types.js';

// Use a fixed timezone for deterministic tests
const evaluator = new RangeEvaluator('America/New_York');
// Use UTC evaluator for floating/UTC time tests
const utcEvaluator = new RangeEvaluator('UTC');

function makeRange(overrides: Partial<DateRange>): DateRange {
  return {
    id: 'test-range',
    label: 'Test',
    ...overrides,
  };
}

describe('RangeEvaluator', () => {
  describe('isDateInRange — day-level evaluation', () => {
    it('matches explicit dates', () => {
      const range = makeRange({ dates: ['2026-03-21', '2026-03-25'] });
      expect(utcEvaluator.isDateInRange('2026-03-21', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-25', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-22', range)).toBe(false);
    });

    it('matches everyWeekday', () => {
      const range = makeRange({ everyWeekday: [1, 3, 5] }); // Mon, Wed, Fri
      // 2026-03-23 is Monday
      expect(utcEvaluator.isDateInRange('2026-03-23', range)).toBe(true);
      // 2026-03-25 is Wednesday
      expect(utcEvaluator.isDateInRange('2026-03-25', range)).toBe(true);
      // 2026-03-24 is Tuesday
      expect(utcEvaluator.isDateInRange('2026-03-24', range)).toBe(false);
    });

    it('matches everyDate (day of month)', () => {
      const range = makeRange({ everyDate: [1, 15] });
      expect(utcEvaluator.isDateInRange('2026-03-01', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-15', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-04-01', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-10', range)).toBe(false);
    });

    it('matches everyMonth', () => {
      const range = makeRange({ everyMonth: [3, 6] }); // March, June
      expect(utcEvaluator.isDateInRange('2026-03-15', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-06-15', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-04-15', range)).toBe(false);
    });

    it('combines day recurrence fields with AND logic', () => {
      // everyWeekday [1] (Monday) + everyMonth [3] (March)
      // = Mondays in March only
      const range = makeRange({ everyWeekday: [1], everyMonth: [3] });
      // 2026-03-02 is Monday in March
      expect(utcEvaluator.isDateInRange('2026-03-02', range)).toBe(true);
      // 2026-03-03 is Tuesday in March — wrong weekday
      expect(utcEvaluator.isDateInRange('2026-03-03', range)).toBe(false);
      // 2026-04-06 is Monday in April — wrong month
      expect(utcEvaluator.isDateInRange('2026-04-06', range)).toBe(false);
    });

    it('matches all days when no recurrence fields set (within bounds)', () => {
      const range = makeRange({
        fromDate: '2026-03-01',
        toDate: '2026-03-05',
      });
      expect(utcEvaluator.isDateInRange('2026-03-03', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-06', range)).toBe(false);
    });

    it('respects fromDate/toDate bounds', () => {
      const range = makeRange({
        everyWeekday: [1], // Mondays
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
      });
      // Monday March 2 — in bounds
      expect(utcEvaluator.isDateInRange('2026-03-02', range)).toBe(true);
      // Monday April 6 — out of bounds
      expect(utcEvaluator.isDateInRange('2026-04-06', range)).toBe(false);
    });

    it('respects fixedBetween', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-20',
      });
      expect(utcEvaluator.isDateInRange('2026-03-15', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-09', range)).toBe(false);
      expect(utcEvaluator.isDateInRange('2026-03-21', range)).toBe(false);
    });

    it('fixedBetween true with no bounds matches all queried days', () => {
      const range = makeRange({ fixedBetween: true });

      expect(utcEvaluator.isDateInRange('2026-03-09', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-15', range)).toBe(true);

      const occurrences = utcEvaluator.expand(range, new Date(2026, 2, 10), new Date(2026, 2, 12));
      expect(occurrences.map((o) => o.date)).toEqual(['2026-03-10', '2026-03-11', '2026-03-12']);
    });

    it('fixedBetween true overrides recurrence patterns', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
        everyWeekday: [1], // Monday
      });
      // 2026-03-10 is Tuesday, 2026-03-11 is Wednesday, etc.
      // fixedBetween should match every day in the window regardless of everyWeekday
      expect(utcEvaluator.isDateInRange('2026-03-10', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-11', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-12', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-13', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-14', range)).toBe(true);
      // Out of window should still be false
      expect(utcEvaluator.isDateInRange('2026-03-09', range)).toBe(false);
      expect(utcEvaluator.isDateInRange('2026-03-15', range)).toBe(false);
    });

    it('fixedBetween true overrides date and month recurrence patterns', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
        everyDate: [15],
        everyMonth: [4],
      });

      expect(utcEvaluator.isDateInRange('2026-03-10', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-11', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-14', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-15', range)).toBe(false);
    });

    it('fixedBetween true overrides explicit dates consistently', () => {
      const range = makeRange({
        dates: ['2026-03-10'],
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
      });

      expect(utcEvaluator.isDateInRange('2026-03-10', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-11', range)).toBe(true);

      const occurrences = utcEvaluator.expand(range, new Date(2026, 2, 10), new Date(2026, 2, 14));
      // dates: ['2026-03-10'] is ignored because fixedBetween: true overrides explicit dates;
      // all 5 window days (Mar 10–14) match via the fromDate/toDate range.
      expect(occurrences.map((o) => o.date)).toEqual([
        '2026-03-10',
        '2026-03-11',
        '2026-03-12',
        '2026-03-13',
        '2026-03-14',
      ]);
    });

    it('fixedBetween true with expand returns every day in window', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
        everyWeekday: [1], // Monday — should be ignored
      });
      const from = new Date(2026, 2, 10); // March 10, 2026
      const to = new Date(2026, 2, 14); // March 14, 2026
      const occurrences = utcEvaluator.expand(range, from, to);
      expect(occurrences.map((o) => o.date)).toEqual([
        '2026-03-10',
        '2026-03-11',
        '2026-03-12',
        '2026-03-13',
        '2026-03-14',
      ]);
    });

    it('fixedBetween true with time fields expands timed occurrences for every day', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-12',
        everyWeekday: [1], // ignored
        startTime: '09:00',
        endTime: '10:30',
      });

      const occurrences = utcEvaluator.expand(range, new Date(2026, 2, 10), new Date(2026, 2, 12));
      expect(occurrences.map((o) => [o.date, o.startTime, o.endTime, o.allDay])).toEqual([
        ['2026-03-10', '09:00', '10:30', false],
        ['2026-03-11', '09:00', '10:30', false],
        ['2026-03-12', '09:00', '10:30', false],
      ]);
    });

    it('fixedBetween true still respects exceptDates', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
        exceptDates: ['2026-03-12'],
      });
      expect(utcEvaluator.isDateInRange('2026-03-11', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-12', range)).toBe(false); // excluded
      expect(utcEvaluator.isDateInRange('2026-03-13', range)).toBe(true);

      const from = new Date(2026, 2, 10);
      const to = new Date(2026, 2, 14);
      const occurrences = utcEvaluator.expand(range, from, to);
      const dates = occurrences.map((o) => o.date);
      expect(dates).toEqual(['2026-03-10', '2026-03-11', '2026-03-13', '2026-03-14']);
    });

    it('fixedBetween true still respects exceptBetween', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
        exceptBetween: [['2026-03-11', '2026-03-13']],
      });
      expect(utcEvaluator.isDateInRange('2026-03-10', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-11', range)).toBe(false); // excluded
      expect(utcEvaluator.isDateInRange('2026-03-12', range)).toBe(false); // excluded
      expect(utcEvaluator.isDateInRange('2026-03-13', range)).toBe(false); // excluded
      expect(utcEvaluator.isDateInRange('2026-03-14', range)).toBe(true);

      const from = new Date(2026, 2, 10);
      const to = new Date(2026, 2, 14);
      const occurrences = utcEvaluator.expand(range, from, to);
      const dates = occurrences.map((o) => o.date);
      expect(dates).toEqual(['2026-03-10', '2026-03-14']);
    });

    it('fixedBetween true respects multiple exceptBetween ranges', () => {
      const range = makeRange({
        fixedBetween: true,
        fromDate: '2026-03-10',
        toDate: '2026-03-15',
        exceptBetween: [
          ['2026-03-11', '2026-03-12'],
          ['2026-03-14', '2026-03-14'],
        ],
      });
      expect(utcEvaluator.isDateInRange('2026-03-10', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-11', range)).toBe(false);
      expect(utcEvaluator.isDateInRange('2026-03-12', range)).toBe(false);
      expect(utcEvaluator.isDateInRange('2026-03-13', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-03-14', range)).toBe(false);
      expect(utcEvaluator.isDateInRange('2026-03-15', range)).toBe(true);

      const from = new Date(2026, 2, 10);
      const to = new Date(2026, 2, 15);
      const occurrences = utcEvaluator.expand(range, from, to);
      const dates = occurrences.map((o) => o.date);
      expect(dates).toEqual(['2026-03-10', '2026-03-13', '2026-03-15']);
    });

    describe('edge cases', () => {
      it('everyDate [31] skips months without 31 days', () => {
        const range = makeRange({ everyDate: [31] });
        // February has no 31st
        expect(utcEvaluator.isDateInRange('2026-02-28', range)).toBe(false);
        // March has 31st
        expect(utcEvaluator.isDateInRange('2026-03-31', range)).toBe(true);
        // April has no 31st
        expect(utcEvaluator.isDateInRange('2026-04-30', range)).toBe(false);
      });

      it('everyDate [29] skips non-leap February', () => {
        const range = makeRange({ everyDate: [29] });
        // 2026 is not a leap year
        expect(utcEvaluator.isDateInRange('2026-02-28', range)).toBe(false);
        // 2024 is a leap year
        expect(utcEvaluator.isDateInRange('2024-02-29', range)).toBe(true);
      });

      it('everyDate [31] + everyMonth [2] never fires', () => {
        const range = makeRange({ everyDate: [31], everyMonth: [2] });
        // February never has 31 days
        const from = new Date(2024, 0, 1);
        const to = new Date(2028, 11, 31);
        const occurrences = utcEvaluator.expand(range, from, to);
        expect(occurrences).toHaveLength(0);
      });
    });
  });

  describe('getTimeSlots — sub-day evaluation', () => {
    it('generates slots for everyHour', () => {
      const range = makeRange({
        everyHour: [6, 14, 22],
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      expect(slots).toHaveLength(3);
      expect(slots[0].startTime).toBe('06:00');
      expect(slots[1].startTime).toBe('14:00');
      expect(slots[2].startTime).toBe('22:00');
    });

    it('generates slots for everyHour with duration', () => {
      const range = makeRange({
        everyHour: [9, 17],
        duration: 30,
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      expect(slots).toHaveLength(2);
      expect(slots[0]).toMatchObject({
        startTime: '09:00',
        endTime: '09:30',
        duration: 30,
      });
      expect(slots[1]).toMatchObject({
        startTime: '17:00',
        endTime: '17:30',
        duration: 30,
      });
    });

    it('generates single time block for startTime + endTime', () => {
      const range = makeRange({
        startTime: '09:00',
        endTime: '17:00',
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      expect(slots).toHaveLength(1);
      expect(slots[0]).toMatchObject({
        startTime: '09:00',
        endTime: '17:00',
        duration: 480,
      });
    });

    it('generates repeating slots for startTime + repeatEvery', () => {
      const range = makeRange({
        startTime: '06:00',
        repeatEvery: 480, // every 8 hours
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      // 06:00, 14:00, 22:00
      expect(slots).toHaveLength(3);
      expect(slots[0].startTime).toBe('06:00');
      expect(slots[1].startTime).toBe('14:00');
      expect(slots[2].startTime).toBe('22:00');
    });

    it('respects endTime as boundary for repeatEvery', () => {
      const range = makeRange({
        startTime: '06:00',
        endTime: '18:00',
        repeatEvery: 240, // every 4 hours
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      // 06:00, 10:00, 14:00 (18:00 is exclusive boundary)
      expect(slots).toHaveLength(3);
      expect(slots[0].startTime).toBe('06:00');
      expect(slots[1].startTime).toBe('10:00');
      expect(slots[2].startTime).toBe('14:00');
    });

    it('stops at midnight for repeatEvery without endTime', () => {
      const range = makeRange({
        startTime: '22:00',
        repeatEvery: 180, // every 3 hours
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      // 22:00 only — next would be 01:00 which is past midnight
      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toBe('22:00');
    });

    it('returns empty for all-day ranges', () => {
      const range = makeRange({
        everyWeekday: [1, 2, 3, 4, 5],
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-23', range);
      expect(slots).toHaveLength(0);
    });

    it('cross-midnight slot sets endDate and endTime correctly', () => {
      const range = makeRange({
        startTime: '23:00',
        duration: 120,
      });
      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      expect(slots).toHaveLength(1);
      expect(slots[0]).toMatchObject({
        startTime: '23:00',
        endTime: '01:00',
        endDate: '2026-03-22',
        duration: 120,
      });
    });

    it('getTimedEntriesForDay computes endMinutes correctly for cross-midnight slots', () => {
      const range = makeRange({
        startTime: '23:00',
        duration: 120,
      });
      const entries = evaluator.getTimedEntriesForDay([range], '2026-03-21');
      expect(entries).toHaveLength(1);
      expect(entries[0].startMinutes).toBe(1380); // 23:00 = 23*60
      expect(entries[0].endMinutes).toBe(1500); // 01:00 next day = 1440 + 60
      expect(entries[0].slot.endDate).toBe('2026-03-22');
    });

    it('getTimedEntriesForDay emits a full-day entry for busy all-day ranges', () => {
      const range = makeRange({
        id: 'ooo',
        label: 'OOO',
        dates: ['2026-03-23'],
      });
      const entries = evaluator.getTimedEntriesForDay([range], '2026-03-23');
      expect(entries).toHaveLength(1);
      expect(entries[0].startMinutes).toBe(0);
      expect(entries[0].endMinutes).toBe(1440);
      expect(entries[0].allDay).toBe(true);
      expect(entries[0].slot.rangeId).toBe('ooo');
    });

    it('getTimedEntriesForDay skips transparent all-day ranges', () => {
      const range = makeRange({
        id: 'fyi',
        label: 'FYI',
        dates: ['2026-03-23'],
        transparency: 'transparent',
      });
      expect(evaluator.getTimedEntriesForDay([range], '2026-03-23')).toHaveLength(0);
    });
  });

  describe('everyHour + day recurrence (AND combination)', () => {
    it('combines everyWeekday with everyHour', () => {
      const range = makeRange({
        everyWeekday: [1, 3, 5], // Mon, Wed, Fri
        everyHour: [9, 17],
      });

      // Monday 2026-03-23 — should have time slots
      const mondaySlots = utcEvaluator.getTimeSlots('2026-03-23', range);
      expect(mondaySlots).toHaveLength(2);

      // Tuesday 2026-03-24 — day doesn't match, no slots
      expect(utcEvaluator.isDateInRange('2026-03-24', range)).toBe(false);
    });

    it('combines everyDate with startTime + repeatEvery', () => {
      const range = makeRange({
        everyDate: [1], // 1st of every month
        startTime: '08:00',
        repeatEvery: 120, // every 2 hours
        endTime: '14:00',
      });

      // March 1 — should have slots
      const slots = utcEvaluator.getTimeSlots('2026-03-01', range);
      expect(slots).toHaveLength(3); // 08:00, 10:00, 12:00

      // March 2 — day doesn't match
      expect(utcEvaluator.isDateInRange('2026-03-02', range)).toBe(false);
    });

    it('everyHour with no day fields means every day', () => {
      const range = makeRange({
        everyHour: [14], // 2pm every day
      });
      expect(utcEvaluator.isDateInRange('2026-03-21', range)).toBe(true);
      expect(utcEvaluator.isDateInRange('2026-06-15', range)).toBe(true);

      const slots = utcEvaluator.getTimeSlots('2026-03-21', range);
      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toBe('14:00');
    });
  });

  describe('expand', () => {
    it('treats metadata as opaque and leaves evaluation results unchanged', () => {
      const plainRange = makeRange({
        dates: ['2026-03-21'],
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
      });
      const metadata = {
        attendees: [{ email: 'alice@example.com', role: 'required', status: 'accepted' }],
        organizer: { email: 'organizer@example.com', name: 'Organizer' },
        location: 'Room 500',
      };
      const metadataRange = makeRange({
        ...plainRange,
        metadata,
      });

      expect(
        utcEvaluator.expand(
          metadataRange,
          new Date('2026-03-21T00:00:00Z'),
          new Date('2026-03-21T00:00:00Z'),
        ),
      ).toEqual(
        utcEvaluator.expand(
          plainRange,
          new Date('2026-03-21T00:00:00Z'),
          new Date('2026-03-21T00:00:00Z'),
        ),
      );
      expect(
        utcEvaluator.findFreeSlots([metadataRange], '2026-03-21', {
          minDuration: 30,
          dayStart: '08:00',
          dayEnd: '12:00',
        }),
      ).toEqual(
        utcEvaluator.findFreeSlots([plainRange], '2026-03-21', {
          minDuration: 30,
          dayStart: '08:00',
          dayEnd: '12:00',
        }),
      );
      expect(metadataRange.metadata).toEqual(metadata);
    });

    it('expands all-day range over a window', () => {
      const range = makeRange({
        everyWeekday: [1], // Mondays
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
      });

      const from = new Date(2026, 2, 1);
      const to = new Date(2026, 2, 31);
      const occurrences = utcEvaluator.expand(range, from, to);

      // Mondays in March 2026: 2, 9, 16, 23, 30
      expect(occurrences).toHaveLength(5);
      expect(occurrences[0]).toMatchObject({
        date: '2026-03-02',
        allDay: true,
        startTime: null,
      });
      expect(occurrences.every((o) => o.allDay)).toBe(true);
    });

    it('expands timed range over a window', () => {
      const range = makeRange({
        everyWeekday: [1, 3, 5], // Mon, Wed, Fri
        everyHour: [9, 17],
        fromDate: '2026-03-23',
        toDate: '2026-03-27',
      });

      const from = new Date(2026, 2, 23);
      const to = new Date(2026, 2, 27);
      const occurrences = utcEvaluator.expand(range, from, to);

      // Mon 23, Wed 25, Fri 27 × 2 hours each = 6
      expect(occurrences).toHaveLength(6);
      expect(occurrences[0]).toMatchObject({
        date: '2026-03-23',
        startTime: '09:00',
        allDay: false,
      });
    });

    it('carries range transparency onto occurrences and omits it when absent', () => {
      const transparentRange = makeRange({
        dates: ['2026-03-21'],
        startTime: '09:00',
        endTime: '10:00',
        transparency: 'transparent',
      });
      const plainRange = makeRange({
        dates: ['2026-03-21'],
        startTime: '09:00',
        endTime: '10:00',
      });

      const from = new Date(2026, 2, 21);
      const to = new Date(2026, 2, 21);

      const transparentOccurrences = utcEvaluator.expand(transparentRange, from, to);
      expect(transparentOccurrences).toHaveLength(1);
      expect(transparentOccurrences[0].transparency).toBe('transparent');

      const plainOccurrences = utcEvaluator.expand(plainRange, from, to);
      expect(plainOccurrences).toHaveLength(1);
      expect(plainOccurrences[0]).not.toHaveProperty('transparency');
    });

    it('carries transparency onto all-day occurrences', () => {
      const transparentRange = makeRange({
        dates: ['2026-03-21'],
        transparency: 'transparent',
      });

      const from = new Date(2026, 2, 21);
      const to = new Date(2026, 2, 21);

      const occurrences = utcEvaluator.expand(transparentRange, from, to);
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].allDay).toBe(true);
      expect(occurrences[0].transparency).toBe('transparent');
    });

    it('clips to query window when range is wider', () => {
      const range = makeRange({
        everyWeekday: [1], // Mondays
      });

      const from = new Date(2026, 2, 1);
      const to = new Date(2026, 2, 10);
      const occurrences = utcEvaluator.expand(range, from, to);

      // Mondays in Mar 1-10: 2nd, 9th
      expect(occurrences).toHaveLength(2);
    });

    it('handles explicit dates within window', () => {
      const range = makeRange({
        dates: ['2026-03-15', '2026-03-20', '2026-04-01'],
      });

      const from = new Date(2026, 2, 1);
      const to = new Date(2026, 2, 31);
      const occurrences = utcEvaluator.expand(range, from, to);

      // Only March dates in window
      expect(occurrences).toHaveLength(2);
      expect(occurrences[0].date).toBe('2026-03-15');
      expect(occurrences[1].date).toBe('2026-03-20');
    });

    it('returns empty for non-overlapping window', () => {
      const range = makeRange({
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      });

      const from = new Date(2026, 2, 1);
      const to = new Date(2026, 2, 31);
      const occurrences = utcEvaluator.expand(range, from, to);
      expect(occurrences).toHaveLength(0);
    });

    it('expands month-only recurrence without scanning non-matching months', () => {
      const range = makeRange({
        everyMonth: [2],
      });

      const from = new Date(2026, 0, 28);
      const to = new Date(2026, 2, 3);
      const occurrences = utcEvaluator.expand(range, from, to);

      expect(occurrences).toHaveLength(28);
      expect(occurrences[0].date).toBe('2026-02-01');
      expect(occurrences.at(-1)?.date).toBe('2026-02-28');
      expect(occurrences.every((o) => o.date.startsWith('2026-02-'))).toBe(true);
    });

    it('expands weekday + month recurrence over a broad window', () => {
      const range = makeRange({
        everyWeekday: [1], // Mondays
        everyMonth: [2, 3],
      });

      const from = new Date(2026, 0, 1);
      const to = new Date(2026, 2, 31);
      const occurrences = utcEvaluator.expand(range, from, to);

      expect(occurrences.map((o) => o.date)).toEqual([
        '2026-02-02',
        '2026-02-09',
        '2026-02-16',
        '2026-02-23',
        '2026-03-02',
        '2026-03-09',
        '2026-03-16',
        '2026-03-23',
        '2026-03-30',
      ]);
    });

    it('expands everyDate + weekday recurrence and keeps leap-year semantics', () => {
      const range = makeRange({
        everyDate: [29],
        everyWeekday: [4], // Thursday
      });

      const from = new Date(2024, 0, 1);
      const to = new Date(2024, 2, 31);
      const occurrences = utcEvaluator.expand(range, from, to);

      expect(occurrences.map((o) => o.date)).toEqual(['2024-02-29']);
    });

    it('includes endDate on cross-midnight occurrences', () => {
      const range = makeRange({
        dates: ['2026-03-21'],
        startTime: '23:00',
        duration: 120,
      });
      const from = new Date(2026, 2, 21);
      const to = new Date(2026, 3, 1);
      const occurrences = utcEvaluator.expand(range, from, to);
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].endTime).toBe('01:00');
      expect(occurrences[0].endDate).toBe('2026-03-22');
    });
  });

  describe('expandDay', () => {
    it('returns time slots for a day that matches', () => {
      const range = makeRange({
        everyWeekday: [1], // Monday
        everyHour: [9, 12, 17],
      });

      // 2026-03-23 is Monday
      const slots = utcEvaluator.expandDay(range, '2026-03-23');
      expect(slots).toHaveLength(3);
    });

    it('returns empty for a day that does not match', () => {
      const range = makeRange({
        everyWeekday: [1], // Monday
        everyHour: [9],
      });

      // 2026-03-24 is Tuesday
      const slots = utcEvaluator.expandDay(range, '2026-03-24');
      expect(slots).toHaveLength(0);
    });
  });

  describe('isInRange — combined day + time check', () => {
    it('returns true when datetime matches both day and time', () => {
      const range = makeRange({
        everyWeekday: [1], // Monday
        startTime: '09:00',
        endTime: '17:00',
      });

      // Monday March 23, 2026 at 12:00 — in range
      const dt = new Date(2026, 2, 23, 12, 0);
      expect(utcEvaluator.isInRange(dt, range)).toBe(true);
    });

    it('returns false when day matches but time does not', () => {
      const range = makeRange({
        everyWeekday: [1],
        startTime: '09:00',
        endTime: '17:00',
      });

      // Monday at 20:00 — outside time range
      const dt = new Date(2026, 2, 23, 20, 0);
      expect(utcEvaluator.isInRange(dt, range)).toBe(false);
    });

    it('returns false when time matches but day does not', () => {
      const range = makeRange({
        everyWeekday: [1], // Monday only
        startTime: '09:00',
        endTime: '17:00',
      });

      // Tuesday at 12:00
      const dt = new Date(2026, 2, 24, 12, 0);
      expect(utcEvaluator.isInRange(dt, range)).toBe(false);
    });

    it('returns true for all-day range when day matches', () => {
      const range = makeRange({
        everyWeekday: [1],
      });

      const dt = new Date(2026, 2, 23, 15, 30);
      expect(utcEvaluator.isInRange(dt, range)).toBe(true);
    });

    it('returns true for a datetime within a cross-midnight slot', () => {
      const range = makeRange({
        dates: ['2026-03-21'],
        startTime: '23:00',
        duration: 120,
      });
      const datetime = new Date(2026, 2, 21, 23, 30);
      expect(utcEvaluator.isInRange(datetime, range)).toBe(true);
    });

    it('returns false for a datetime at 00:30 on the same day (not in the cross-midnight slot)', () => {
      const range = makeRange({
        dates: ['2026-03-21'],
        startTime: '23:00',
        duration: 120,
      });
      const datetime = new Date(2026, 2, 21, 0, 30);
      expect(utcEvaluator.isInRange(datetime, range)).toBe(false);
    });
  });

  describe('timezone handling', () => {
    it('floating time (no timezone) passes through unchanged', () => {
      const range = makeRange({
        everyHour: [9],
        // No timezone — floating
      });
      const slots = evaluator.getTimeSlots('2026-03-21', range);
      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toBe('09:00'); // No conversion
    });

    it('UTC time gets converted to user timezone', () => {
      const range = makeRange({
        startTime: '14:00', // 2pm UTC
        endTime: '15:00',
        timezone: 'UTC',
      });
      // evaluator is set to America/New_York (UTC-4 in March = EDT)
      const slots = evaluator.getTimeSlots('2026-03-21', range);
      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toBe('10:00'); // 14:00 UTC = 10:00 EDT
    });

    it('returns no slots for same-timezone spring-forward gap times', () => {
      const range = makeRange({
        startTime: '02:30',
        timezone: 'America/New_York',
      });
      const slots = evaluator.getTimeSlots('2026-03-08', range);
      expect(slots).toHaveLength(0);
    });
  });
});
