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

describe('findConflicts', () => {
  it('two non-overlapping timed ranges → no conflicts', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'Morning',
      dates: ['2026-03-23'],
      startTime: '09:00',
      endTime: '10:00',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'Afternoon',
      dates: ['2026-03-23'],
      startTime: '14:00',
      endTime: '15:00',
    });

    const conflicts = evaluator.findConflicts([rangeA, rangeB], '2026-03-23');
    expect(conflicts).toHaveLength(0);
  });

  it('two overlapping timed ranges → one conflict with correct overlap window', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'Meeting A',
      dates: ['2026-03-23'],
      startTime: '09:00',
      endTime: '10:30',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'Meeting B',
      dates: ['2026-03-23'],
      startTime: '10:00',
      endTime: '11:00',
    });

    const conflicts = evaluator.findConflicts([rangeA, rangeB], '2026-03-23');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      rangeA: { id: 'a', label: 'Meeting A' },
      rangeB: { id: 'b', label: 'Meeting B' },
      date: '2026-03-23',
      overlapStart: '10:00',
      overlapEnd: '10:30',
    });
  });

  it('two all-day ranges on same day → no conflict', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'Holiday',
      dates: ['2026-03-23'],
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'Birthday',
      dates: ['2026-03-23'],
    });

    const conflicts = evaluator.findConflicts([rangeA, rangeB], '2026-03-23');
    expect(conflicts).toHaveLength(0);
  });

  it('all-day + timed range → no conflict', () => {
    const allDay = makeRange({
      id: 'a',
      label: 'Holiday',
      dates: ['2026-03-23'],
    });
    const timed = makeRange({
      id: 'b',
      label: 'Standup',
      dates: ['2026-03-23'],
      startTime: '09:00',
      endTime: '09:30',
    });

    const conflicts = evaluator.findConflicts([allDay, timed], '2026-03-23');
    expect(conflicts).toHaveLength(0);
  });

  it('three-way overlap → three conflicts (A-B, A-C, B-C)', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'A',
      dates: ['2026-03-23'],
      startTime: '09:00',
      endTime: '11:00',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'B',
      dates: ['2026-03-23'],
      startTime: '10:00',
      endTime: '12:00',
    });
    const rangeC = makeRange({
      id: 'c',
      label: 'C',
      dates: ['2026-03-23'],
      startTime: '10:30',
      endTime: '11:30',
    });

    const conflicts = evaluator.findConflicts([rangeA, rangeB, rangeC], '2026-03-23');
    expect(conflicts).toHaveLength(3);

    const pairIds = conflicts.map((c) => [c.rangeA.id, c.rangeB.id].sort().join('-'));
    expect(pairIds).toContain('a-b');
    expect(pairIds).toContain('a-c');
    expect(pairIds).toContain('b-c');
  });

  it('ranges on different days → no conflicts', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'Monday meeting',
      dates: ['2026-03-23'],
      startTime: '09:00',
      endTime: '10:00',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'Tuesday meeting',
      dates: ['2026-03-24'],
      startTime: '09:00',
      endTime: '10:00',
    });

    // Check Monday — only rangeA is present
    const conflictsMonday = evaluator.findConflicts([rangeA, rangeB], '2026-03-23');
    expect(conflictsMonday).toHaveLength(0);

    // Check Tuesday — only rangeB is present
    const conflictsTuesday = evaluator.findConflicts([rangeA, rangeB], '2026-03-24');
    expect(conflictsTuesday).toHaveLength(0);
  });

  it('adjacent but non-overlapping (9:00-10:00 and 10:00-11:00) → no conflict', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'First',
      dates: ['2026-03-23'],
      startTime: '09:00',
      endTime: '10:00',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'Second',
      dates: ['2026-03-23'],
      startTime: '10:00',
      endTime: '11:00',
    });

    const conflicts = evaluator.findConflicts([rangeA, rangeB], '2026-03-23');
    expect(conflicts).toHaveLength(0);
  });
});

describe('findConflictsInWindow', () => {
  it('finds conflicts across multiple days', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'Daily standup',
      fromDate: '2026-03-23',
      toDate: '2026-03-25',
      startTime: '09:00',
      endTime: '09:30',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'Overlapping meeting',
      dates: ['2026-03-24'],
      startTime: '09:00',
      endTime: '10:00',
    });

    const conflicts = evaluator.findConflictsInWindow(
      [rangeA, rangeB],
      new Date(2026, 2, 23),
      new Date(2026, 2, 25),
    );

    // Only March 24 has a conflict
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      date: '2026-03-24',
      overlapStart: '09:00',
      overlapEnd: '09:30',
    });
  });

  it('returns empty for window with no conflicts', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'Morning',
      fromDate: '2026-03-23',
      toDate: '2026-03-25',
      startTime: '09:00',
      endTime: '10:00',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'Afternoon',
      fromDate: '2026-03-23',
      toDate: '2026-03-25',
      startTime: '14:00',
      endTime: '15:00',
    });

    const conflicts = evaluator.findConflictsInWindow(
      [rangeA, rangeB],
      new Date(2026, 2, 23),
      new Date(2026, 2, 25),
    );

    expect(conflicts).toHaveLength(0);
  });
});
