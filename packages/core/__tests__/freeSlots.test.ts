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

describe('RangeEvaluator.findFreeSlots', () => {
  it('returns one big free slot for an empty schedule', () => {
    const slots = evaluator.findFreeSlots([], '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '18:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '18:00',
        duration: 600,
      },
    ]);
  });

  it('returns full day free slot with default boundaries for empty schedule', () => {
    const slots = evaluator.findFreeSlots([], '2026-03-22');
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '00:00',
        endTime: '24:00',
        duration: 1440,
      },
    ]);
  });

  it('finds free slots before and after a single range (9:00-10:00)', () => {
    const ranges = [
      makeRange({
        id: 'meeting',
        dates: ['2026-03-22'],
        startTime: '09:00',
        endTime: '10:00',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '18:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '09:00',
        duration: 60,
      },
      {
        date: '2026-03-22',
        startTime: '10:00',
        endTime: '18:00',
        duration: 480,
      },
    ]);
  });

  it('finds no gap between back-to-back ranges (9-10, 10-11)', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '09:00',
        endTime: '10:00',
      }),
      makeRange({
        id: 'b',
        dates: ['2026-03-22'],
        startTime: '10:00',
        endTime: '11:00',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '12:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '09:00',
        duration: 60,
      },
      {
        date: '2026-03-22',
        startTime: '11:00',
        endTime: '12:00',
        duration: 60,
      },
    ]);
  });

  it('merges overlapping ranges (9-11, 10-12) — free before 9 and after 12', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '09:00',
        endTime: '11:00',
      }),
      makeRange({
        id: 'b',
        dates: ['2026-03-22'],
        startTime: '10:00',
        endTime: '12:00',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '14:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '09:00',
        duration: 60,
      },
      {
        date: '2026-03-22',
        startTime: '12:00',
        endTime: '14:00',
        duration: 120,
      },
    ]);
  });

  it('filters out small gaps with minDuration', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '09:00',
        endTime: '09:50',
      }),
      makeRange({
        id: 'b',
        dates: ['2026-03-22'],
        startTime: '10:00',
        endTime: '11:00',
      }),
    ];
    // The 10-minute gap (09:50-10:00) should be excluded with minDuration=15
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '12:00',
      minDuration: 15,
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '09:00',
        duration: 60,
      },
      {
        date: '2026-03-22',
        startTime: '11:00',
        endTime: '12:00',
        duration: 60,
      },
    ]);
  });

  it('includes small gaps when minDuration is low enough', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '09:00',
        endTime: '09:50',
      }),
      makeRange({
        id: 'b',
        dates: ['2026-03-22'],
        startTime: '10:00',
        endTime: '11:00',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '12:00',
      minDuration: 5,
    });
    expect(slots).toHaveLength(3);
    expect(slots[1]).toEqual({
      date: '2026-03-22',
      startTime: '09:50',
      endTime: '10:00',
      duration: 10,
    });
  });

  it('respects custom dayStart and dayEnd boundaries', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '07:00',
        endTime: '08:00',
      }),
      makeRange({
        id: 'b',
        dates: ['2026-03-22'],
        startTime: '16:00',
        endTime: '20:00',
      }),
    ];
    // Only looking at 09:00-17:00, so 07-08 is outside and 16-20 partially overlaps
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '09:00',
      dayEnd: '17:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '09:00',
        endTime: '16:00',
        duration: 420,
      },
    ]);
  });

  it('busy all-day ranges occupy the full day, leaving no free slots', () => {
    const ranges = [
      makeRange({ id: 'holiday', dates: ['2026-03-22'] }), // all-day, no startTime/endTime
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '18:00',
    });
    expect(slots).toEqual([]);
  });

  it('transparent all-day ranges do not occupy the day', () => {
    const ranges = [
      makeRange({
        id: 'fyi',
        dates: ['2026-03-22'],
        transparency: 'transparent',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '18:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '18:00',
        duration: 600,
      },
    ]);
  });

  it('busy all-day ranges not covering the queried date leave the day free', () => {
    const ranges = [makeRange({ id: 'holiday', dates: ['2026-03-23'] })];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '18:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '18:00',
        duration: 600,
      },
    ]);
  });

  it('handles multiple gaps in a day', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '09:00',
        endTime: '10:00',
      }),
      makeRange({
        id: 'b',
        dates: ['2026-03-22'],
        startTime: '11:00',
        endTime: '12:00',
      }),
      makeRange({
        id: 'c',
        dates: ['2026-03-22'],
        startTime: '14:00',
        endTime: '15:00',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '17:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '09:00',
        duration: 60,
      },
      {
        date: '2026-03-22',
        startTime: '10:00',
        endTime: '11:00',
        duration: 60,
      },
      {
        date: '2026-03-22',
        startTime: '12:00',
        endTime: '14:00',
        duration: 120,
      },
      {
        date: '2026-03-22',
        startTime: '15:00',
        endTime: '17:00',
        duration: 120,
      },
    ]);
  });

  it('returns empty when schedule is fully booked', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '08:00',
        endTime: '18:00',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '18:00',
    });
    expect(slots).toEqual([]);
  });

  it('ignores ranges that do not match the date', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-23'],
        startTime: '09:00',
        endTime: '10:00',
      }),
    ];
    const slots = evaluator.findFreeSlots(ranges, '2026-03-22', {
      dayStart: '08:00',
      dayEnd: '18:00',
    });
    expect(slots).toEqual([
      {
        date: '2026-03-22',
        startTime: '08:00',
        endTime: '18:00',
        duration: 600,
      },
    ]);
  });

  it('marks pre-midnight time as occupied for cross-midnight ranges', () => {
    const range = makeRange({
      dates: ['2026-03-21'],
      startTime: '23:00',
      duration: 120,
    });
    const slots = evaluator.findFreeSlots([range], '2026-03-21', {
      dayStart: '00:00',
      dayEnd: '24:00',
      minDuration: 15,
    });
    const lateFree = slots.find((s) => s.startTime >= '23:00' && s.startTime < '24:00');
    expect(lateFree).toBeUndefined();
    expect(slots.length).toBeGreaterThanOrEqual(1);
    expect(slots[0].startTime.localeCompare('23:00')).toBeLessThan(0);
  });
});

describe('RangeEvaluator.findNextFreeSlot', () => {
  it('returns the first slot that fits the requested duration', () => {
    const ranges = [
      makeRange({
        id: 'a',
        fromDate: '2026-03-22',
        toDate: '2026-03-22',
        startTime: '09:00',
        endTime: '17:00',
      }),
    ];
    // Day 1 (2026-03-22) is booked 9-17, but 08:00-09:00 is only 60 min.
    // We need 120 min, so the first fit within 08-18 window is 17:00-18:00 = 60 min (not enough).
    // Day 2 (2026-03-23) is completely free.
    const slot = evaluator.findNextFreeSlot(
      ranges,
      new Date(2026, 2, 22),
      new Date(2026, 2, 24),
      120,
      { dayStart: '08:00', dayEnd: '18:00' },
    );
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe('2026-03-23');
    expect(slot!.duration).toBeGreaterThanOrEqual(120);
  });

  it('returns a slot on the first day if it fits', () => {
    const ranges = [
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '09:00',
        endTime: '10:00',
      }),
    ];
    const slot = evaluator.findNextFreeSlot(
      ranges,
      new Date(2026, 2, 22),
      new Date(2026, 2, 24),
      30,
      { dayStart: '08:00', dayEnd: '18:00' },
    );
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe('2026-03-22');
    expect(slot!.startTime).toBe('08:00');
    expect(slot!.endTime).toBe('09:00');
    expect(slot!.duration).toBe(60);
  });

  it('returns null when no slot fits in the entire window', () => {
    const ranges = [
      makeRange({
        id: 'a',
        fromDate: '2026-03-22',
        toDate: '2026-03-23',
        startTime: '08:00',
        endTime: '18:00',
      }),
    ];
    const slot = evaluator.findNextFreeSlot(
      ranges,
      new Date(2026, 2, 22),
      new Date(2026, 2, 23),
      120,
      { dayStart: '08:00', dayEnd: '18:00' },
    );
    expect(slot).toBeNull();
  });

  it('searches across multiple days to find a fit', () => {
    const ranges = [
      // Day 1: nearly full
      makeRange({
        id: 'a',
        dates: ['2026-03-22'],
        startTime: '08:00',
        endTime: '17:30',
      }),
      // Day 2: morning booked
      makeRange({
        id: 'b',
        dates: ['2026-03-23'],
        startTime: '08:00',
        endTime: '12:00',
      }),
    ];
    // Need 60 min. Day 1 has 30 min free (17:30-18:00), not enough.
    // Day 2 has 12:00-18:00 = 360 min free. Should pick that.
    const slot = evaluator.findNextFreeSlot(
      ranges,
      new Date(2026, 2, 22),
      new Date(2026, 2, 25),
      60,
      { dayStart: '08:00', dayEnd: '18:00' },
    );
    expect(slot).not.toBeNull();
    expect(slot!.date).toBe('2026-03-23');
    expect(slot!.startTime).toBe('12:00');
  });
});
